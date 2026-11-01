# SDK examples

[← Back to the SDK](../README.md)

| Example | Run from the repository root | API access |
| --- | --- | --- |
| [Multi-source demo](demo.mjs) | `npm run demo` | Fully simulated; no credentials, network calls, or charges |
| [Account balance](balance.mjs) | `node examples/balance.mjs` | Requires `USERSEARCH_API_KEY`; reads balance without submitting a search |

The demo covers cost estimation, two sources with different outcomes, polling, encrypted storage, and recovery. It creates encrypted synthetic files in a temporary directory and prints their location. Its temporary encryption key is discarded when the process exits.

For live integrations, use the [quick start](../README.md#quick-start) and [advanced usage](../docs/advanced.md). Keep API credentials in the server environment and use a persistent secret-manager key when enabling encrypted storage.
