# Advanced integration and recovery

A dependency-free JavaScript SDK with TypeScript declarations for server-side Node.js 22.13+ or 24. Search multiple sources with one API key. Maintained in the private `UserSearch-Public/usersearch-sdk-js` repository. The package has not been published to npm.

## Quick start

Install the local SDK folder or private tarball from a consuming Node project. No installation is needed to run this SDK's tests.

```js
import { UserSearch } from 'usersearch-sdk';

const client = new UserSearch({ apiKey: process.env.USERSEARCH_API_KEY });
const input = {
  type: 'email',
  value: 'person@example.com',
  sources: ['epieos', 'predicta']
};

// Free: validates the search and reports its total cost in cents.
const quote = await client.cost(input);
console.log(quote.data.cost);

// Paid: submits a new search and waits for its results.
const { data, meta } = await client.search(input);
console.log(data.results, data.sources, meta.requestId);
```

The account key must be activated and registered to the server's outbound IP. Keep it in your server environment; never bundle it into a browser application. Each call to `search()` creates a NEW paid search. It does not automatically call `cost()`. A quote is advisory and is not an atomic price cap. Charges are final even when a source fails or returns no matches.

## Methods and response shape

All network methods return `{ data, meta }`. `data` preserves the API fields, including source attribution and per-source failures. `meta` contains `status`, `requestId`, and `retryAfterMs` (milliseconds, or null). Monetary values remain integer cents.

| Method | Purpose |
| --- | --- |
| `health()` | Free cached source observations; HTTP 503 health reports are returned as data |
| `balance()` | Free account balance |
| `cost(input)` | Free input validation and total cost |
| `prepare(input)` | Local generation of result and idempotency keys; no network request |
| `submit(prepared)` | Paid submission; returns `{ data, meta, handle }` |
| `results(handle)` | One read; terminal responses cached on this handle |
| `wait(handle, options)` | Poll until completed or failed |
| `search(input, options)` | Prepare, submit, and wait in one call |

Use `query` or the convenience alias `value` for email, username and phone. For image searches supply `image` (or `value`) as a base64 data URI. Phone numbers require a country code (E.164). For example:

```js
import { readFile } from 'node:fs/promises';
const image = `data:image/png;base64,${(await readFile('photo.png')).toString('base64')}`;
const quote = await client.cost({ type: 'image', image, sources: ['tineye'] });
```

Omit `sources` for the API's available compatible sources. An empty array is rejected to prevent accidental selection of every source. Known sources are:

| Type | Sources |
| --- | --- |
| username | predicta, osint |
| email | predicta, epieos, behindtheemail, osint |
| phone | predicta, epieos, osint |
| image | findpiclocation, geoseer, facecheck, camgirlfinder, tineye |

The server remains authoritative for availability, supported source combinations and image constraints. Health reports describe previous API observations, not a fresh provider probe.

## Recovery and read-once results

For production jobs, persist the prepared submission securely BEFORE submitting, then persist the accepted handle. These snapshots contain sensitive result keys and search inputs. The SDK's default JSON serialization redacts secrets; `.export()` explicitly returns them for protected storage.

```js
import { PreparedSearch, SearchHandle } from 'usersearch-sdk';

const prepared = client.prepare(input);
// Store prepared.export() in your encrypted job store before calling submit.
const { handle } = await client.submit(prepared);
// Store handle.export() in the same protected job store.
const response = await client.wait(handle);
// Save response.data in your application's protected result store immediately.

// Restore after restart, using snapshots from that store:
// const prepared = new PreparedSearch(savedPreparation);
// const handle = new SearchHandle(savedHandle);
```

Transient submit failures retry at most twice by default with the identical body, idempotency key and result key. If a submit fails, `error.prepared` gives the same preparation for recovery. Retry `submit(error.prepared)` rather than calling `search()` again. Preparations older than 23 hours are refused because the API's idempotency guarantee has expired. Never alter the saved body, keys or timestamp to bypass that protection.

The terminal result is delivered once by the API and then deleted. This SDK caches it on the original handle and coalesces concurrent calls through that handle. Persist the returned response yourself for retention beyond the process lifetime. Separate handles/processes do not share a cache or lock; designate one collector per search.

A lost or malformed collection response raises `DELIVERY_UNCERTAIN` without an automatic retry: the API may already have deleted its copy. No SDK can guarantee recovery of that response. Uncollected results expire five minutes after completion. Source status `failed` is returned normally, including when every source failed; inspect `data.status` and `data.sources`.

## Timeouts, cancellation and errors

```js
const client = new UserSearch({
  apiKey: process.env.USERSEARCH_API_KEY,
  timeoutMs: 30000, // per HTTP request
  maxRetries: 2    // retries after the initial attempt (except collection)
});

try {
  const response = await client.search(input, {
    signal: AbortSignal.timeout(120000), // bounds the complete workflow
    timeoutMs: 60000,                   // bounds the polling phase
    pollIntervalMs: 5000
  });
} catch (error) {
  console.error(error.code, error.status, error.requestId);
  // error.prepared: submission recovery; error.handle: result collection recovery.
}
```

Polling honors the longer of `pollIntervalMs` and `Retry-After`. Structured polling rate-limit errors are retried; other collection errors are surfaced. The first caller's signal controls a coalesced in-flight read. A timeout/abort stops local waiting, not the provider search or its charge. Preserve `error.handle` and collect promptly when possible. `charged: null` means unknown, and a retry's `charged: false` does not prove an earlier attempt was free.

Client keys use private fields; result keys never appear in URLs. Redirects are rejected. The SDK uses the configured origin and returned ref rather than trusting `results_url`. Custom origins require HTTPS, except loopback HTTP for local tests. Do not log exported snapshots, legacy submit responses that echo a result key, or full result data indiscriminately.

## Verification

Run `npm install`, `npm test`, `npm run test:types`, and `npm run check`. TypeScript is a development-only dependency. Runtime tests use synthetic inputs and simulated responses, including a loopback HTTP server. The compiler fixture is checked separately and never invoked. The package includes no real account key and no runtime dependencies. TypeScript users receive declarations from `index.d.ts`; the implementation executes directly without a build step.

See [PLAN.md](../PLAN.md) for the plan and its pre-implementation review. Contract reference: [UserSearch API documentation](https://public-api.usersearch.ai/docs/), version 1.0.0-beta, inspected from the local API checkout during development. This preview has not been validated by running a paid end-to-end production search.

## Optional encrypted result saving

```js
import { UserSearch, EncryptedFileStore } from 'usersearch-sdk';

const resultStore = new EncryptedFileStore({
  directory: './private-results',
  encryptionKey: Buffer.from(process.env.USERSEARCH_STORAGE_KEY, 'base64')
});
const client = new UserSearch({ apiKey: process.env.USERSEARCH_API_KEY, resultStore });
```

Generate a separate random 32-byte storage key once, and keep it in a secret manager. Keep the same key across restarts. It is distinct from the API key and per-search result keys. Losing it makes stored results unreadable. The directory contains authenticated AES-256-GCM ciphertext; each save uses a fresh nonce, a flushed temporary file and an atomic rename. Protect the directory with OS access controls as well; Unix mode bits do not configure Windows ACLs. Storage has no automatic retention/deletion policy: manage retention in your application.

With a store configured, the SDK saves a terminal response before returning it. A restored handle checks the store before collecting from the API. Store identities include the API origin, API key, reference and result key, so unrelated credentials cannot accidentally share cached results. Continue using the original API key when restoring a handle.

If saving fails, `RESULT_SAVE_FAILED` exposes `error.response` non-enumerably and retains the response on `error.handle`. Retrying `results(error.handle)` retries saving that cached copy without collecting again. Save it elsewhere immediately if storage remains unavailable. There remains a crash window between receiving the API response and durable storage; the API's read-once delivery cannot provide exactly-once durable collection.

The file store uses an exclusive directory lock for each collection. Independent processes sharing the same local storage directory cannot collect the same result simultaneously. A competing call receives `COLLECTION_BUSY`; retry after the owner finishes. A process crash can leave a `.lock` directory: verify that its owner is stopped before manually removing that specific stale lock. Locks are never stolen on a timer. Use a transactional shared store implementing `load`, `save`, and `withLock` for distributed deployments; local filesystem locking is not a distributed guarantee.

## Demo and troubleshooting

Run `npm run demo` for a complete simulated cost → multi-source submission → polling → encrypted saving → recovery workflow. It prints a successful source alongside a failed source. It needs no API key and performs no network requests. It leaves encrypted synthetic files in the printed temporary directory; its temporary key is discarded at exit.

API errors include an actionable `error.hint` alongside the unchanged `code`, `status`, `charged`, `requestId` and `problem`. For example, `IP_NOT_ALLOWED` explains outbound IP registration, and `INSUFFICIENT_CREDITS` suggests topping up or choosing fewer sources. Prefer logging these diagnostic fields over complete responses.

Detailed types cover account profiles, breach exposure, WHOIS domains, facts, timeline events, image matches, locations and summaries. Source-omitted fields remain optional and unknown future fields remain accessible. Compiler tests cover valid usage and invalid field/input types.

The expanded runtime tests cover encrypted recovery through fresh clients, wrong storage keys, tampering, disk-save failure, independent collectors, dropped submissions, identical-key recovery, timeout and response-stream interruption. During development, Node initially discovered and ran the compiler fixture; its synthetic key was rejected by production with an uncharged 401. That fixture is now inert and excluded from runtime discovery. No provider query was performed.

## Recoverable jobs and progress

With an encrypted `resultStore` configured, use a stable application job ID:

```js
const response = await client.runJob('customer-request-123', input, {
  onProgress(update) {
    console.log(update.data.status, update.data.sources);
  }
});

// After restarting: recreate the client with the same API/storage keys and directory.
const recovered = await client.runJob('customer-request-123');
```

`runJob` saves the preparation before submitting and saves the accepted handle before collecting. A repeat call resumes the same submission or returns saved results; it does not create a new search. To deliberately run another search, use a new job ID. Changed input under an existing ID is rejected. Omit input when resuming to avoid changes in source order or aliases. The store must preserve arbitrary JSON job records as well as response envelopes; custom stores implement `load`, `save`, and exclusive `withLock` for both.

The job lock covers submission and polling, so simultaneous callers receive `COLLECTION_BUSY`. After an abrupt crash, inspect and remove only confirmed stale locks as described above. Expired idempotency windows, expired uncollected results, and a crash before the received result is saved still require reconciliation. Recovery is explicit by job ID; there is no background worker or job scheduler. Job records contain sensitive queries and keys, so use encrypted storage and an application retention policy.

`onProgress` works with `wait`, `search`, and `runJob`. It receives a detached copy of each successful poll, including terminal results after saving. Async callbacks are awaited in order; keep callbacks short and ensure they settle. A callback failure preserves `error.handle` (and `error.jobId` for jobs). Returning an already completed job uses saved data without replaying progress callbacks. Polling deadlines cannot forcibly interrupt application callback code.

An in-memory handle is bound to the first client that collects through it. To use another client, construct a new `SearchHandle` from the exported snapshot. This prevents shared caches from bypassing another client's storage or credentials.

## Contract and installation checks

`npm run check:contract` fetches only the public OpenAPI document and compares its normalized SHA-256 fingerprint to `contract-baseline.json`. Changes fail the check and print both hashes. Review the new specification and update SDK types/behavior/tests before deliberately updating the baseline. This detects prose and example edits too; it is not a semantic compatibility validator. It requires internet access and never uses an account key.

`npm run test:package` packs the SDK into an isolated temporary directory, installs that local tarball and verifies package exports and a mocked request. The package allowlist excludes tests, tooling, dependencies, job data and private files. No package is published.

See [REVIEW.md](../REVIEW.md) for the review findings and compatibility verification. Tests can be run on another Node version using the same npm scripts. Docker compatibility runs mount this source read-only and write synthetic data only inside the temporary container.
