# Releases and support

The SDK is a private preview. Its version is independent of the API's reported version. Use exact package versions for reproducible integrations. Preview minor versions may change contracts; patches should preserve documented behavior. After a stable 1.0 release, breaking SDK API changes require a new major version.

Supported and tested runtimes: Node 22.13+ in the 22 series, and Node 24, on Windows and Linux. Browser use is unsupported. JavaScript ESM is the implementation; Node's native require(ESM) enables CommonJS on supported runtimes. Definitions are checked for ESM and CommonJS TypeScript consumers. Other Node majors have not been included in the support matrix.

## Prepare a private prerelease

1. Review the deployed API contract and update its fingerprint only after compatibility tests pass.
2. Update package.json, version.js, package-lock.json and CHANGELOG.md together.
3. Run npm ci and npm run verify; require green GitHub CI on the change.
4. After merging the reviewed change, manually run Prepare private prerelease in Actions. It produces a private tarball artifact with a 14-day retention period.
5. Download/install the tarball in an internal application. Record the version and commit used. A GitHub tag/release can be created when the maintainer chooses to announce it.

The workflow does not tag, publish to npm, or change repository visibility. package.json remains private:true and UNLICENSED. A public release requires a separate decision on package scope ownership, licensing, visibility and trusted publishing. There is no external publishing token in this repository.

## Maintenance

Run the manual API specification workflow when the server contract changes. It performs an unauthenticated GET of the OpenAPI document and fails on any normalized content difference, including prose-only edits. Unit CI remains offline and deterministic. Bug fixes target the current preview; no long-term maintenance commitment exists for earlier previews. The SDK cannot cancel server charges or recover a terminal response lost before durable saving.
