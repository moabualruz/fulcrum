---
name: osv-scanner
description: Use this skill whenever the user wants to scan a project's dependencies for known, published vulnerabilities (CVEs / GHSAs) by reading lockfiles or an SBOM. Trigger phrases include "scan dependencies for known vulnerabilities", "check for CVEs in package-lock.json", "audit go.mod / Cargo.lock / pip / npm for security issues", "detect vulnerable dependencies before deploying", "find published CVEs in this lockfile", "run a vulnerability scan against our SBOM", "block PRs that introduce vulnerable packages". Reach for this over per-ecosystem tools (`npm audit`, `cargo audit`, `pip-audit`, `bundler-audit`) — one binary covers them all using OSV.dev (Google's aggregated vulnerability DB, the same source GitHub Advisory uses). Skip for: secrets / leaked credentials (use `gitleaks`), SAST / SQL-injection / code-flaw scans (use `semgrep`), unused-dependency hygiene (use `knip` etc.), container filesystem / OS-package scans (use `trivy` or `syft`+`grype`), or type errors.
---

# osv-scanner

## When to use

- The user wants a vulnerability audit of installed dependencies and has at least one **lockfile** (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `Cargo.lock`, `go.mod`/`go.sum`, `requirements.txt`, `Pipfile.lock`, `poetry.lock`, `composer.lock`, `Gemfile.lock`, `pom.xml`, `gradle.lockfile`, `pubspec.lock`, …) or an SBOM in the tree.
- The user wants a single CI gate covering many languages instead of stitching `npm audit` + `cargo audit` + `pip-audit` + `bundler-audit` + `govulncheck` together.
- The user wants SARIF output for GitHub Code Scanning, or `gh-annotations` for inline PR comments.
- The user wants to triage a vulnerable container by ecosystem packages: `osv-scanner image <ref>`.
- The user has an SBOM (SPDX or CycloneDX) and wants to look up vulns against it.

**Skip** for: secret scanning (use `gitleaks`); code-flaw / SAST (use `semgrep`); finding *unused* deps (use `knip`, `depcheck`); container-filesystem and OS-package CVE scans (use `trivy`, or `syft`+`grype`); license-policy enforcement (use a dedicated license tool — osv-scanner's `--licenses` is a hint).

## Invocation

osv-scanner v2 introduced a `scan` subcommand. The legacy v1 form (`osv-scanner -r .`) still works on most installs but is deprecated; prefer the v2 form.

```bash
# Recursive scan of cwd: walks subdirs, finds every lockfile
osv-scanner scan source -r .

# Single lockfile
osv-scanner scan source -L path/to/package-lock.json
osv-scanner scan source -L path/to/Cargo.lock
osv-scanner scan source -L path/to/go.mod

# SBOM input
osv-scanner scan source --sbom sbom.spdx.json
osv-scanner scan source --sbom sbom.cdx.json

# Container image — sniffs OS + lockfiles inside layers
osv-scanner scan image alpine:3.19

# Machine-readable output
osv-scanner scan source -r . --format=json   --output=osv.json
osv-scanner scan source -r . --format=sarif  --output=osv.sarif
osv-scanner scan source -r . --format=markdown
```

Exit codes: `0` clean, `1` vulnerabilities found, anything else is a tool error. Wire CI on `1` exactly — don't `|| true`.

## Patterns

### Pattern A — recursive vs explicit lockfile

`-r .` walks the tree and discovers every supported manifest. Use it for monorepos and unfamiliar trees. Use `-L <path>` when you want a focused, deterministic scan (one service, one CI job per ecosystem):

```bash
osv-scanner scan source -r .                                      # discover everything
osv-scanner scan source -L services/api/package-lock.json         # one lockfile
osv-scanner scan source -L services/api/package-lock.json \
                        -L services/billing/Cargo.lock            # multiple
```

### Pattern B — output formats

```bash
osv-scanner scan source -r . --format=table                       # human (default)
osv-scanner scan source -r . --format=json    --output=osv.json   # pipe to jq
osv-scanner scan source -r . --format=sarif   --output=osv.sarif  # GitHub Code Scanning
osv-scanner scan source -r . --format=markdown                    # PR comments
osv-scanner scan source -r . --format=gh-annotations              # inline PR annotations
osv-scanner scan source -r . --format=cyclonedx-1-5 --output=vex.cdx.json
```

JSON pipes cleanly into jq:

```bash
osv-scanner scan source -r . --format=json | jq '.results[].packages[] | select(.vulnerabilities) | {pkg: .package.name, ids: [.vulnerabilities[].id]}'
```

### Pattern C — `osv-scanner.toml` for ignores

Some advisories are not exploitable in a given application (server-side path, dev-only dependency, mitigated by config). Acknowledge them with a *time-boxed* ignore:

```toml
# osv-scanner.toml (committed at repo root)
[[IgnoredVulns]]
id = "GHSA-xxxx-xxxx-xxxx"
ignoreUntil = 2026-07-01
reason = "Dev-only dep; not in production bundle. Re-evaluate when upstream lands fix."

[[PackageOverrides]]
name = "lodash"
ecosystem = "npm"
ignore = true
reason = "Pinned to internal fork; CVEs already patched in fork."
```

`ignoreUntil` is the linchpin — the scanner re-flags the vuln after that date so ignores can't rot silently. Always require it.

### Pattern D — SBOM input

When the project ships an SBOM (release artifact, supply-chain attestation), scan against the SBOM rather than re-reading lockfiles. Faster, and matches what consumers will see:

```bash
osv-scanner scan source --sbom build/sbom.spdx.json
osv-scanner scan source --sbom build/sbom.cdx.json --format=sarif --output=osv.sarif
```

### Pattern E — container images

The `image` subcommand sniffs both the OS package DB (apk/dpkg/rpm) and any application lockfiles baked into layers. Useful for triaging a "is this image safe to run" question without `trivy`:

```bash
osv-scanner scan image alpine:3.19
osv-scanner scan image ghcr.io/acme/api:1.4.2 --format=json --output=image-osv.json
```

### Pattern F — Java caveats and `--no-resolve`

For Maven (`pom.xml`) and Gradle (`build.gradle*`), osv-scanner needs to resolve the dependency tree to enumerate transitive deps. That's slow and requires Maven/Gradle on PATH. `--no-resolve` skips it — fast, but **only safe when a vendored lockfile (`gradle.lockfile`, dependency-locking enabled, or a CycloneDX SBOM) lists the resolved versions**. Otherwise you'll silently scan zero transitive deps.

```bash
osv-scanner scan source -r . --no-resolve     # only OK if gradle.lockfile / SBOM present
```

### Pattern G — license policy hints

```bash
osv-scanner scan source -r . --licenses                                 # report all licenses
osv-scanner scan source -r . --licenses=MIT,Apache-2.0,BSD-3-Clause     # flag others
```

This is a triage hint, not legal compliance — license strings in package metadata are inconsistent (`SEE LICENSE IN file`, mis-tagged dual licenses, vendored sub-deps with their own terms). Use it to surface candidates for review, not to gate a release.

### Pattern H — CI integration

```bash
# Fail the build on any unignored vuln; emit SARIF for Code Scanning
osv-scanner scan source -r . --format=sarif --output=osv.sarif
# Then upload osv.sarif via github/codeql-action/upload-sarif
```

For PR-only diffs use `osv-scanner scan source --recursive --call-analysis=all` on the changed paths, but baseline-style filtering (only-new-vulns) currently lives in the GitHub Action wrapper, not the binary — see <https://github.com/google/osv-scanner-action>.

## Anti-patterns

- **Don't** scan `node_modules` instead of `package-lock.json`. Lockfiles have *resolved* versions and pin transitive deps; `node_modules` is huge, slow to walk, and may have hoisted/deduped layouts that mislead version detection. Always point at the lockfile.
- **Don't** add an `[[IgnoredVulns]]` entry without `ignoreUntil`. Forever-ignores rot silently — a year later the upstream patch exists, the dep is fixable, and nobody knows because the scanner stopped complaining. Always set a date and re-review.
- **Don't** rely on `package.json` / `Cargo.toml` / `requirements.txt` *manifest* files for vulnerability data. They list constraints, not resolved versions. Only the lockfile (or an SBOM) tells you which exact versions are installed and therefore exposed.
- **Don't** use `--no-resolve` on a fresh Maven/Gradle checkout without confirming a lockfile or SBOM exists. You'll get a green scan because *nothing was scanned*. Verify by running once with full resolution and comparing finding counts.
- **Don't** wait for release time to scan. osv-scanner runs in seconds for typical lockfiles — gate every PR. Replacing five per-ecosystem audits with one binary makes this cheaper, not more expensive.
- **Don't** treat `--licenses` output as legal compliance. It's a starting point for human review; package-metadata license strings are notoriously unreliable, and dual-licensed / vendored sub-deps need a real audit.
- **Don't** swallow exit code 1 with `|| true` to make CI green. That's the entire signal. Fix the dep, ignore the vuln with `ignoreUntil`, or document the exception — but don't silence it.
- **Don't** confuse osv-scanner with secret scanners or SAST. It only knows about *published* vulnerabilities in *known versions* of *packaged dependencies*. It will not find a hand-rolled SQL injection (use `semgrep`), a leaked API key (use `gitleaks`), or a vulnerable internal library (no public advisory exists).

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — security section, "audit deps every PR, treat exit code 1 as a hard fail, time-box every ignore".
- Companion tools: `gitleaks` (sibling — secrets), `semgrep` (SAST), `trivy` / `syft`+`grype` (container filesystem + OS packages), `npm audit` / `cargo audit` (per-ecosystem fallbacks).
- Upstream: <https://osv.dev/> (the database) and <https://google.github.io/osv-scanner/> (the tool).
- GitHub Action wrapper for PR-diff filtering: <https://github.com/google/osv-scanner-action>.
