# Development

Use Node 22.13+ or 24. Install pinned development dependencies with npm ci and run npm run verify before submitting a pull request. Runtime tests must use simulated responses or loopback servers; never introduce a default test that submits a production search.

Keep changes narrow, include regression tests for retry/polling behavior, and update declarations and changelog alongside runtime changes. Preserve stable idempotency keys across retries and never treat result collection as an ordinary replayable GET. Keep optional persistence out of the basic integration path.

API specification updates require review, not just replacing the baseline hash. Do not commit environment files, account keys, result snapshots, encrypted customer data or node_modules. Diagnostics should contain request IDs and machine-readable errors rather than search contents.
