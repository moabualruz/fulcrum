---
name: pmd
description: Use this skill whenever the user wants to run static analysis on Java (or Apex, Visualforce, Kotlin, JavaScript, JSP, PLSQL, Scala, Swift, T-SQL, XML, XSL, Modelica, VM) source code to find bug patterns, code smells, unused imports, dead code, design problems, or duplicated code blocks. Trigger phrases include "analyze java code for bug patterns", "find duplicated code blocks", "static analysis for java with custom rulesets", "detect java code smells", "audit java for unused imports and dead code", "run PMD against this module", "find copy-paste in this codebase", "scan apex with a ruleset". Reach for this over hand-rolled grep, ad-hoc style scripts, or SonarQube for a one-shot CLI scan. Skip for Python lint (use ruff), JS/TS lint (use biome/eslint), bytecode-level Java bug-finding (use spotbugs), formatting (use google-java-format), or dependency CVE audits (use osv-scanner).
---

# pmd

## When to use

- The user asks to run PMD, find Java code smells, scan for unused imports / empty catch blocks / dead code / god classes, or apply a custom ruleset.
- The user wants to find duplicated code blocks (copy-paste) across a tree — that's `pmd cpd`, the Copy-Paste Detector shipped in the same distribution.
- The user is wiring a CI gate that fails a PR on new violations or tokens-of-duplication above a threshold.
- The user is auditing Apex / Visualforce (Salesforce), Kotlin, PLSQL, or another supported language with the same ruleset machinery.

**Skip** for: Python (`ruff`), JS/TS (`biome`, `eslint`), Go (`golangci-lint`), Rust (`clippy`); Java *bytecode* bug-finding (`spotbugs` reads `.class`, PMD reads source — they find different bugs and many shops run both); formatting (`google-java-format`, `spotless`); dependency CVEs (`osv-scanner`); type errors (the compiler — PMD assumes the code compiles).

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

## Anti-patterns

- **Don't** point PMD at a bytecode dir (`target/classes`, `build/classes`). PMD reads **source**. That's `spotbugs`'s territory; running PMD over `.class` files just errors.
- **Don't** run `quickstart.xml` on a legacy codebase and call the output a triage list — it's opinionated and you'll drown. Vendor a custom ruleset and grow it deliberately.
- **Don't** use the `--rulesets` shorthand pointing at a remote URL without pinning. Either vendor the XML in-repo or pin a versioned URL — silent ruleset drift between CI runs is a debugging nightmare.
- **Don't** ignore deprecation warnings in PMD's startup output. PMD 7 deprecated many PMD 6 rules and renamed others; rules that vanish silently turn into "we no longer check that" without anyone noticing.
- **Don't** confuse `pmd check` and `pmd cpd`. Different tools, different flags, different output. "Find duplicates" → `cpd`. "Find smells" → `check`.
- **Don't** suppress with `@SuppressWarnings("all")` — it disables the Java compiler warnings *and* every other tool keyed on that annotation. Use `@SuppressWarnings("PMD.SpecificRule")` (or `"PMD"` to silence only PMD) and add a comment explaining why.
- **Don't** skip `--cache` on repeated runs. Without it, every invocation re-parses every file; with it, only changed files re-analyze. Multi-minute scans drop to seconds.
- **Don't** treat PMD as a security scanner. `category/java/security.xml` is narrow (a few hard-coded patterns); pair PMD with `semgrep` or `spotbugs`'s `findsecbugs` plugin for real SAST coverage.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — security/static-analysis section, "static analysis runs in CI; suppression requires justification".
- Companion tools: `spotbugs` (Java bytecode bug-finder, complementary), `checkstyle` (style-leaning Java linter), `semgrep` (multi-language SAST), `lizard` (cyclomatic complexity across many languages).
- Upstream: <https://pmd.github.io/>
- Rule reference: <https://docs.pmd-code.org/latest/pmd_rules_java.html>
- CPD docs: <https://docs.pmd-code.org/latest/pmd_userdocs_cpd.html>
