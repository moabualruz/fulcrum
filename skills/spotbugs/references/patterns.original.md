## Patterns

### Pattern A — first-look scan on a built jar

```bash
spotbugs -textui -effort:default -xml:withMessages=bugs.xml target/myapp.jar
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
spotbugs -textui -sarif=spotbugs.sarif target/myapp.jar
```

Then upload via `github/codeql-action/upload-sarif@v3` in the workflow. Findings appear inline on PRs in the Code Scanning UI — far better signal than a buried HTML report.

### Pattern D — plugins (`find-sec-bugs`, `fb-contrib`)

```bash
spotbugs -textui \
  -pluginList /opt/plugins/findsecbugs-plugin.jar,/opt/plugins/fb-contrib.jar \
  -xml:withMessages=bugs.xml target/app.jar
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
spotbugs -textui -exclude exclude-filter.xml -xml=bugs.xml target/app.jar
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
spotbugs -textui -effort:less -high -sarif=sb.sarif target/app.jar

# Nightly (thorough)
spotbugs -textui -effort:max  -low  -sarif=sb.sarif target/app.jar
```

`-effort:max` runs the full inter-procedural data-flow analysis; on large jars (>50 MB) it can take 10–30 minutes. PR jobs should run `-effort:less` with `-high` confidence; the nightly job runs `-effort:max -low` and posts to the dashboard.
