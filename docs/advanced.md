# Advanced usage

[← Back to the SDK](../README.md)

Use the standard `search()` flow for a new search. The methods below give you more control over submission, polling, storage, and recovery.

## Search inputs

Text searches accept `query` or its convenience alias `value`. Phone numbers require an international country code. Image searches accept `image` or `value` as a base64 data URI.

```js
import { readFile } from 'node:fs/promises';
import UserSearch from 'usersearch-sdk';

const client = new UserSearch({ apiKey: process.env.USERSEARCH_API_KEY });
const bytes = await readFile('photo.png');
const input = {
  type: 'image',
  image: `data:image/png;base64,${bytes.toString('base64')}`,
  sources: ['tineye'],
};

const { data: quote } = await client.cost(input);
console.log(quote.cost);
```

The API validates formats, sizes, source compatibility, availability, and account access. A cost check does not guarantee that a provider will find a match or successfully process a subsequent search.

## Submission and recovery

Prepare the search locally, save its credentials securely, and then submit:

```js
const prepared = client.prepare(input);
// Persist prepared.export() in protected storage before submitting.

const { handle } = await client.submit(prepared);
// Persist handle.export() before collecting.

const response = await client.wait(handle);
// Persist response.data in your application's result store.
```

`prepare()` makes no network request. The preparation contains a cryptographically random result key and an idempotency key. Retries reuse the same body and both keys. If submission fails, use `error.prepared` to retry that submission rather than calling `search()` again.

The API’s idempotency guarantee lasts 23 hours. The SDK refuses to resubmit an older preparation. Reconcile the original job before deliberately creating another search.

Restore saved state after restarting:

```js
import { PreparedSearch, SearchHandle } from 'usersearch-sdk';

// savedPreparation and savedHandle come from your protected storage.
const prepared = new PreparedSearch(savedPreparation);
const handle = new SearchHandle(savedHandle);
```

Exported snapshots contain sensitive credentials. Default JSON serialization of preparations and handles redacts their keys; `.export()` explicitly exposes them for secure persistence.

An in-memory handle belongs to the first client that collects through it. When changing clients, construct a new handle from the saved snapshot.

## Encrypted storage

Configure a separate, persistent 32-byte encryption key and a protected directory:

```js
import UserSearch from 'usersearch-sdk';
import { EncryptedFileStore } from 'usersearch-sdk/storage';

const client = new UserSearch({
  apiKey: process.env.USERSEARCH_API_KEY,
  resultStore: new EncryptedFileStore({
    directory: './private-results',
    encryptionKey: Buffer.from(process.env.USERSEARCH_STORAGE_KEY, 'base64'),
  }),
});
```

Generate the storage key once with a cryptographically secure random generator and keep it in a secret manager. It is separate from the API key and per-search result keys. Retain it across restarts; losing it makes stored results unreadable.

The file store uses AES-256-GCM with a fresh nonce for each save, flushes temporary-file contents, and renames the file into place. It saves terminal results before returning them and checks saved results before collecting from the API. Cache identities include the API origin, original API key, result reference, and result key.

Protect the directory with operating-system access controls. Unix file modes do not configure Windows ACLs. The store has no automatic retention policy; your application must manage retention and deletion.

### Saving failures

If the initial save or a later save retry fails, `RESULT_SAVE_FAILED` exposes the received response through `error.response` and keeps it cached on `error.handle`. These recovery properties are non-enumerable.

Call `results(error.handle)` on the same client to retry saving without collecting again. If storage remains unavailable, save `error.response` elsewhere before ending the process.

### Read-once delivery

The API deletes its copy after delivering the terminal response. Uncollected results expire five minutes after completion.

A dropped or malformed collection response raises `DeliveryUncertainError` with code `DELIVERY_UNCERTAIN`. The SDK does not automatically collect again: the server may already have consumed its copy.

There is an unavoidable interval between receiving a response and saving it durably. A process failure in that interval can lose the result. File contents are flushed, but rename metadata is not explicitly synced; power-loss durability also depends on the filesystem.

## Recoverable jobs

With persistent storage configured, use a stable application job ID:

```js
const response = await client.runJob('customer-request-123', {
  type: 'email',
  query: 'person@example.com',
  sources: ['predicta', 'epieos'],
});

// After a restart, recreate the client with the same keys and directory:
const recovered = await client.runJob('customer-request-123');
```

`runJob()` saves the preparation before the first submission and the accepted handle before collection. A repeated ID resumes the original submission or returns saved results. It does not start a replacement search.

Changed input under an existing ID is rejected. Omit input when resuming. Use a new job ID only when you intend to create a new search. Recovery is explicit; the SDK does not run a background scheduler.

Job records contain search inputs and keys. Encrypt them and apply an appropriate retention policy. A custom store must support arbitrary JSON records through `load`, `save`, and exclusive `withLock` operations.

### Concurrent collectors and stale locks

The file store uses an exclusive lock per collection; `runJob()` holds a job lock through submission and polling. Competing callers receive `COLLECTION_BUSY` and can retry after the owner finishes.

A crashed process can leave a `.lock` directory. Verify that the owning process has stopped before removing that specific stale lock. The SDK never steals locks on a timer.

Local filesystem locking is not a distributed guarantee. Use a transactional shared store for deployments across multiple machines. Without a shared store, designate one collector per search.

## Timeouts, progress, and cancellation

```js
const response = await client.search(input, {
  signal: AbortSignal.timeout(120_000),
  requestTimeoutMs: 15_000,
  maxRetries: 2,
  timeoutMs: 60_000,
  pollIntervalMs: 5_000,
  onProgress(update) {
    console.log(update.data.status, update.data.sources);
  },
});
```

| Setting | Meaning |
| --- | --- |
| Client `timeoutMs` | Default timeout for each HTTP attempt; 30 seconds |
| `requestTimeoutMs` | Per-call override for each HTTP attempt |
| `maxRetries` | Submission/request retry limit; defaults to two |
| Search/wait `timeoutMs` | Polling-phase deadline; defaults to five minutes |
| `pollIntervalMs` | Minimum polling interval; defaults to five seconds |
| `signal` | Cancellation signal; use it to bound the whole workflow |
| `onProgress` | Callback for each successful poll, including terminal results |

Polling honors the longer of the configured interval and `Retry-After`, including the initial submission delay. Explicit polling rate limits are retried until the polling deadline, independently of submission `maxRetries`.

Progress callbacks receive detached copies. Async callbacks run in order and are awaited; keep them short and ensure they settle. A callback failure preserves `error.handle`, and `error.jobId` when using jobs. Completed jobs returned from storage do not replay callbacks.

Cancellation stops client waiting, not the provider search or its charge. Preserve the recovery handle and collect promptly. The SDK cannot forcibly interrupt application callbacks or custom store code.

## Diagnostics and security

Use `error.toJSON()` for diagnostic logging. It includes the error class, API code, HTTP status, request ID, retry delay, charge state, and troubleshooting hint. It excludes raw response bodies and recovery credentials.

`charged: null` means the outcome is uncertain. A retry reporting `charged: false` does not prove that an earlier attempt was free.

The SDK rejects redirects, requires HTTPS except for loopback tests, and builds collection URLs from the configured origin and returned reference. Result keys are sent in headers, never query strings. API credentials stay in private client fields.

Health reports describe prior API observations; they are not fresh provider probes. Structured HTTP 503 health reports are returned as health data, while Problem Details failures raise an API error.

## Verification and API changes

`npm run verify` checks runtime behavior, TypeScript usage, and installed packages with synthetic data. `npm run demo` requires no API key and makes no network requests.

`npm run check:contract` fetches only the public OpenAPI document and compares its normalized fingerprint with `contract-baseline.json`. It detects prose changes as well as contract changes. Review the updated specification and compatibility tests before changing the baseline.

See [releases and compatibility](releases.md) for supported runtimes and versioning.
