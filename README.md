# UserSearch SDK for Node.js

**One API key. Multiple sources. A single integration.**

Search usernames, email addresses, phone numbers, and images through the UserSearch API. The SDK handles authentication, submission retries, and polling, with TypeScript definitions and optional encrypted result storage.

[API reference](https://public-api.usersearch.ai/docs/) · [Examples](examples/) · [Advanced usage](docs/advanced.md) · [Changelog](CHANGELOG.md)

> **Private preview · v0.2.0-beta.1**
>
> Available to repository collaborators. The package is not yet published to npm.

## At a glance

- **Multiple sources per search** — select providers explicitly or let the API choose compatible defaults.
- **Cost checks before submission** — validate input and retrieve an estimate without starting a search.
- **Consistent results** — retain source attribution, partial results, and individual provider outcomes.
- **Recoverable submissions** — retries reuse the same result and idempotency keys.
- **JavaScript and TypeScript** — ES modules and CommonJS, with no runtime dependencies.

| Search type | Input |
| --- | --- |
| Username | A username or handle |
| Email | An email address |
| Phone | A number with an international country code, such as `+442079460000` |
| Image | A supported image encoded as a base64 data URI |

**Runtime:** Node.js 22.13+ in the 22 series, or Node.js 24. Tested on Windows and Linux. This is a server-side SDK; browser use is not supported.

## Installation

Install from the private GitHub repository using an account with access:

```sh
npm install git+https://github.com/UserSearch-Public/usersearch-sdk-js.git
```

For reproducible deployments, pin the Git URL to a reviewed commit or install a versioned tarball. See [installation and releases](docs/releases.md).

Before making API calls, activate your UserSearch API key, register your server’s outbound IP, and set `USERSEARCH_API_KEY` in the server environment.

## Quick start

Save this example as `search.mjs` and run it with `node search.mjs`:

```js
import UserSearch from 'usersearch-sdk';

const client = new UserSearch({
  apiKey: process.env.USERSEARCH_API_KEY,
});

const input = {
  type: 'email',
  query: 'person@example.com',
  sources: ['predicta', 'epieos'],
};

// Free: validate the request and estimate the total cost in cents.
const { data: quote } = await client.cost(input);
console.log('Estimated cost:', quote.cost, 'cents');

// Paid: submit the search and wait for a completed or failed result.
const { data: search, meta } = await client.search(input);

console.log('Search status:', search.status);
console.log('Source outcomes:', search.sources);
console.log('Request ID:', meta.requestId);

// Save search.results to your application's result store.
```

The example performs a real search when run with a valid key. Each `search()` call starts a new paid search; charges are final, including when a source fails. The cost estimate is advisory and is not a spending cap.

For CommonJS:

```js
const { UserSearch } = require('usersearch-sdk');
```

**Try it without an API key:** clone this repository, run `npm ci`, then `npm run demo`. The [simulated demo](examples/demo.mjs) shows multiple sources, a partial failure, encrypted saving, and recovery without network calls or charges.

## Working with results

Network methods return `{ data, meta }`:

| Field | Contents |
| --- | --- |
| `data.results` | Findings returned by a search |
| `data.sources` | Each source’s status, including failures |
| `meta.requestId` | Request identifier for support and diagnostics |
| `meta.status` | HTTP response status |
| `meta.retryAfterMs` | Suggested retry delay in milliseconds, or `null` |

One source failing does not discard another source’s findings. Inspect `data.sources` as well as the overall search status. Search results are returned normally even when every source fails.

> **Results are delivered once.**
>
> Save the terminal response when you receive it. The SDK caches it on the search handle; optional [encrypted storage and job recovery](docs/advanced.md#encrypted-storage) preserve results across application restarts.

## Client methods

| Method | Purpose |
| --- | --- |
| `health()` | Read API and source health |
| `balance()` | Read the account balance in cents |
| `cost(input)` | Validate and estimate a search without submitting it |
| `search(input, options)` | Submit a new search and wait for its result |
| `prepare(input)` → `submit(prepared)` | Control submission and preserve retry credentials |
| `results(handle)` / `wait(handle)` | Collect once or poll until the search finishes |
| `runJob(jobId, input, options)` | Start or resume a job using configured persistent storage |

Omit `sources` to use API defaults. An empty source list is rejected. Provider availability and accepted image constraints are determined by the API.

## Errors and configuration

```js
import UserSearch, { UserSearchError } from 'usersearch-sdk';

const client = new UserSearch({
  apiKey: process.env.USERSEARCH_API_KEY,
  timeoutMs: 30_000,
  maxRetries: 2,
});

try {
  await client.balance({ requestTimeoutMs: 10_000, maxRetries: 0 });
} catch (error) {
  if (!(error instanceof UserSearchError)) throw error;
  console.error(error.toJSON());
}
```

Errors expose a machine-readable code, request ID, charge state, and an actionable hint. Specific classes distinguish authentication, permissions, invalid input, rate limits, API failures, connection errors, and uncertain result delivery.

Retries preserve submission identity and honor `Retry-After`. An ambiguous result-collection failure is never retried automatically because the API may already have delivered and deleted the response.

See [timeouts, progress, and cancellation](docs/advanced.md#timeouts-progress-and-cancellation) for request overrides and polling controls.

## Documentation and support

- [API reference](https://public-api.usersearch.ai/docs/) — endpoints, schemas, sources, and pricing behavior.
- [Advanced usage](docs/advanced.md) — images, recovery, encrypted storage, and operational limits.
- [Examples](examples/) — a balance check and a fully simulated search workflow.
- [Changelog](CHANGELOG.md) — SDK changes and migration notes.
- [Releases and compatibility](docs/releases.md) — installation, versioning, and supported runtimes.
- [Contributing](CONTRIBUTING.md) — development commands and test requirements.

For SDK issues, [open an issue](https://github.com/UserSearch-Public/usersearch-sdk-js/issues/new) with the SDK version, Node.js version, error code, and request ID. Do not attach credentials, result keys, or personal search data.

## Development

```sh
npm ci
npm run verify
npm run demo
```

Verification covers runtime tests, TypeScript consumers, and installed-package imports. GitHub Actions checks Windows and Linux on Node.js 22.13 and 24. The optional `npm run check:contract` command checks the public API specification for changes.

## License

Proprietary — `UNLICENSED`. This private preview does not grant an open-source license. The repository and npm publication status remain unchanged.
