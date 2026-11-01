import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import UserSearch, { VERSION, UserSearchError, AuthenticationError, PermissionError, InvalidRequestError, RateLimitError, APIError, ConnectionError, DeliveryUncertainError } from '../index.js';
const ref = '5f0c7a3e-1b2d-4c3e-8f40-9a1b2c3d4e5f';
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });

test('merged contract JSON health failure is returned without retry; Problem Details still throws', async () => {
  let calls = 0;
  const client = new UserSearch({ apiKey: 'test', fetch: async () => { calls++; return json({ status: 'fail', search_service: { status: 'down' } }, 503); } });
  assert.equal((await client.health()).data.status, 'fail'); assert.equal(calls, 1);
  const failed = new UserSearch({ apiKey: 'test', maxRetries: 0, fetch: async () => json({ code: 'SERVICE_UNAVAILABLE' }, 503, { 'content-type': 'application/problem+json' }) });
  await assert.rejects(failed.health(), e => e instanceof APIError && e.status === 503);
});

test('error subclasses preserve base class, diagnostics and redact JSON output', async () => {
  for (const [status, Type] of [[401, AuthenticationError], [403, PermissionError], [422, InvalidRequestError], [429, RateLimitError], [500, APIError]]) {
    const client = new UserSearch({ apiKey: 'test', maxRetries: 0, fetch: async () => json({ code: 'EXAMPLE', detail: 'sensitive-query', charged: false }, status, { 'x-request-id': 'req-1' }) });
    await assert.rejects(client.balance(), e => {
      assert.ok(e instanceof Type && e instanceof UserSearchError);
      assert.equal(e.requestId, 'req-1'); assert.equal(e.charged, false);
      assert.ok(!JSON.stringify(e).includes('sensitive-query')); return true;
    });
  }
});

test('per-request retries and timeout override client settings; transport failure has a distinct type', async () => {
  let calls = 0;
  const client = new UserSearch({ apiKey: 'test', maxRetries: 2, fetch: async () => { calls++; throw new Error('lost'); } });
  await assert.rejects(client.balance({ maxRetries: 0 }), ConnectionError); assert.equal(calls, 1);
  const slow = new UserSearch({ apiKey: 'test', timeoutMs: 30000, fetch: async (_, { signal }) => new Promise((_, reject) => {
    const guard = setTimeout(() => reject(new Error('test guard')), 1000);
    signal.addEventListener('abort', () => { clearTimeout(guard); reject(signal.reason); }, { once: true });
  }) });
  const start = Date.now();
  await assert.rejects(slow.balance({ requestTimeoutMs: 10, maxRetries: 0 }), ConnectionError);
  assert.ok(Date.now() - start < 900);
});

test('202 without key retains generated key and respects first Retry-After', async () => {
  let acceptedAt, submittedKey;
  const client = new UserSearch({ apiKey: 'test', fetch: async (url, options) => {
    assert.equal(options.headers['User-Agent'], `usersearch-sdk/${VERSION}`);
    if (url.endsWith('/submit')) { submittedKey = JSON.parse(options.body).key; acceptedAt = Date.now(); return json({ ref }, 202, { 'retry-after': '0.03' }); }
    assert.ok(Date.now() - acceptedAt >= 25); assert.equal(options.headers['X-Result-Key'], submittedKey);
    return json({ ref, status: 'completed', results: { breaches: [{ account_count: 42 }], matches: [{ score: 0.92 }], summary: { names: [{ value: 'Demo', breaches: ['Example'] }] } } });
  } });
  const result = await client.search({ type: 'email', value: 'example@example.com' });
  assert.equal(result.data.results.breaches[0].account_count, 42);
  assert.equal(result.data.results.matches[0].score, 0.92);
});

test('unsupported internal request options cannot replace method/body/headers', async () => {
  const client = new UserSearch({ apiKey: 'test', fetch: async (_, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined); assert.equal(options.headers['X-API-Key'], 'test'); return json({ balance: 1 });
  } });
  await client.balance({ method: 'POST', body: { query: 'bad' }, headers: { 'X-API-Key': 'other' } });
});

test('package and runtime SDK versions stay in sync', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.version, VERSION); assert.equal(pkg.private, true);
});

test('collection failure retains dedicated uncertainty error', async () => {
  const client = new UserSearch({ apiKey: 'test', fetch: async url => url.endsWith('/submit') ? json({ ref }, 202) : Promise.reject(new Error('lost')) });
  await assert.rejects(client.search({ type: 'email', query: 'a@example.com' }), e => e instanceof DeliveryUncertainError && Boolean(e.handle));
});

test('invalid polling settings are rejected before any paid submission', async () => {
  const client = new UserSearch({ apiKey: 'test', fetch: async () => { assert.fail('must not contact API'); } });
  for (const options of [{ timeoutMs: -1 }, { pollIntervalMs: 0 }, { onProgress: 'invalid' }])
    await assert.rejects(client.search({ type: 'email', query: 'a@example.com' }, options), TypeError);
});
