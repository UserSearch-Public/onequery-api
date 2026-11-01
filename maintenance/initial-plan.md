# Initial implementation plan (historical)

Maintainer reference from the first local prototype. Current installation, support, and release information is in the README and docs directory.

## Plan

Build a local, private Node.js ESM package with TypeScript declarations and no runtime dependencies. Support Node 22+, native fetch, all four search types and multiple sources through one API key. Expose health(), balance(), cost(), prepare(), submit(), results(), wait(), and search(). Keep API response fields intact inside a { data, meta } envelope containing request ID, HTTP status and retry delay.

Generate a cryptographic result key and UUID idempotency key once per prepared search. Keep the prepared submission available to the caller before the first paid request. Automatically retry transient submission errors with exactly the same body and keys. Include the prepared submission on errors for recovery. Never silently submit a replacement search.

Cache terminal results on a search handle and coalesce concurrent reads through that handle. Honor Retry-After, support cancellation and bounded waiting. Return source failures as normal search results. Include JavaScript examples, TypeScript types, recovery guidance and offline protocol tests. No Git initialization, commits, publishing, or live paid searches.

## Review before implementation

- Read-once GETs are not ordinary safe GETs: do not automatically retry an ambiguous transport/body failure while collecting results. Report it so the user knows the delivered response may be lost. The API cannot guarantee recovery of a terminal response lost in transit.
- Persist prepared submissions and accepted handles explicitly; in-memory caching does not survive process exit. Keep secrets out of default JSON serialization/logging; offer explicit export for secure storage.
- Idempotency is guaranteed for 23 hours only. Timestamp prepared submissions and refuse to resubmit expired preparations locally.
- Cost preflight is advisory: prices/availability can change before submit. Do not describe it as an atomic spending cap.
- Health 503 with application/health+json is a useful health report, not an ordinary API error.
- Do not follow results_url or redirects with credentials. Construct polling paths from the ref and configured HTTPS origin. Permit plain HTTP only on loopback for local testing.
- Deadline/cancellation stops client waiting; it cannot cancel a charged provider search. Preserve the handle for collection.
- Omitted sources selects API defaults; reject an empty explicit list to prevent accidental expansion to all sources.

Reviewed against the checked-out API OpenAPI specification (1.0.0-beta), including Idempotency-Key, X-Result-Key, rate limits, 5-minute uncollected-result expiry, and partial source failures. Proceed with implementation and offline tests of these boundaries.

## Follow-up improvements

Implemented optional encrypted result persistence with exclusive local collector locking, explicit storage failure recovery, richer result declarations with compiler tests, actionable error hints, an offline multi-source demo, and expanded failure tests. Review preserved the remaining read-once crash window and documented manual stale-lock recovery rather than assuming abandoned locks can safely be stolen.
