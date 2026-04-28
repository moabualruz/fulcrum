---
name: osv-scanner
description: Use this skill whenever the user wants to scan a project's dependencies for known, published vulnerabilities (CVEs / GHSAs) by reading lockfiles or an SBOM. Trigger phrases include "scan dependencies for known vulnerabilities", "check for CVEs in package-lock.json", "audit go.mod / Cargo.lock / pip / npm for security issues", "detect vulnerable dependencies before deploying", "find published CVEs in this lockfile", "run a vulnerability scan against our SBOM", "block PRs that introduce vulnerable packages". Reach for this over per-ecosystem tools (`npm audit`, `cargo audit`, `pip-audit`, `bundler-audit`) — one binary covers them all using OSV.dev (Google's aggregated vulnerability DB, the same source GitHub Advisory uses). Skip for: secrets / leaked credentials (use `gitleaks`), SAST / SQL-injection / code-flaw scans (use `semgrep`), unused-dependency hygiene (use `knip` etc.), container filesystem / OS-package scans (use `trivy` or `syft`+`grype`), or type errors.
---

# osv-scanner

## When to use

- User want vuln audit of installed deps. Need **lockfile** (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `Cargo.lock`, `go.mod`/`go.sum`, `requirements.txt`, `Pipfile.lock`, `poetry.lock`, `composer.lock`, `Gemfile.lock`, `pom.xml`, `gradle.lockfile`, `pubspec.lock`, …) or SBOM in tree.
- Want one CI gate across many languages, not stitch `npm audit` + `cargo audit` + `pip-audit` + `bundler-audit` + `govulncheck`.
- Want SARIF for GitHub Code Scanning, or `gh-annotations` for inline PR comments.
- Triage vulnerable container by ecosystem packages: `osv-scanner image <ref>`.
- Have SBOM (SPDX or CycloneDX), look up vulns against it.

**Skip** for: secret scanning (use `gitleaks`); SAST / code-flaw (use `semgrep`); *unused* deps (use `knip`, `depcheck`); container-filesystem + OS-package CVE (use `trivy`, or `syft`+`grype`); license-policy enforce (dedicated tool — osv-scanner `--licenses` is hint).

## Invocation

osv-scanner v2 added `scan` subcommand. Legacy v1 (`osv-scanner -r .`) still works most installs but deprecated; prefer v2.

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

Exit codes: `0` clean, `1` vulns found, else tool error. Wire CI on `1` exact — no `|| true`.

## Patterns

### Pattern A — recursive vs explicit lockfile

`-r .` walks tree, finds every supported manifest. Use for monorepos + unfamiliar trees. Use `-L <path>` for focused deterministic scan (one service, one CI job per ecosystem):

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

JSON pipes clean to jq:

```bash
osv-scanner scan source -r . --format=json | jq '.results[].packages[] | select(.vulnerabilities) | {pkg: .package.name, ids: [.vulnerabilities[].id]}'
```

### Pattern C — `osv-scanner.toml` for ignores

Some advisories not exploitable in given app (server-side path, dev-only dep, mitigated by config). Acknowledge with *time-boxed* ignore:

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

`ignoreUntil` linchpin — scanner re-flags vuln after date so ignores no rot silently. Always require.

### Pattern D — SBOM input

When project ships SBOM (release artifact, supply-chain attestation), scan SBOM not re-read lockfiles. Faster, matches what consumers see:

```bash
osv-scanner scan source --sbom build/sbom.spdx.json
osv-scanner scan source --sbom build/sbom.cdx.json --format=sarif --output=osv.sarif
```

### Pattern E — container images

`image` subcommand sniffs both OS package DB (apk/dpkg/rpm) and app lockfiles baked into layers. Triage "is image safe to run" without `trivy`:

```bash
osv-scanner scan image alpine:3.19
osv-scanner scan image ghcr.io/acme/api:1.4.2 --format=json --output=image-osv.json
```

### Pattern F — Java caveats and `--no-resolve`

For Maven (`pom.xml`) + Gradle (`build.gradle*`), osv-scanner resolve dep tree to enumerate transitive deps. Slow, needs Maven/Gradle on PATH. `--no-resolve` skips — fast, but **only safe when vendored lockfile (`gradle.lockfile`, dep-locking enabled, or CycloneDX SBOM) lists resolved versions**. Else silently scan zero transitive deps.

```bash
osv-scanner scan source -r . --no-resolve     # only OK if gradle.lockfile / SBOM present
```

### Pattern G — license policy hints

```bash
osv-scanner scan source -r . --licenses                                 # report all licenses
osv-scanner scan source -r . --licenses=MIT,Apache-2.0,BSD-3-Clause     # flag others
```

Triage hint, not legal compliance — license strings in package metadata inconsistent (`SEE LICENSE IN file`, mis-tagged dual licenses, vendored sub-deps with own terms). Surface candidates for review, no gate release.

### Pattern H — CI integration

```bash
# Fail the build on any unignored vuln; emit SARIF for Code Scanning
osv-scanner scan source -r . --format=sarif --output=osv.sarif
# Then upload osv.sarif via github/codeql-action/upload-sarif
```

PR-only diffs: `osv-scanner scan source --recursive --call-analysis=all` on changed paths. Baseline-style filtering (only-new-vulns) currently lives in GitHub Action wrapper, not binary — see <https://github.com/google/osv-scanner-action>.

## Anti-patterns

- **Don't** scan `node_modules` instead of `package-lock.json`. Lockfiles have *resolved* versions, pin transitive deps; `node_modules` huge, slow to walk, hoisted/deduped layouts mislead version detection. Point at lockfile.
- **Don't** add `[[IgnoredVulns]]` entry without `ignoreUntil`. Forever-ignores rot silently — year later upstream patch exists, dep fixable, nobody knows because scanner stopped complaining. Set date + re-review.
- **Don't** rely on `package.json` / `Cargo.toml` / `requirements.txt` *manifest* files for vuln data. List constraints, not resolved versions. Only lockfile (or SBOM) tells exact versions installed + exposed.
- **Don't** use `--no-resolve` on fresh Maven/Gradle checkout without confirming lockfile or SBOM. Get green scan because *nothing scanned*. Verify by running once with full resolution + compare finding counts.
- **Don't** wait for release time to scan. osv-scanner runs in seconds for typical lockfiles — gate every PR. Replacing five per-ecosystem audits with one binary cheaper, not more expensive.
- **Don't** treat `--licenses` output as legal compliance. Starting point for human review; package-metadata license strings unreliable, dual-licensed / vendored sub-deps need real audit.
- **Don't** swallow exit code 1 with `|| true` to make CI green. That entire signal. Fix dep, ignore vuln with `ignoreUntil`, or document exception — no silence.
- **Don't** confuse osv-scanner with secret scanners or SAST. Knows only *published* vulns in *known versions* of *packaged deps*. No find hand-rolled SQL injection (use `semgrep`), leaked API key (use `gitleaks`), vulnerable internal lib (no public advisory).

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — security section, "audit deps every PR, treat exit code 1 as a hard fail, time-box every ignore".
- Companion tools: `gitleaks` (sibling — secrets), `semgrep` (SAST), `trivy` / `syft`+`grype` (container filesystem + OS packages), `npm audit` / `cargo audit` (per-ecosystem fallbacks).
- Upstream: <https://osv.dev/> (database) + <https://google.github.io/osv-scanner/> (tool).
- GitHub Action wrapper for PR-diff filtering: <https://github.com/google/osv-scanner-action>.