---
name: spotbugs
description: Use this skill whenever the user wants to scan compiled Java bytecode (`.class` / `.jar` / `.war`) for bug patterns — null-pointer dereferences, concurrency / multithreading mistakes, performance smells, security flaws, dodgy code, or known-bad API misuse. Trigger phrases include "scan java bytecode for bugs", "find null pointer bugs in java", "detect concurrency bugs in compiled java", "audit jar for known bug patterns", "static analysis on a java jar", "successor to findbugs", "produce SARIF for github code scanning from java", "find-sec-bugs / fb-contrib plugin", "spotbugs effort level". Spotbugs is the maintained successor to findbugs and operates on **bytecode, not source** — the project must be built first. Skip for source-only style/structure checks (use `pmd`), Kotlin lint (use `ktlint`), Java formatting (use `google-java-format`), Java dependency CVEs (use `osv-scanner`), or container / image scans.
---

# spotbugs

## When to use

- User want scan built Java artifact (`.jar`, `.war`, `target/classes/`, `build/classes/`) for bug patterns: null deref, infinite recursion, unclosed streams, broken `equals`/`hashCode`, wrong synchronisation, suspicious casts.
- User mention findbugs — unmaintained since 2016; spotbugs drop-in fork, what every modern build use.
- CI need Java static-analysis gate emit SARIF for GitHub Code Scanning, or HTML / XML for build-artifact dashboard.
- User want combine security plugin (`find-sec-bugs`) or extra-rules plugin (`fb-contrib`) with core detectors.
- User want suppress findings inline with `@SuppressFBWarnings("RULE_ID")` instead of disable whole rules.

**Skip** for: source-only AST checks (use `pmd`), Java formatting (`google-java-format`), Kotlin lint (`ktlint`), dependency CVEs (`osv-scanner` / `dependency-check`), Docker image scans (`trivy` / `grype`), runtime profiling, or anything need read `.java` directly — spotbugs analyse compiled `.class`.

## Invocation

```bash
# Build first — spotbugs reads bytecode, not source
mvn package -DskipTests          # or: ./gradlew assemble

# Text UI scan, XML report (canonical CI shape)
spotbugs -textui -xml:withMessages=bugs.xml target/myapp.jar

# Scan a class directory (no jar yet)
spotbugs -textui -xml:withMessages=bugs.xml target/classes

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
spotbugs -textui -xml:withMessages=bugs.xml   target/app.jar
spotbugs -textui -html=bugs.html              target/app.jar
spotbugs -textui -emacs                       target/app.jar
spotbugs -textui -sarif=bugs.sarif            target/app.jar

# Plugins — security and extra rules
spotbugs -textui -pluginList find-sec-bugs.jar,fb-contrib.jar -xml=bugs.xml app.jar

# Filter scope (XML filter file, not ruleset list)
spotbugs -textui -include  include-filter.xml -xml=bugs.xml app.jar
spotbugs -textui -exclude  exclude-filter.xml -xml=bugs.xml app.jar
```

`-textui` run headless. Without it, spotbugs launch Swing GUI — fail in CI containers without display.

## Patterns

### Pattern A — first-look scan on a built jar

```bash
spotbugs -textui -effort:default -xml:withMessages=bugs.xml target/myapp.jar
```

Default effort + medium confidence = sweet spot for initial audit. `withMessages` embed human-readable rule descriptions in XML so output self-contained for review tools.

### Pattern B — categories overview

Categories spotbugs report against:

- `CORRECTNESS` — likely bugs (null deref, infinite recursion, unreachable code).
- `MT_CORRECTNESS` — multithreading mistakes (unsynchronised access, double-checked locking).
- `PERFORMANCE` — wasteful patterns (boxing in loops, `String.indexOf("c")`).
- `SECURITY` — surfaced mostly via `find-sec-bugs`; spotbugs core covers smaller set.
- `BAD_PRACTICE` — `equals` without `hashCode`, `Cloneable` without `clone`, `finalize` misuse.
- `DODGY_CODE` — suspicious-but-not-clearly-wrong (unused vars, redundant null checks).
- `MALICIOUS_CODE` — exposing mutable state to untrusted callers.
- `EXPERIMENTAL`, `INTERNATIONALIZATION`, `STYLE` — opt-in / niche.

Filter via `<Bug category="..."/>` in include/exclude XML (Pattern E).

### Pattern C — SARIF for GitHub Code Scanning

```bash
spotbugs -textui -sarif=spotbugs.sarif target/myapp.jar
```

Then upload via `github/codeql-action/upload-sarif@v3` in workflow. Findings appear inline on PRs in Code Scanning UI — far better signal than buried HTML report.

### Pattern D — plugins (`find-sec-bugs`, `fb-contrib`)

```bash
spotbugs -textui \
  -pluginList /opt/plugins/findsecbugs-plugin.jar,/opt/plugins/fb-contrib.jar \
  -xml:withMessages=bugs.xml target/app.jar
```

`find-sec-bugs` add ~140 security rules (SQLi, XSS, weak crypto, deserialisation gadgets) — essential for any service handling untrusted input. `fb-contrib` add ~300 extra general-purpose rules. Plugins are jars; pass absolute paths.

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
spotbugs -textui -exclude exclude-filter.xml -xml=bugs.xml target/app.jar
```

`-include` keep only matches; `-exclude` drop them. Either / both. Filter format same as findbugs — match on `Bug pattern`, `Bug category`, `Class`, `Method`, `Field`, `Source` regex.

### Pattern F — inline suppression with annotations

```java
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

@SuppressFBWarnings(
    value = "EI_EXPOSE_REP",
    justification = "DTO returns an internal array intentionally; immutability enforced upstream."
)
public byte[] payload() { return raw; }
```

Add `spotbugs-annotations` artifact to build. Always include `justification` — code review need see why rule overridden. **Do not** use `@SuppressWarnings("all")` — that javac annotation, spotbugs ignore it.

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

Gradle plugin: `com.github.spotbugs`. Maven plugin: `com.github.spotbugs:spotbugs-maven-plugin` (goal `spotbugs:check`). Both wrap same engine — config keys mirror CLI flags.

### Pattern H — performance: tiered effort

```bash
# PR (fast)
spotbugs -textui -effort:less -high -sarif=sb.sarif target/app.jar

# Nightly (thorough)
spotbugs -textui -effort:max  -low  -sarif=sb.sarif target/app.jar
```

`-effort:max` run full inter-procedural data-flow analysis; on large jars (>50 MB) can take 10–30 minutes. PR jobs run `-effort:less` with `-high` confidence; nightly run `-effort:max -low` and post to dashboard.

## Anti-patterns

- **Don't point spotbugs at `src/main/java/`.** It analyse bytecode. Build first (`mvn package` / `./gradlew assemble`) and pass jar or `target/classes` dir. Pointing at `.java` either error out or silently scan nothing.
- **Don't run `-effort:max` on every commit.** Slow. Use `-effort:less` (or `default`) with `-high` confidence on PR gates; reserve `-effort:max -low` for nightly job.
- **Don't confuse `-include` with PMD's `--rulesets`.** Spotbugs `-include` take XML *filter* scoping which findings to keep; cannot enumerate ruleset jars there. Plugins load via `-pluginList`; rule scope go in filter XML.
- **Don't keep using findbugs.** Unmaintained since 2016 — no Java 11+ support, no modern bytecode handling. Spotbugs drop-in fork; same rule IDs, same filter XML, active releases. Migrate.
- **Don't suppress with `@SuppressWarnings("all")`.** That javac's annotation. Use `@SuppressFBWarnings("RULE_ID")` from `spotbugs-annotations`, pin specific rule, write `justification`. Blanket suppression invisible to spotbugs and next reviewer.
- **Don't ignore SARIF output for GitHub repos.** `-sarif` uploaded via code-scanning workflow surface findings inline on PR review — vastly higher signal than HTML report nobody open. JSON / XML for in-house dashboards; SARIF for the platform.
- **Don't run only spotbugs and call Java analysis "done".** Spotbugs read bytecode; PMD read source AST. Catch different classes of bug — spotbugs catch null-deref via flow analysis + concurrency mistakes; PMD catch API misuse, code smells, structural rules. Run both.
- **Don't omit `-textui` in CI.** Without it spotbugs launch Swing GUI; on headless runner process hang or error with `HeadlessException`.
- **Don't use `-output FILE` as separate flag.** Deprecated since SpotBugs 4.5.0; use `-xml=FILE` / `-sarif=FILE` / `-html=FILE` single-token form. Old form still work but emit deprecation warning.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — JVM section ("scan compiled artefacts with spotbugs; pair with PMD for source-level rules").
- Sister skills: `skills/pmd/SKILL.md` (source-AST static analysis — run alongside), `skills/ktlint/SKILL.md` (Kotlin lint), `skills/google-java-format/SKILL.md` (formatting).
- JSON / SARIF pipelines: `skills/jq/SKILL.md` for post-processing XML→JSON exports; SARIF go to GitHub Code Scanning directly.
- Plugins: `find-sec-bugs` <https://find-sec-bugs.github.io/>, `fb-contrib` <https://fb-contrib.sourceforge.net/>.
- Upstream: <https://spotbugs.github.io/>
- Bug pattern reference: <https://spotbugs.readthedocs.io/en/latest/bugDescriptions.html>
- Filter XML reference: <https://spotbugs.readthedocs.io/en/latest/filter.html>