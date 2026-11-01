<p align="center">
  <a href="https://usersearch.com/product/onequery/">
    <img src="docs/assets/usersearch-platform.png" alt="UserSearch — OneQuery" width="720">
  </a>
</p>

<h1 align="center">One API key. One call. Multiple premium sources.</h1>

<p align="center">
  The UserSearch SDK for JavaScript and TypeScript.<br>
  Search multiple data providers with one UserSearch API key.
</p>

<p align="center">
  <a href="https://usersearch.com/product/onequery/">Explore OneQuery</a> ·
  <a href="https://public-api.usersearch.ai/docs/">API reference</a> ·
  <a href="examples/">Examples</a> ·
  <a href="docs/advanced.md">Advanced usage</a>
</p>

## 100+ sources. One integration.

UserSearch OneQuery connects your application to over 100 data sources. Choose the providers you want to search using a single API key.

This email example selects three providers:

```js
import UserSearch from 'usersearch-sdk';

const client = new UserSearch({ apiKey: process.env.USERSEARCH_API_KEY });

const { data } = await client.search({
  type: 'email',
  query: 'person@example.com',
  sources: ['predicta', 'epieos', 'osintindustry'],
});

console.log(data.results);
```

`search()` submits the query and waits for the results. Add or remove providers in `sources`; the SDK handles polling, and results retain their source attribution.

## How it works

UserSearch queries the selected providers and combines their responses into a common format.

<p align="center">
  <a href="https://usersearch.com/product/onequery/">
    <img src="docs/assets/onequery-how-it-works.png" alt="OneQuery workflow: your app sends one query, UserSearch searches multiple providers and normalises their results, then returns one combined response." width="936">
  </a>
</p>

*OneQuery product overview. See [Search types](#search-types) for current SDK support and use the code above for request syntax.*

## Search types

SDK support for the [UserSearch search types](https://usersearch.com/product/onequery/):

| Search type | Input | SDK status |
| --- | --- | --- |
| Username Intelligence | A username or handle | Available |
| Email Intelligence | An email address | Available |
| Phone Intelligence | A number with an international country code, such as `+442079460000` | Available |
| Picture / Image | A supported image encoded as a base64 data URI | Available |
| People Intelligence | To be announced | Coming soon |
| Corporate Intelligence | To be announced | Coming soon |
| Cyber Intelligence | To be announced | Coming soon |
| IP Intelligence | To be announced | Coming soon |
| Product Intelligence | To be announced | Coming soon |
| Chat Messaging | To be announced | Coming soon |
| Public Forums | To be announced | Coming soon |
| Cryptocurrency | To be announced | Coming soon |
| Vehicle Lookup | To be announced | Coming soon |
| Threat Intelligence | To be announced | Coming soon |
| Wireless Device | To be announced | Coming soon |
| Domain Intelligence | To be announced | Coming soon |
| Breach Exposure | To be announced | Coming soon |
| Court Records | To be announced | Coming soon |

Input formats for upcoming search types will be documented when they are released.

## Installation

Requires Node.js 22.13+ in the 22 series, or Node.js 24. Supports JavaScript and TypeScript, ES modules and CommonJS. Use it on your server, where your API key stays private.

Install from GitHub:

```sh
npm install git+https://github.com/UserSearch-Public/usersearch-sdk-js.git
```

The SDK is in beta and is not yet published to npm. Pin the Git URL to a commit for production deployments; see [releases](docs/releases.md).

Before making API calls, activate your UserSearch API key, register your server’s outbound IP, and set `USERSEARCH_API_KEY` in the server environment.

Save the example above as `search.mjs` and run `node search.mjs`.

For CommonJS:

```js
const { UserSearch } = require('usersearch-sdk');
```

To try it without an API key, clone the repository and run `npm ci` followed by `npm run demo`. The [demo](examples/demo.mjs) uses simulated responses and spends no credits.

## Choose your sources

Pass provider names in `sources`, as in the example above. Omit `sources` to use the API’s defaults for your search type. An empty list is rejected.

Available providers depend on the search type. Check the [API reference](https://public-api.usersearch.ai/docs/) for supported combinations.

## Check the cost first

Searches use account credits. You can check the estimated cost without starting a search:

```js
const input = {
  type: 'email',
  query: 'person@example.com',
  sources: ['predicta', 'epieos', 'osintindustry'],
};

const { data: quote } = await client.cost(input);
console.log('Estimated cost:', quote.cost, 'cents');
```

Each `search()` call starts a new paid search; charges are final, including when a source fails. The cost estimate is advisory and is not a spending cap.

## Working with results

Network methods return `{ data, meta }`:

| Field | Contents |
| --- | --- |
| `data.results` | Findings returned by a search |
| `data.sources` | Each source’s status, including failures |
| `meta.requestId` | Request identifier for support and diagnostics |
| `meta.status` | HTTP response status |
| `meta.retryAfterMs` | Suggested retry delay in milliseconds, or `null` |

Check `data.sources` for individual provider failures, even when the request succeeds. Results from successful providers are kept if another provider fails. A response can also contain failures from every provider.

Save results when you receive them: the API delivers them once. The SDK caches the final response on the search handle. Use [encrypted storage](docs/advanced.md#encrypted-storage) to keep it across restarts.

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

Errors include a code, request ID, charge state, and a hint about what to do next. `error.toJSON()` omits credentials.

Submission retries reuse the same keys and respect `Retry-After`. If result delivery is uncertain, the SDK stops rather than retrying a response the API may have already deleted.

See [timeouts, progress, and cancellation](docs/advanced.md#timeouts-progress-and-cancellation) for request overrides and polling controls.

## Documentation and support

- [API reference](https://public-api.usersearch.ai/docs/) — endpoints, schemas, sources, and pricing behavior.
- [Advanced usage](docs/advanced.md) — images, recovery, encrypted storage, and operational limits.
- [Examples](examples/) — a balance check and a fully simulated search workflow.
- [Changelog](docs/CHANGELOG.md) — SDK changes and migration notes.
- [Releases and compatibility](docs/releases.md) — installation, versioning, and supported runtimes.
- [Contributing](.github/CONTRIBUTING.md) — development commands and test requirements.

For SDK issues, [open an issue](https://github.com/UserSearch-Public/usersearch-sdk-js/issues/new) with the SDK version, Node.js version, error code, and request ID. Do not attach credentials, result keys, or personal search data.

## Development

```sh
npm ci
npm run verify
npm run demo
```

Verification covers runtime tests, TypeScript consumers, and installed-package imports. GitHub Actions checks Windows and Linux on Node.js 22.13 and 24. The optional `npm run check:contract` command checks the public API specification for changes.

## License

Proprietary (`UNLICENSED`). Public access to this repository does not grant an open-source license.
