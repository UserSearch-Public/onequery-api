# SDK review

This is a separate review pass by the implementation agent, not an external independent security audit. The review examined retry identity, cancellation, read-once delivery, encrypted storage, shared caches, job recovery and packaging.

## Fixed findings

- Primitive or frozen abort/callback errors could make recovery-metadata attachment throw and hide the original interruption. The SDK now wraps such errors and preserves the preparation, handle or job ID.
- A cached handle shared between clients could bypass the second client's storage/authentication context. In-memory handles now bind to their collecting client; restored snapshots create independent handles.
- Repeated save failures previously lost the structured RESULT_SAVE_FAILED response. All persistence attempts now preserve that error and the cached response.
- Package installation smoke tests initially invoked npm through a shell on Windows. They now invoke the npm CLI through Node with argument arrays.

## Reviewed boundaries

- Every job preparation is persisted before submit. A lost acceptance response is retried with the same serialized preparation and keys, within the documented time window.
- Accepted handles are saved before polling. Terminal responses are saved before returning. If final job-state saving fails, the result store can supply the response on the next resume.
- Progress callbacks receive copies; mutations cannot alter cached results. Their failures retain collection recovery information.
- File locks prevent simultaneous collectors using shared local storage. Stale locks are intentionally not automatically stolen after crashes.
- Authentication, result keys, queries and full responses are not emitted by the SDK's own logging. Exported snapshots and job data remain sensitive.

## Remaining limits

- No client can close the network-to-disk crash window of a read-once server response. Durable acknowledgement would require an API change.
- Local filesystem exclusion is not a distributed lock. Directory rename metadata is not explicitly fsynced, so power-loss durability is filesystem-dependent even though file contents are flushed.
- Caller callbacks and custom store methods must finish; cancellation cannot forcibly interrupt arbitrary application code.
- Spec fingerprints detect edits, not whether those edits are breaking. Baseline changes need review.
- Compatibility tests use mocked provider responses; no paid provider search was performed.

## Verification

Runtime tests, strict TypeScript consumer tests, installed tarball import checks, and the live public-specification fingerprint check are provided as npm scripts. Runtime compatibility was exercised on Windows Node 22/24 and Linux containers Node 22/24. See the final work report for results.
