## Anti-patterns

- **Don't** point PMD at a bytecode dir (`target/classes`, `build/classes`). PMD reads **source**. That's `spotbugs`'s territory; running PMD over `.class` files just errors.
- **Don't** run `quickstart.xml` on a legacy codebase and call the output a triage list — it's opinionated and you'll drown. Vendor a custom ruleset and grow it deliberately.
- **Don't** use the `--rulesets` shorthand pointing at a remote URL without pinning. Either vendor the XML in-repo or pin a versioned URL — silent ruleset drift between CI runs is a debugging nightmare.
- **Don't** ignore deprecation warnings in PMD's startup output. PMD 7 deprecated many PMD 6 rules and renamed others; rules that vanish silently turn into "we no longer check that" without anyone noticing.
- **Don't** confuse `pmd check` and `pmd cpd`. Different tools, different flags, different output. "Find duplicates" → `cpd`. "Find smells" → `check`.
- **Don't** suppress with `@SuppressWarnings("all")` — it disables the Java compiler warnings *and* every other tool keyed on that annotation. Use `@SuppressWarnings("PMD.SpecificRule")` (or `"PMD"` to silence only PMD) and add a comment explaining why.
- **Don't** skip `--cache` on repeated runs. Without it, every invocation re-parses every file; with it, only changed files re-analyze. Multi-minute scans drop to seconds.
- **Don't** treat PMD as a security scanner. `category/java/security.xml` is narrow (a few hard-coded patterns); pair PMD with `semgrep` or `spotbugs`'s `findsecbugs` plugin for real SAST coverage.
