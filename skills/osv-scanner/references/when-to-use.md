## When to use

- The user wants a vulnerability audit of installed dependencies and has at least one **lockfile** (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `Cargo.lock`, `go.mod`/`go.sum`, `requirements.txt`, `Pipfile.lock`, `poetry.lock`, `composer.lock`, `Gemfile.lock`, `pom.xml`, `gradle.lockfile`, `pubspec.lock`, …) or an SBOM in the tree.
- The user wants a single CI gate covering many languages instead of stitching `npm audit` + `cargo audit` + `pip-audit` + `bundler-audit` + `govulncheck` together.
- The user wants SARIF output for GitHub Code Scanning, or `gh-annotations` for inline PR comments.
- The user wants to triage a vulnerable container by ecosystem packages: `osv-scanner image <ref>`.
- The user has an SBOM (SPDX or CycloneDX) and wants to look up vulns against it.

**Skip** for: secret scanning (use `gitleaks`); code-flaw / SAST (use `semgrep`); finding *unused* deps (use `knip`, `depcheck`); container-filesystem and OS-package CVE scans (use `trivy`, or `syft`+`grype`); license-policy enforcement (use a dedicated license tool — osv-scanner's `--licenses` is a hint).
