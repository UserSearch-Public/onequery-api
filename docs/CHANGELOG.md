# Changelog

## Unreleased

- License the SDK code and documentation under MIT; logos and website imagery remain separately reserved.
- Correct the OSINT Industries source identifier to `osintindustry` in TypeScript declarations and README examples.

## 0.2.0-beta.1 — 2026-10-30

Private preview, not published to npm.

- Align with merged public API PR #28: JSON health failures remain readable, submission no longer promises an echoed result key, and first polling honors Retry-After.
- Update result declarations to account_count, summary breaches and 0–1 image scores.
- Add error subclasses and redacted diagnostic serialization, plus per-request timeout and retry controls.
- Add default import, CommonJS support on Node 22.13+, version identification, and an optional storage subpath.
- Add Windows/Linux CI, installed-package checks, private prerelease artifacts and manual spec drift checks.
- Reorganize quick-start and advanced documentation, document release/support policy and proprietary status.

Migration: use account_count instead of pwn_count; image scores are fractions rather than percentages. Retain your generated result key rather than reading it from a submission response. Existing named imports and { data, meta } responses remain supported. Local minimum Node version is now 22.13.0 for CommonJS interoperability.

## 0.1.0 — 2026-10-30

Initial private SDK: multiple sources, cost checks, safe submission retries, polling, typed responses, encrypted local results, job recovery and offline tests.
