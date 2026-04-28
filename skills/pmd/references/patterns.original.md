## Patterns

### Pattern A — `check` vs `cpd`

`pmd check` runs **rules over an AST** — it finds *kinds* of bugs (empty catch, unused import, mutable static field, broken null check). `pmd cpd` runs a **token-based duplicate detector** — it finds *literal copy-pasted regions* across files. They share no inputs, no outputs, and no flags beyond `--format`. If the user says "find duplicates," that's `cpd`; "find bugs / smells / style," that's `check`.

### Pattern B — pick a ruleset deliberately

PMD ships category rulesets under `category/<lang>/<topic>.xml`:

```
category/java/bestpractices.xml    # generic good-Java
category/java/codestyle.xml        # naming, formatting hints
category/java/design.xml           # complexity, coupling, god classes
category/java/documentation.xml    # javadoc presence/shape
category/java/errorprone.xml       # likely-bug patterns
category/java/multithreading.xml   # concurrency hazards
category/java/performance.xml      # micro-optimization hints
category/java/security.xml         # narrow — pair with semgrep
```

`rulesets/java/quickstart.xml` is a curated mix and is **opinionated** — running it on a legacy codebase produces a flood. Vendor a custom XML ruleset that includes specific rules and excludes the noisy ones:

```xml
<?xml version="1.0"?>
<ruleset name="acme"
  xmlns="http://pmd.sourceforge.net/ruleset/2.0.0">
  <rule ref="category/java/errorprone.xml"/>
  <rule ref="category/java/bestpractices.xml">
    <exclude name="GuardLogStatement"/>
    <exclude name="JUnitAssertionsShouldIncludeMessage"/>
  </rule>
  <rule ref="category/java/design.xml/CyclomaticComplexity">
    <properties><property name="classReportLevel" value="80"/></properties>
  </rule>
</ruleset>
```

### Pattern C — JSON / SARIF output for CI

```bash
pmd check -d src/main/java -R ruleset.xml --format json   --report-file pmd.json
pmd check -d src/main/java -R ruleset.xml --format sarif  --report-file pmd.sarif
pmd check -d src/main/java -R ruleset.xml --format csv    --report-file pmd.csv
```

JSON pipes through `jq` (`jq '.files[] | {file: .filename, n: (.violations | length)}' pmd.json`). SARIF uploads via `github/codeql-action/upload-sarif`. Other formats: `text`, `html`, `xml`.

### Pattern D — priority threshold and PR-only diffs

PMD has no built-in baseline. Two practical knobs:

```bash
# Only fail on the loudest rules (1 = highest, 5 = lowest)
pmd check -d src/main/java -R ruleset.xml --minimum-priority 2

# Scan only files changed in a PR
pmd check -d $(git diff --name-only origin/main...HEAD -- '*.java' | tr '\n' ',') -R ruleset.xml
```

For a true baseline, save `pmd.json`, then diff new violations against it in CI (jq + a small script). Or rely on PR-only scans so old debt doesn't keep failing the build.

### Pattern E — incremental and parallel

```bash
pmd check -d src/main/java -R ruleset.xml --threads 8 --cache .pmd-cache
```

`--cache` skips files unchanged since last run (hash-keyed). `--threads N` parallelizes across files. Both matter on large modules — without them, full-tree scans get slow.

### Pattern F — suppression

```java
// Per-violation, narrow
@SuppressWarnings("PMD.AvoidCatchingGenericException")
void boundary() { try { ... } catch (Exception e) { ... } }
```

Or in the ruleset XML: `<exclude name="RuleName"/>` (drops the rule entirely) or per-file via `<exclude-pattern>.*Generated\.java</exclude-pattern>`. Prefer XML-level excludes for *cross-cutting* noise (generated code, vendored libs) and `@SuppressWarnings` for *local, justified* exceptions.

### Pattern G — Copy-Paste Detector

```bash
pmd cpd --minimum-tokens 100 --files src/ --format text
pmd cpd --minimum-tokens 75  --dir src/ --language java --format json --skip-lexical-errors
pmd cpd --minimum-tokens 100 --dir src/ --format xml --report-file cpd.xml
```

`--minimum-tokens` is the sensitivity dial — 50 is noisy, 100 is the common default, 200+ catches only egregious duplication. `cpd` supports the same languages as `check` (`--language java|apex|kotlin|scala|swift|...`).
