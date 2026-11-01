import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { UserSearch, PreparedSearch, SearchHandle } from 'usersearch-sdk';

const ref = '5f0c7a3e-1b2d-4c3e-8f40-9a1b2c3d4e5f';
const key = Buffer.alloc(32, 7).toString('base64url');
const input = { type: 'email', value: 'person@example.com', sources: ['epieos', 'predicta'] };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'x-request-id': 'test-request', ...headers } });
const done = { ref, status: 'completed', type: 'email', sources: { epieos: { status: 'failed', error: { code: 'PROVIDER_ERROR' } }, predicta: { status: 'completed', found: true } }, results: { accounts: [{ platform: 'example', sources: ['predicta'] }] } };
function client(fetch) { return new UserSearch({ apiKey: 'test-key', fetch, maxRetries: 1 }); }

test('multi-source submission preserves exact body and keys across retry', async () => {
  const calls = [];
  const sdk = client(async (url, options) => {
    calls.push({ url, ...options });
    if (calls.length === 1) return json({ code: 'SERVICE_UNAVAILABLE', charged: null }, 503, { 'retry-after': '0' });
    return json({ ref, status: 'pending', results_url: 'https://attacker.invalid/' }, 202);
  });
  const prepared = sdk.prepare(input);
  const { handle } = await sdk.submit(prepared);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, calls[1].body);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.deepEqual(JSON.parse(calls[0].body).sources, input.sources);
  assert.equal(handle.export().key, prepared.export().body.key);
  assert.equal(calls[0].redirect, 'error');
  assert.ok(!JSON.stringify(prepared).includes(prepared.export().body.key));
  assert.ok(!JSON.stringify(handle).includes(handle.export().key));
});

test('terminal results cached and concurrent reads coalesced; caller mutation isolated', async () => {
  let count = 0;
  const sdk = client(async (url, options) => {
    count++;
    assert.ok(url.startsWith('https://public-api.usersearch.ai/v1/search/results?ref='));
    assert.ok(!url.includes(key));
    assert.equal(options.headers['X-Result-Key'], key);
    return json(done);
  });
  const handle = new SearchHandle({ ref, key });
  const [a, b] = await Promise.all([sdk.results(handle), sdk.results(handle)]);
  a.data.results.accounts.length = 0;
  assert.equal(b.data.results.accounts.length, 1);
  assert.equal((await sdk.results(handle)).data.results.accounts.length, 1);
  assert.equal(count, 1);
});

test('ambiguous collection is never automatically retried', async () => {
  let count = 0;
  const sdk = client(async () => { count++; throw new Error('network lost'); });
  const handle = new SearchHandle({ ref, key });
  await assert.rejects(sdk.wait(handle), e => e.code === 'DELIVERY_UNCERTAIN' && e.handle === handle);
  assert.equal(count, 1);
});

test('health failure remains readable; errors carry request ID and charge information', async () => {
  const sdk = client(async () => json({ status: 'fail', search_service: { status: 'down' } }, 503, { 'content-type': 'application/health+json' }));
  assert.equal((await sdk.health()).data.status, 'fail');
  const bad = client(async () => json({ code: 'IP_NOT_ALLOWED', charged: false, detail: 'IP refused' }, 403));
  await assert.rejects(bad.balance(), e => e.code === 'IP_NOT_ALLOWED' && e.charged === false && e.requestId === 'test-request');
});

test('wait honors server polling interval and keeps source failures', async () => {
  const times = [];
  const sdk = client(async () => { times.push(Date.now()); return times.length === 1 ? json({ ref, status: 'running' }, 200, { 'retry-after': '0.03' }) : json(done); });
  const result = await sdk.wait(new SearchHandle({ ref, key }), { pollIntervalMs: 1 });
  assert.ok(times[1] - times[0] >= 25);
  assert.equal(result.data.sources.epieos.status, 'failed');
});

test('expired preparations rejected locally; exported state can be restored', async () => {
  const sdk = client(async () => { throw new Error('must not call'); });
  const prepared = sdk.prepare(input);
  const snapshot = prepared.export();
  assert.deepEqual(new PreparedSearch(snapshot).export(), snapshot);
  snapshot.createdAt -= 24 * 3600000;
  await assert.rejects(sdk.submit(new PreparedSearch(snapshot)), e => e.code === 'PREPARATION_EXPIRED');
});

test('submit errors preserve preparation for recovery', async () => {
  const sdk = client(async () => json({ code: 'INVALID_QUERY', charged: false }, 422));
  const p = sdk.prepare(input);
  await assert.rejects(sdk.submit(p), e => e.prepared === p && e.charged === false);
});

test('deadline stops waiting and preserves handle', async () => {
  const sdk = client(async () => json({ ref, status: 'running' }));
  const handle = new SearchHandle({ ref, key });
  await assert.rejects(sdk.wait(handle, { timeoutMs: 20 }), e => e.handle === handle);
});

test('rejects empty sources and unsafe origins; cost never submits', async () => {
  assert.throws(() => new UserSearch({ apiKey: 'x', baseUrl: 'http://example.com' }));
  assert.throws(() => new UserSearch({ apiKey: 'x', baseUrl: 'https://example.com/path' }));
  const sdk = client(async (url, options) => {
    assert.ok(url.endsWith('/v1/cost'));
    assert.equal(JSON.parse(options.body).key, undefined);
    return json({ cost: 100, balance: 200 });
  });
  assert.throws(() => sdk.prepare({ ...input, sources: [] }));
  assert.equal((await sdk.cost(input)).data.cost, 100);
});

test('one-call search uses generated credentials, polls, and returns final result', async () => {
  const urls = [];
  const sdk = client(async url => { urls.push(url); return url.endsWith('/submit') ? json({ ref }, 202) : json(done); });
  assert.equal((await sdk.search(input)).data.status, 'completed');
  assert.equal(urls.length, 2);
});

test('all search types map to API fields without altering input', () => {
  const sdk = client(() => {});
  for (const type of ['email', 'username', 'phone', 'image']) {
    const original = { type, value: type === 'image' ? 'data:image/png;base64,AAAA' : 'example' };
    const body = sdk.prepare(original).export().body;
    assert.equal(body[type === 'image' ? 'image' : 'query'], original.value);
    assert.equal(original.key, undefined);
  }
});

test('native fetch interoperates with local HTTP API and blocks redirects', async () => {
  const received = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    received.push({ url: req.url, headers: req.headers, body });
    if (req.url === '/v1/balance') {
      res.writeHead(302, { location: '/credential-sink' }); res.end(); return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/search/submit') { res.statusCode = 202; res.end(JSON.stringify({ ref })); }
    else res.end(JSON.stringify(done));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const sdk = new UserSearch({ apiKey: 'synthetic-key', baseUrl: `http://127.0.0.1:${server.address().port}`, maxRetries: 0 });
    assert.equal((await sdk.search(input)).data.status, 'completed');
    assert.equal(received[0].headers['x-api-key'], 'synthetic-key');
    assert.deepEqual(JSON.parse(received[0].body).sources, input.sources);
    assert.equal(received[1].headers['x-result-key'], JSON.parse(received[0].body).key);
    await assert.rejects(sdk.balance(), e => e.code === 'TRANSPORT_ERROR');
    assert.ok(!received.some(r => r.url === '/credential-sink'));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('structured collection rate limits recover, but malformed success is uncertain', async () => {
  let calls = 0;
  const sdk = client(async () => ++calls === 1 ? json({ code: 'RATE_LIMITED', charged: false }, 429, { 'retry-after': '0' }) : json(done));
  assert.equal((await sdk.wait(new SearchHandle({ ref, key }), { pollIntervalMs: 1 })).data.status, 'completed');
  assert.equal(calls, 2);
  const malformed = client(async () => new Response('<html>bad gateway</html>', { status: 200 }));
  await assert.rejects(malformed.results(new SearchHandle({ ref, key })), e => e.code === 'DELIVERY_UNCERTAIN');
});

test('aborted before submit makes no network call and retains preparation', async () => {
  let calls = 0;
  const sdk = client(async () => { calls++; return json({ ref }); });
  const p = sdk.prepare(input);
  await assert.rejects(sdk.submit(p, { signal: AbortSignal.abort() }), e => e.prepared === p);
  assert.equal(calls, 0);
});
