## When to use

- The user wants to scan a built Java artifact (`.jar`, `.war`, `target/classes/`, `build/classes/`) for bug patterns: null deref, infinite recursion, unclosed streams, broken `equals`/`hashCode`, wrong synchronisation, suspicious casts.
- The user mentions findbugs — it has been unmaintained since 2016; spotbugs is the drop-in fork and what every modern build uses.
- CI needs a Java static-analysis gate that emits SARIF for GitHub Code Scanning, or HTML / XML for a build-artifact dashboard.
- The user wants to combine the security plugin (`find-sec-bugs`) or the extra-rules plugin (`fb-contrib`) with the core detectors.
- The user wants to suppress findings inline with `@SuppressFBWarnings("RULE_ID")` rather than disabling whole rules.

**Skip** for: source-only AST checks (use `pmd`), Java formatting (`google-java-format`), Kotlin lint (`ktlint`), dependency CVEs (`osv-scanner` / `dependency-check`), Docker image scans (`trivy` / `grype`), runtime profiling, or anything that requires reading `.java` files directly — spotbugs analyses the compiled `.class`.
