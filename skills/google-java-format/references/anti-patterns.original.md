## Anti-patterns

- **Don't look for a config file.** google-java-format is intentionally non-configurable — no `.google-java-format`, no `pyproject.toml`-style block, no per-rule toggles. Style is fixed. The only knobs are the CLI flags listed above (`--aosp`, `--skip-*`). This is the philosophy; fighting it wastes hours.
- **Don't mix with `palantir-java-format`.** Both reformat braces, line wrapping, and import order — they fight on every save and produce churn. Pick one and remove the other from the build.
- **Don't treat google-java-format as a substitute for `checkstyle`, `pmd`, or `spotbugs`.** Those are linters and bug detectors; google-java-format is a formatter. They serve different purposes and run side-by-side. Don't disable checkstyle just because gjf passes.
- **Don't run on JDK 16+ without the `--add-exports` flags** (or a recent jar with the bundled manifest). Older jars throw `IllegalAccessError` and silently format nothing.
- **Don't invoke without `--replace` and expect file mutation.** Without it, the tool writes to stdout — easy to miss in a script, agents commonly run it and assume "no change = clean" when in fact the formatted text was discarded.
- **Don't apply mid-PR.** Auto-formatting a feature branch mid-review balloons the diff and reviewers can't tell intent from style. Run once at the PR boundary (or pin to a pre-commit hook so every commit is already formatted).
- **Don't run gjf inside the IDE *and* on save *and* in CI with different versions.** Pin one version (the jar SHA or the Spotless coordinate) and use the matching IntelliJ/Eclipse plugin so all three agree.
- **Don't pipe through `sed`/`awk` after gjf** to "fix one more thing". gjf is a fixed-point formatter — your post-hoc edits will be undone on the next run. Either accept gjf's output or pick a different formatter.
