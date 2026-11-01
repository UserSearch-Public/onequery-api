import { UserSearch, EncryptedFileStore, SearchHandle } from '../index.js';
import { randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Entirely simulated: never contacts the real API or spends credits.
const ref = '5f0c7a3e-1b2d-4c3e-8f40-9a1b2c3d4e5f';
let polls = 0;
const mockFetch = async url => {
  let data;
  if (url.endsWith('/cost')) data = { cost: 150, balance: 1000, sources: ['predicta', 'epieos'] };
  else if (url.endsWith('/submit')) data = { ref, status: 'pending' };
  else data = { ref, type: 'email', status: ++polls > 1 ? 'completed' : 'running',
    sources: { predicta: { status: 'completed', found: true }, epieos: { status: 'failed', error: { code: 'PROVIDER_ERROR' } } },
    results: { accounts: [{ platform: 'example', display_name: 'Demo Person', sources: ['predicta'] }] } };
  return new Response(JSON.stringify(data), { status: url.endsWith('/submit') ? 202 : 200, headers: { 'x-request-id': 'demo-request', 'retry-after': '0' } });
};
const directory = await mkdtemp(join(tmpdir(), 'usersearch-demo-'));
const encryptionKey = randomBytes(32); // Demo only; production keys must survive restarts in a secret manager.
const resultStore = new EncryptedFileStore({ directory, encryptionKey });
const client = new UserSearch({ apiKey: 'demo-only', fetch: mockFetch, resultStore });
const input = { type: 'email', value: 'person@example.com', sources: ['predicta', 'epieos'] };
console.log('SIMULATED DEMO — no real queries or charges');
console.log('Quote (cents):', (await client.cost(input)).data.cost);
const { handle } = await client.submit(client.prepare(input));
const response = await client.wait(handle, { pollIntervalMs: 10 });
console.log('Accounts:', response.data.results.accounts);
console.log('Source outcomes:', response.data.sources);
const restored = new UserSearch({ apiKey: 'demo-only', fetch: () => { throw new Error('Network should not be needed'); }, resultStore });
console.log('Recovered from encrypted storage:', (await restored.results(new SearchHandle(handle.export()))).data.status);
console.log('Encrypted demo files:', directory);
console.log('The temporary demo key is discarded when this process exits.');
