## Invocation

PMD ships **two binaries** sharing one distribution: `pmd check` (rule-based static analysis) and `pmd cpd` (Copy-Paste Detector). Different inputs, different outputs — don't conflate them.

```bash
# Static analysis with a shipped ruleset
pmd check -d src/main/java -R rulesets/java/quickstart.xml

# JSON output for CI / jq pipelines
pmd check -d src/main/java -R ruleset.xml --format json --report-file pmd.json

# SARIF for GitHub Code Scanning
pmd check -d src/main/java -R ruleset.xml --format sarif --report-file pmd.sarif

# Multiple source roots, parallel, with cache for incremental runs
pmd check -d src/main/java,src/test/java -R ruleset.xml --threads 8 --cache .pmd-cache

# Copy-Paste Detector — duplicates of ≥100 tokens
pmd cpd --minimum-tokens 100 --files src/ --format text
pmd cpd --minimum-tokens 100 --dir src/ --language java --format json
```

Exit codes: `pmd check` returns nonzero when violations are found at or above `--minimum-priority`. Wire CI on that — don't `|| true`.
