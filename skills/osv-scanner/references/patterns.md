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
