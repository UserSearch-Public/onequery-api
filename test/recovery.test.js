import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { UserSearch, SearchHandle, PreparedSearch, EncryptedFileStore } from '../index.js';
const ref = '5f0c7a3e-1b2d-4c3e-8f40-9a1b2c3d4e5f';
const key = Buffer.alloc(32, 1).toString('base64url');
const result = { data: { ref, status: 'completed', results: { accounts: [{ display_name: 'Sensitive Example' }] } }, meta: { status: 200, requestId: 'test', retryAfterMs: null } };
const handle = () => new SearchHandle({ ref, key });
const respond = () => new Response(JSON.stringify(result.data));
const input = { type: 'email', query: 'example@example.com' };

test('encrypted storage recovers on a fresh client and fails closed on wrong key/tampering', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usersearch-test-'));
  const encryptionKey = randomBytes(32);
  const store = new EncryptedFileStore({ directory, encryptionKey });
  const sdk = new UserSearch({ apiKey: 'test', fetch: async () => respond(), resultStore: store });
  await sdk.results(handle());
  const restored = new UserSearch({ apiKey: 'test', fetch: async () => { throw new Error('must not fetch'); }, resultStore: new EncryptedFileStore({ directory, encryptionKey }) });
  assert.equal((await restored.results(handle())).data.status, 'completed');
  const file = join(directory, (await readdir(directory)).find(f => f.endsWith('.enc')));
  const bytes = await readFile(file);
  assert.ok(!bytes.includes(Buffer.from('Sensitive Example')));
  const wrong = new UserSearch({ apiKey: 'test', fetch: async () => { assert.fail('must not fetch'); }, resultStore: new EncryptedFileStore({ directory, encryptionKey: randomBytes(32) }) });
  await assert.rejects(wrong.results(handle()));
  bytes[bytes.length - 1] ^= 1; await writeFile(file, bytes);
  await assert.rejects(restored.results(handle()));
});

test('save failure retains response and retries saving without recollecting', async () => {
  let calls = 0, saves = 0;
  const store = { load: async () => undefined, withLock: async (_, fn) => fn(), save: async () => { if (++saves === 1) throw new Error('disk full'); } };
  const sdk = new UserSearch({ apiKey: 'test', resultStore: store, fetch: async () => { calls++; return respond(); } });
  const h = handle();
  await assert.rejects(sdk.results(h), e => e.code === 'RESULT_SAVE_FAILED' && e.response.data.status === 'completed' && !JSON.stringify(e).includes('Sensitive Example'));
  assert.equal((await sdk.results(h)).data.status, 'completed');
  assert.equal(calls, 1); assert.equal(saves, 2);
});

test('independent collectors use filesystem exclusion and recover saved response', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usersearch-lock-'));
  const encryptionKey = randomBytes(32);
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  let calls = 0;
  const options = { apiKey: 'test', fetch: async () => { calls++; entered(); await gate; return respond(); } };
  const a = new UserSearch({ ...options, resultStore: new EncryptedFileStore({ directory, encryptionKey }) });
  const b = new UserSearch({ ...options, resultStore: new EncryptedFileStore({ directory, encryptionKey }) });
  const first = a.results(handle()); await ready;
  try { await assert.rejects(b.results(handle()), e => e.code === 'COLLECTION_BUSY'); } finally { release(); }
  await first; await b.results(handle()); assert.equal(calls, 1);
});

test('dropped submit can resume from serialized preparation with identical keys', async () => {
  let original;
  const a = new UserSearch({ apiKey: 'test', maxRetries: 0, fetch: async (_, options) => { original = options; throw new Error('connection lost after charge'); } });
  const p = a.prepare(input);
  await assert.rejects(a.submit(p), e => e.prepared === p);
  const b = new UserSearch({ apiKey: 'test', fetch: async (_, options) => {
    assert.equal(options.body, original.body); assert.equal(options.headers['Idempotency-Key'], original.headers['Idempotency-Key']);
    return new Response(JSON.stringify({ ref }), { status: 202 });
  } });
  assert.equal((await b.submit(new PreparedSearch(JSON.parse(JSON.stringify(p.export()))))).handle.ref, ref);
});

test('submission timeout preserves recovery state; body stream loss never recollects', async () => {
  const sdk = new UserSearch({ apiKey: 'test', timeoutMs: 10, maxRetries: 0, fetch: async (_, { signal }) => new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error('test guard')), 1000);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  }) });
  const p = sdk.prepare(input);
  await assert.rejects(sdk.submit(p), e => e.code === 'TRANSPORT_ERROR' && e.prepared === p);
  let calls = 0;
  const broken = new UserSearch({ apiKey: 'test', fetch: async () => { calls++; return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); controller.error(new Error('disconnected')); } })); } });
  await assert.rejects(broken.results(handle()), e => e.code === 'DELIVERY_UNCERTAIN');
  assert.equal(calls, 1);
});

test('diagnostics preserve code, request ID and actionable hint', async () => {
  for (const code of ['IP_NOT_ALLOWED', 'KEY_NOT_ACTIVATED', 'INSUFFICIENT_CREDITS', 'SOURCE_UNAVAILABLE']) {
    const sdk = new UserSearch({ apiKey: 'test', maxRetries: 0, fetch: async () => new Response(JSON.stringify({ code, charged: false }), { status: 403, headers: { 'x-request-id': 'support-id' } }) });
    await assert.rejects(sdk.balance(), e => e.code === code && e.requestId === 'support-id' && e.hint.length > 20);
  }
});
