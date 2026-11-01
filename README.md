# UserSearch Node.js SDK

Search usernames, emails, phone numbers and images across multiple sources with one API key. Server-side JavaScript and TypeScript, Node.js **22.13+ or 24**. No runtime dependencies.

**Private preview — 0.2.0-beta.1.** This repository and package remain private. Nothing is published to npm. API charges still apply when you submit a real search.

## Install

Repository collaborators can clone this private repository, run `npm ci`, and then install the local folder in their application:

```sh
npm install /path/to/usersearch-sdk-js
```

For a pinned preview, run `npm pack` in the SDK folder and install the resulting `.tgz`. Neither command publishes anything. See [release preparation](docs/releases.md).

## Quick start

```js
import UserSearch from 'usersearch-sdk';

const client = new UserSearch({ apiKey: process.env.USERSEARCH_API_KEY });
const input = {
  type: 'email',
  query: 'person@example.com',
  sources: ['predicta', 'epieos']
};

const quote = await client.cost(input); // Free; amounts are integer cents.
console.log(quote.data.cost);

const response = await client.search(input); // Paid; submits and polls.
console.log(response.data.results);
console.log(response.data.sources); // Each source's status and attribution.
console.log(response.meta.requestId);
```

CommonJS is also supported: `const { UserSearch } = require('usersearch-sdk')`.
The account key must be activated and locked to your server's public outbound IP. Keep it out of browser code. Phone queries require a country code, e.g. `+442079460000`. Image queries use an `image` data URI. Omit `sources` to use API defaults; an empty list is rejected.

Every call to `search()` starts a new search. Charges are final, including failed sources. Cost estimates are advisory, not spending caps. Results are returned as `{ data, meta }`; `meta` contains HTTP `status`, `requestId` and `retryAfterMs`. Partial or total source failures are result data, not request exceptions.

## Errors and request settings

```js
import { RateLimitError, UserSearchError } from 'usersearch-sdk';

try {
  await client.balance({ requestTimeoutMs: 10000, maxRetries: 0 });
} catch (error) {
  if (error instanceof RateLimitError) console.log(error.retryAfterMs);
  if (error instanceof UserSearchError) console.error(error.toJSON());
}
```

Error classes include `AuthenticationError`, `PermissionError`, `InvalidRequestError`, `RateLimitError`, `APIError`, `ConnectionError`, and `DeliveryUncertainError`. They extend `UserSearchError` and retain API codes, charge state, request IDs and troubleshooting hints. `toJSON()` returns diagnostic fields without response bodies or recovery secrets. Local input validation can throw `TypeError`; cancellation can throw an abort error.

Client defaults: `timeoutMs: 30000` per HTTP attempt and `maxRetries: 2`. Request methods accept `requestTimeoutMs`, `maxRetries` and `signal`. `search`/`wait` also accept a polling `timeoutMs` (default five minutes), `pollIntervalMs` and `onProgress`. Use a signal to bound the complete submission-and-polling workflow. Automatic retries reuse the exact submission keys and honor `Retry-After`. Collection never automatically retries an ambiguous response loss. `wait` retries explicit polling rate limits until its deadline, independent of submission `maxRetries`.

## Optional recovery and storage

The API delivers finished results once. The SDK caches them on the handle, but applications should persist them. Optional encrypted storage is available separately:

```js
import { EncryptedFileStore } from 'usersearch-sdk/storage';

const client = new UserSearch({
  apiKey: process.env.USERSEARCH_API_KEY,
  resultStore: new EncryptedFileStore({
    directory: './private-results',
    encryptionKey: Buffer.from(process.env.USERSEARCH_STORAGE_KEY, 'base64')
  })
});
const response = await client.runJob('stable-application-job-id', input);
// Resume after a restart with the same credentials/storage:
// await client.runJob('stable-application-job-id');
```

Keep the separate random 32-byte storage key in a secret manager. Read [advanced recovery](docs/advanced.md) for storage failures, stale locks, cancellation and the unavoidable read-once delivery crash window.

## Development

```sh
npm ci
npm run verify         # Syntax, runtime tests, TypeScript and installed-package checks
npm run demo           # Fully simulated: no key, network calls or charges
npm run check:contract # Public specification only; no API key or provider query
```

GitHub CI runs verification on Windows/Linux with Node 22.13 and 24. Manual workflows check API drift and prepare a private tarball artifact. No workflow publishes to npm. TypeScript declarations are currently maintained alongside JavaScript and checked by consumer tests; they are not generated from implementation source.

See [CHANGELOG.md](CHANGELOG.md), [release policy](docs/releases.md), [contributing](CONTRIBUTING.md), and [API documentation](https://public-api.usersearch.ai/docs/). SDK versions are independent of API versions; this API has no client-selectable version header. The SDK does not invent one.

This software remains proprietary (`UNLICENSED`) pending an explicit distribution/licensing decision. Report private issues through this repository; never attach API keys, result keys or real search results.
