import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UserSearch, SearchHandle } from '../index.js';
const ref = '5f0c7a3e-1b2d-4c3e-8f40-9a1b2c3d4e5f';
const input = { type: 'email', query: 'example@example.com' };
function store() {
  const values = new Map(), locks = new Set();
  return { values, load: async id => structuredClone(values.get(id)), save: async (id, data) => { values.set(id, structuredClone(data)); }, withLock: async (id, fn) => {
    if (locks.has(id)) throw Object.assign(new Error('busy'), { code: 'COLLECTION_BUSY' });
    locks.add(id); try { return await fn(); } finally { locks.delete(id); }
  } };
}
const json = data => new Response(JSON.stringify(data));
test('job preparation saved before submit; fresh client resumes same keys after lost response', async () => {
  const resultStore = store(); let body, token;
  const first = new UserSearch({ apiKey: 'test', resultStore, maxRetries: 0, fetch: async (_, options) => {
    assert.equal(resultStore.values.size, 1); body = options.body; token = options.headers['Idempotency-Key']; throw new Error('lost');
  } });
  await assert.rejects(first.runJob('order-1', input), e => e.jobId === 'order-1');
  let calls = 0;
  const second = new UserSearch({ apiKey: 'test', resultStore, fetch: async (url, options) => {
    calls++;
    if (url.endsWith('/submit')) { assert.equal(options.body, body); assert.equal(options.headers['Idempotency-Key'], token); return json({ ref }); }
    return json({ ref, status: 'completed', sources: {}, results: {} });
  } });
  assert.equal((await second.runJob('order-1')).data.status, 'completed');
  await second.runJob('order-1'); assert.equal(calls, 2);
  await assert.rejects(second.runJob('order-1', { ...input, query: 'changed@example.com' }), e => e.code === 'JOB_INPUT_CONFLICT');
});
test('job storage failure prevents submission', async () => {
  const resultStore = store(); resultStore.save = async () => { throw new Error('disk full'); };
  const sdk = new UserSearch({ apiKey: 'test', resultStore, fetch: async () => { assert.fail('must not submit'); } });
  await assert.rejects(sdk.runJob('job', input), /disk full/);
});
test('progress is ordered and mutation isolated; callback failure preserves handle', async () => {
  let polls = 0; const statuses = [];
  const sdk = new UserSearch({ apiKey: 'test', fetch: async url => url.endsWith('/submit') ? json({ ref }) : json({ ref, status: ++polls === 1 ? 'running' : 'completed', sources: {}, results: {} }) });
  const response = await sdk.search(input, { pollIntervalMs: 1, onProgress: async update => { statuses.push(update.data.status); update.data.status = 'changed'; } });
  assert.deepEqual(statuses, ['running', 'completed']); assert.equal(response.data.status, 'completed');
  await assert.rejects(sdk.search(input, { onProgress: () => { throw 'custom reason'; } }), e => e.code === 'OPERATION_INTERRUPTED' && Boolean(e.handle));
});
test('primitive abort reason retains preparation instead of masking cancellation', async () => {
  const sdk = new UserSearch({ apiKey: 'test', fetch: async () => { assert.fail('must not submit'); } });
  const prepared = sdk.prepare(input);
  await assert.rejects(sdk.submit(prepared, { signal: AbortSignal.abort('stop') }), e => e.code === 'OPERATION_INTERRUPTED' && e.prepared === prepared);
});

test('cached handles cannot bypass another client storage or credentials', async () => {
  const first = new UserSearch({ apiKey: 'first', fetch: async () => json({ ref, status: 'completed' }) });
  const h = new SearchHandle({ ref, key: Buffer.alloc(32, 1).toString('base64url') });
  await first.results(h);
  const second = new UserSearch({ apiKey: 'second', fetch: async () => { assert.fail('must not fetch'); } });
  await assert.rejects(second.results(h), e => e.code === 'HANDLE_CLIENT_MISMATCH');
});
