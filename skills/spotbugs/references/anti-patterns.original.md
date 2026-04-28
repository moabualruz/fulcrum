## Anti-patterns

- **Don't point spotbugs at `src/main/java/`.** It analyses bytecode. Build first (`mvn package` / `./gradlew assemble`) and pass the jar or `target/classes` directory. Pointing at `.java` either errors out or silently scans nothing.
- **Don't run `-effort:max` on every commit.** It's slow. Use `-effort:less` (or `default`) with `-high` confidence on PR gates and reserve `-effort:max -low` for a nightly job.
- **Don't confuse `-include` with PMD's `--rulesets`.** Spotbugs `-include` takes an XML *filter* scoping which findings to keep; you cannot enumerate ruleset jars there. Plugins load via `-pluginList`; rule scope goes in the filter XML.
- **Don't keep using findbugs.** Findbugs has been unmaintained since 2016 — no Java 11+ support, no modern bytecode handling. Spotbugs is the drop-in fork; same rule IDs, same filter XML, active releases. Migrate.
- **Don't suppress with `@SuppressWarnings("all")`.** That's javac's annotation. Use `@SuppressFBWarnings("RULE_ID")` from `spotbugs-annotations`, pin the specific rule, and write a `justification`. A blanket suppression is invisible to spotbugs and to the next reviewer.
- **Don't ignore SARIF output for GitHub repos.** `-sarif` uploaded via the code-scanning workflow surfaces findings inline on PR review — vastly higher signal than an HTML report nobody opens. JSON / XML are for in-house dashboards; SARIF is for the platform.
- **Don't run only spotbugs and call Java analysis "done".** Spotbugs reads bytecode; PMD reads source AST. They catch different classes of bug — spotbugs catches null-deref via flow analysis and concurrency mistakes; PMD catches API misuse, code smells, and structural rules. Run both.
- **Don't omit `-textui` in CI.** Without it spotbugs launches the Swing GUI; on a headless runner the process hangs or errors with `HeadlessException`.
- **Don't use `-output FILE` as a separate flag.** It's deprecated since SpotBugs 4.5.0; use the `-xml=FILE` / `-sarif=FILE` / `-html=FILE` single-token form instead. The old form still works but emits a deprecation warning.
