---
name: pmd
description: Use this skill whenever the user wants to run static analysis on Java (or Apex, Visualforce, Kotlin, JavaScript, JSP, PLSQL, Scala, Swift, T-SQL, XML, XSL, Modelica, VM) source code to find bug patterns, code smells, unused imports, dead code, design problems, or duplicated code blocks. Trigger phrases include "analyze java code for bug patterns", "find duplicated code blocks", "static analysis for java with custom rulesets", "detect java code smells", "audit java for unused imports and dead code", "run PMD against this module", "find copy-paste in this codebase", "scan apex with a ruleset". Reach for this over hand-rolled grep, ad-hoc style scripts, or SonarQube for a one-shot CLI scan. Skip for Python lint (use ruff), JS/TS lint (use biome/eslint), bytecode-level Java bug-finding (use spotbugs), formatting (use google-java-format), or dependency CVE audits (use osv-scanner).
---

# pmd

## When to use

- User ask run PMD, find Java code smells, scan unused imports / empty catch / dead code / god classes, or apply custom ruleset.
- User want find duplicated code blocks (copy-paste) across tree — that `pmd cpd`, Copy-Paste Detector in same distribution.
- User wire CI gate fail PR on new violations or tokens-of-duplication above threshold.
- User audit Apex / Visualforce (Salesforce), Kotlin, PLSQL, or other supported language with same ruleset machinery.

**Skip** for: Python (`ruff`), JS/TS (`biome`, `eslint`), Go (`golangci-lint`), Rust (`clippy`); Java *bytecode* bug-finding (`spotbugs` read `.class`, PMD read source — find different bugs, many shops run both); formatting (`google-java-format`, `spotless`); dependency CVEs (`osv-scanner`); type errors (compiler — PMD assume code compiles).

## Invocation

PMD ship **two binaries** share one distribution: `pmd check` (rule-based static analysis) and `pmd cpd` (Copy-Paste Detector). Different inputs, different outputs — no conflate.

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

Exit codes: `pmd check` return nonzero when violations found at or above `--minimum-priority`. Wire CI on that — no `|| true`.

## Patterns

### Pattern A — `check` vs `cpd`

`pmd check` run **rules over AST** — find *kinds* of bugs (empty catch, unused import, mutable static field, broken null check). `pmd cpd` run **token-based duplicate detector** — find *literal copy-pasted regions* across files. Share no inputs, no outputs, no flags beyond `--format`. User say "find duplicates" → `cpd`; "find bugs / smells / style" → `check`.

### Pattern B — pick a ruleset deliberately

PMD ship category rulesets under `category/<lang>/<topic>.xml`:

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

`rulesets/java/quickstart.xml` curated mix and **opinionated** — run on legacy codebase produce flood. Vendor custom XML ruleset that include specific rules and exclude noisy ones:

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

JSON pipe through `jq` (`jq '.files[] | {file: .filename, n: (.violations | length)}' pmd.json`). SARIF upload via `github/codeql-action/upload-sarif`. Other formats: `text`, `html`, `xml`.

### Pattern D — priority threshold and PR-only diffs

PMD no built-in baseline. Two practical knobs:

```bash
# Only fail on the loudest rules (1 = highest, 5 = lowest)
pmd check -d src/main/java -R ruleset.xml --minimum-priority 2

# Scan only files changed in a PR
pmd check -d $(git diff --name-only origin/main...HEAD -- '*.java' | tr '\n' ',') -R ruleset.xml
```

For true baseline, save `pmd.json`, then diff new violations against it in CI (jq + small script). Or rely on PR-only scans so old debt no keep failing build.

### Pattern E — incremental and parallel

```bash
pmd check -d src/main/java -R ruleset.xml --threads 8 --cache .pmd-cache
```

`--cache` skip files unchanged since last run (hash-keyed). `--threads N` parallelize across files. Both matter on large modules — without, full-tree scans slow.

### Pattern F — suppression

```java
// Per-violation, narrow
@SuppressWarnings("PMD.AvoidCatchingGenericException")
void boundary() { try { ... } catch (Exception e) { ... } }
```

Or in ruleset XML: `<exclude name="RuleName"/>` (drop rule entirely) or per-file via `<exclude-pattern>.*Generated\.java</exclude-pattern>`. Prefer XML-level excludes for *cross-cutting* noise (generated code, vendored libs) and `@SuppressWarnings` for *local, justified* exceptions.

### Pattern G — Copy-Paste Detector

```bash
pmd cpd --minimum-tokens 100 --files src/ --format text
pmd cpd --minimum-tokens 75  --dir src/ --language java --format json --skip-lexical-errors
pmd cpd --minimum-tokens 100 --dir src/ --format xml --report-file cpd.xml
```

`--minimum-tokens` sensitivity dial — 50 noisy, 100 common default, 200+ catch only egregious duplication. `cpd` support same languages as `check` (`--language java|apex|kotlin|scala|swift|...`).

## Anti-patterns

- **No** point PMD at bytecode dir (`target/classes`, `build/classes`). PMD read **source**. That `spotbugs` territory; run PMD over `.class` files just error.
- **No** run `quickstart.xml` on legacy codebase and call output triage list — opinionated, you drown. Vendor custom ruleset and grow deliberately.
- **No** use `--rulesets` shorthand pointing at remote URL without pinning. Either vendor XML in-repo or pin versioned URL — silent ruleset drift between CI runs debugging nightmare.
- **No** ignore deprecation warnings in PMD startup output. PMD 7 deprecated many PMD 6 rules and renamed others; rules that vanish silently turn into "we no longer check that" without anyone noticing.
- **No** confuse `pmd check` and `pmd cpd`. Different tools, different flags, different output. "Find duplicates" → `cpd`. "Find smells" → `check`.
- **No** suppress with `@SuppressWarnings("all")` — disable Java compiler warnings *and* every other tool keyed on that annotation. Use `@SuppressWarnings("PMD.SpecificRule")` (or `"PMD"` to silence only PMD) and add comment explaining why.
- **No** skip `--cache` on repeated runs. Without, every invocation re-parse every file; with, only changed files re-analyze. Multi-minute scans drop to seconds.
- **No** treat PMD as security scanner. `category/java/security.xml` narrow (few hard-coded patterns); pair PMD with `semgrep` or `spotbugs` `findsecbugs` plugin for real SAST coverage.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — security/static-analysis section, "static analysis runs in CI; suppression requires justification".
- Companion tools: `spotbugs` (Java bytecode bug-finder, complementary), `checkstyle` (style-leaning Java linter), `semgrep` (multi-language SAST), `lizard` (cyclomatic complexity across many languages).
- Upstream: <https://pmd.github.io/>
- Rule reference: <https://docs.pmd-code.org/latest/pmd_rules_java.html>
- CPD docs: <https://docs.pmd-code.org/latest/pmd_userdocs_cpd.html>