---
name: spotbugs
description: Use this skill whenever the user wants to scan compiled Java bytecode (`.class` / `.jar` / `.war`) for bug patterns — null-pointer dereferences, concurrency / multithreading mistakes, performance smells, security flaws, dodgy code, or known-bad API misuse. Trigger phrases include "scan java bytecode for bugs", "find null pointer bugs in java", "detect concurrency bugs in compiled java", "audit jar for known bug patterns", "static analysis on a java jar", "successor to findbugs", "produce SARIF for github code scanning from java", "find-sec-bugs / fb-contrib plugin", "spotbugs effort level". Spotbugs is the maintained successor to findbugs and operates on **bytecode, not source** — the project must be built first. Skip for source-only style/structure checks (use `pmd`), Kotlin lint (use `ktlint`), Java formatting (use `google-java-format`), Java dependency CVEs (use `osv-scanner`), or container / image scans.
---

# spotbugs

## When to use

- The user wants to scan a built Java artifact (`.jar`, `.war`, `target/classes/`, `build/classes/`) for bug patterns: null deref, infinite recursion, unclosed streams, broken `equals`/`hashCode`, wrong synchronisation, suspicious casts.
- The user mentions findbugs — it has been unmaintained since 2016; spotbugs is the drop-in fork and what every modern build uses.
- CI needs a Java static-analysis gate that emits SARIF for GitHub Code Scanning, or HTML / XML for a build-artifact dashboard.
- The user wants to combine the security plugin (`find-sec-bugs`) or the extra-rules plugin (`fb-contrib`) with the core detectors.
- The user wants to suppress findings inline with `@SuppressFBWarnings("RULE_ID")` rather than disabling whole rules.

**Skip** for: source-only AST checks (use `pmd`), Java formatting (`google-java-format`), Kotlin lint (`ktlint`), dependency CVEs (`osv-scanner` / `dependency-check`), Docker image scans (`trivy` / `grype`), runtime profiling, or anything that requires reading `.java` files directly — spotbugs analyses the compiled `.class`.

## Invocation

```bash
# Build first — spotbugs reads bytecode, not source
mvn package -DskipTests          # or: ./gradlew assemble

# Text UI scan, XML report (canonical CI shape)
spotbugs -textui -xml:withMessages -output bugs.xml target/myapp.jar

# Scan a class directory (no jar yet)
spotbugs -textui -xml:withMessages -output bugs.xml target/classes

# Interactive review (developer triage)
spotbugs -gui

# Effort levels — more effort = more bugs, slower run
spotbugs -textui -effort:less   target/myapp.jar     # PR gate
spotbugs -textui -effort:max    target/myapp.jar     # nightly

# Confidence filter — keep only at-least-this-confident findings
spotbugs -textui -high   target/myapp.jar            # only HIGH-confidence
spotbugs -textui -medium target/myapp.jar            # HIGH + MEDIUM (default)
spotbugs -textui -low    target/myapp.jar            # everything

# Output formats
spotbugs -textui -xml:withMessages -output bugs.xml   target/app.jar
spotbugs -textui -html             -output bugs.html  target/app.jar
spotbugs -textui -emacs                                target/app.jar
spotbugs -textui -sarif            -output bugs.sarif target/app.jar

# Plugins — security and extra rules
spotbugs -textui -pluginList find-sec-bugs.jar,fb-contrib.jar -output bugs.xml app.jar

# Filter scope (XML filter file, not ruleset list)
spotbugs -textui -include  include-filter.xml -output bugs.xml app.jar
spotbugs -textui -exclude  exclude-filter.xml -output bugs.xml app.jar
```

`-textui` runs headless. Without it, spotbugs launches the Swing GUI, which fails in CI containers without a display.

## Patterns

### Pattern A — first-look scan on a built jar

```bash
spotbugs -textui -effort:default -xml:withMessages -output bugs.xml target/myapp.jar
```

Default effort + medium confidence is the sweet spot for an initial audit. `withMessages` embeds human-readable rule descriptions in the XML so the output is self-contained for review tools.

### Pattern B — categories overview

Categories spotbugs reports against:

- `CORRECTNESS` — likely bugs (null deref, infinite recursion, unreachable code).
- `MT_CORRECTNESS` — multithreading mistakes (unsynchronised access, double-checked locking).
- `PERFORMANCE` — wasteful patterns (boxing in loops, `String.indexOf("c")`).
- `SECURITY` — surfaced mostly via `find-sec-bugs`; spotbugs core covers a smaller set.
- `BAD_PRACTICE` — `equals` without `hashCode`, `Cloneable` without `clone`, `finalize` misuse.
- `DODGY_CODE` — suspicious-but-not-clearly-wrong (unused vars, redundant null checks).
- `MALICIOUS_CODE` — exposing mutable state to untrusted callers.
- `EXPERIMENTAL`, `INTERNATIONALIZATION`, `STYLE` — opt-in / niche.

Filter via the `<Bug category="..."/>` element in the include/exclude XML (Pattern E).

### Pattern C — SARIF for GitHub Code Scanning

```bash
spotbugs -textui -sarif -output spotbugs.sarif target/myapp.jar
```

Then upload via `github/codeql-action/upload-sarif@v3` in the workflow. Findings appear inline on PRs in the Code Scanning UI — far better signal than a buried HTML report.

### Pattern D — plugins (`find-sec-bugs`, `fb-contrib`)

```bash
spotbugs -textui \
  -pluginList /opt/plugins/findsecbugs-plugin.jar,/opt/plugins/fb-contrib.jar \
  -xml:withMessages -output bugs.xml target/app.jar
```

`find-sec-bugs` adds ~140 security rules (SQLi, XSS, weak crypto, deserialisation gadgets) — essential for any service that handles untrusted input. `fb-contrib` adds ~300 additional general-purpose rules. Plugins are jars; pass absolute paths.

### Pattern E — include / exclude filter XML

```xml
<!-- exclude-filter.xml — suppress style + experimental noise -->
<FindBugsFilter>
  <Match>
    <Bug category="STYLE,EXPERIMENTAL,I18N"/>
  </Match>
  <Match>
    <Class name="~.*\.generated\..*"/>
  </Match>
  <Match>
    <Bug pattern="EI_EXPOSE_REP"/>
    <Class name="com.example.dto.*"/>
  </Match>
</FindBugsFilter>
```

```bash
spotbugs -textui -exclude exclude-filter.xml -output bugs.xml target/app.jar
```

`-include` keeps only matches; `-exclude` drops them. Either / both. The filter format is the same as findbugs — match on `Bug pattern`, `Bug category`, `Class`, `Method`, `Field`, `Source` regex.

### Pattern F — inline suppression with annotations

```java
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

@SuppressFBWarnings(
    value = "EI_EXPOSE_REP",
    justification = "DTO returns an internal array intentionally; immutability enforced upstream."
)
public byte[] payload() { return raw; }
```

Add the `spotbugs-annotations` artifact to the build. Always include `justification` — code review needs to see why the rule was overridden. **Do not** use `@SuppressWarnings("all")` — that is the javac annotation and spotbugs ignores it.

### Pattern G — build-tool integration

```groovy
// build.gradle
plugins { id 'com.github.spotbugs' version '6.0.+' }

spotbugs {
    effort = 'less'         // PR gate; nightly job overrides to 'max'
    reportLevel = 'high'    // keep only high-confidence on PRs
    excludeFilter = file('config/spotbugs-exclude.xml')
}
```

Gradle plugin: `com.github.spotbugs`. Maven plugin: `com.github.spotbugs:spotbugs-maven-plugin` (goal `spotbugs:check`). Both wrap the same engine — config keys mirror the CLI flags.

### Pattern H — performance: tiered effort

```bash
# PR (fast)
spotbugs -textui -effort:less -high -sarif -output sb.sarif target/app.jar

# Nightly (thorough)
spotbugs -textui -effort:max  -low  -sarif -output sb.sarif target/app.jar
```

`-effort:max` runs the full inter-procedural data-flow analysis; on large jars (>50 MB) it can take 10–30 minutes. PR jobs should run `-effort:less` with `-high` confidence; the nightly job runs `-effort:max -low` and posts to the dashboard.

## Anti-patterns

- **Don't point spotbugs at `src/main/java/`.** It analyses bytecode. Build first (`mvn package` / `./gradlew assemble`) and pass the jar or `target/classes` directory. Pointing at `.java` either errors out or silently scans nothing.
- **Don't run `-effort:max` on every commit.** It's slow. Use `-effort:less` (or `default`) with `-high` confidence on PR gates and reserve `-effort:max -low` for a nightly job.
- **Don't confuse `-include` with PMD's `--rulesets`.** Spotbugs `-include` takes an XML *filter* scoping which findings to keep; you cannot enumerate ruleset jars there. Plugins load via `-pluginList`; rule scope goes in the filter XML.
- **Don't keep using findbugs.** Findbugs has been unmaintained since 2016 — no Java 11+ support, no modern bytecode handling. Spotbugs is the drop-in fork; same rule IDs, same filter XML, active releases. Migrate.
- **Don't suppress with `@SuppressWarnings("all")`.** That's javac's annotation. Use `@SuppressFBWarnings("RULE_ID")` from `spotbugs-annotations`, pin the specific rule, and write a `justification`. A blanket suppression is invisible to spotbugs and to the next reviewer.
- **Don't ignore SARIF output for GitHub repos.** `-sarif` uploaded via the code-scanning workflow surfaces findings inline on PR review — vastly higher signal than an HTML report nobody opens. JSON / XML are for in-house dashboards; SARIF is for the platform.
- **Don't run only spotbugs and call Java analysis "done".** Spotbugs reads bytecode; PMD reads source AST. They catch different classes of bug — spotbugs catches null-deref via flow analysis and concurrency mistakes; PMD catches API misuse, code smells, and structural rules. Run both.
- **Don't omit `-textui` in CI.** Without it spotbugs launches the Swing GUI; on a headless runner the process hangs or errors with `HeadlessException`.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — JVM section ("scan compiled artefacts with spotbugs; pair with PMD for source-level rules").
- Sister skills: `skills/pmd/SKILL.md` (source-AST static analysis — run alongside), `skills/ktlint/SKILL.md` (Kotlin lint), `skills/google-java-format/SKILL.md` (formatting).
- JSON / SARIF pipelines: `skills/jq/SKILL.md` for post-processing XML→JSON exports; SARIF goes to GitHub Code Scanning directly.
- Plugins: `find-sec-bugs` <https://find-sec-bugs.github.io/>, `fb-contrib` <https://fb-contrib.sourceforge.net/>.
- Upstream: <https://spotbugs.github.io/>
- Bug pattern reference: <https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html>
- Filter XML reference: <https://spotbugs.readthedocs.io/en/latest/filter.html>
