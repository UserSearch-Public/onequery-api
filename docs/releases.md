# Releases and support

The SDK is in beta. Its version is independent of the API's reported version. Pin a commit or package version for reproducible installations. Beta minor versions may change contracts; patches should preserve documented behavior. After a stable 1.0 release, breaking SDK API changes require a new major version.

Supported and tested runtimes: Node 22.13+ in the 22 series, and Node 24, on Windows and Linux. Browser use is unsupported. JavaScript ESM is the implementation; Node's native require(ESM) enables CommonJS on supported runtimes. Definitions are checked for ESM and CommonJS TypeScript consumers. Other Node majors have not been included in the support matrix.

## Prepare a prerelease

1. Review the deployed API contract and update its fingerprint only after compatibility tests pass.
2. Update package.json, src/version.js, package-lock.json and docs/CHANGELOG.md together.
3. Run npm ci and npm run verify; require green GitHub CI on the change.
4. After merging the reviewed change, manually run Prepare private prerelease in Actions. It produces a tarball artifact with a 14-day retention period. Artifact access follows repository permissions.
5. Download/install the tarball in an internal application. Record the version and commit used. A GitHub tag/release can be created when the maintainer chooses to announce it.

The workflow does not tag, publish to npm, or change repository visibility. The `private: true` setting in package.json prevents accidental npm publication; it does not control GitHub visibility. The package is proprietary (`UNLICENSED`). Publishing to npm requires package ownership, licensing and publishing configuration to be agreed first.

## Maintenance

Run the manual API specification workflow when the server contract changes. It performs an unauthenticated GET of the OpenAPI document and fails on any normalized content difference, including prose-only edits. Unit CI remains offline and deterministic. Bug fixes target the current preview; no long-term maintenance commitment exists for earlier previews. The SDK cannot cancel server charges or recover a terminal response lost before durable saving.
