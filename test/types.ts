import { UserSearch, EncryptedFileStore, type Account, type Breach, type ImageMatch, type ImageLocation } from '../index.js';
import type { SeenValue } from '../index.js';
async function compileOnly() {
const client = new UserSearch({ apiKey: 'synthetic', fetch: async () => { throw new Error('Compile-only fixture'); }, resultStore: new EncryptedFileStore({ directory: './results', encryptionKey: new Uint8Array(32) }) });
const result = await client.search({ type: 'email', value: 'person@example.com', sources: ['predicta'] });
await client.runJob('job-id', undefined, { onProgress: update => { const status: string = update.data.status; void status; } });
const account: Account | undefined = result.data.results.accounts?.[0];
const name: string | undefined = account?.display_name;
const breach: Breach = { exposed: { password: true }, account_count: 123 };
const count: number | undefined = breach.account_count;
const attribution: SeenValue = { value: 'Demo', breaches: ['Example breach'] };
const match: ImageMatch = { kind: 'face', score: 0.98 };
const location: ImageLocation = { confidence: 0.9, latitude: 51.5 };
// @ts-expect-error scores are numeric
const bad: ImageMatch = { score: 'high' };
// @ts-expect-error image searches require image/value, not query
client.prepare({ type: 'image', query: 'photo.png' });
// @ts-expect-error sources must be known names
client.prepare({ type: 'email', query: 'a@example.com', sources: ['typo'] });
void [name, breach, match, location, bad, count, attribution];
}
void compileOnly;
