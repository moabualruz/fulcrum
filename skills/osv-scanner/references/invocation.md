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
