---
name: google-java-format
description: Use this skill whenever the user formats Java source files to a consistent style on the command line — applying Google Java Style or Android (AOSP) style, replacing files in place, or running a CI check that fails on style drift. Trigger phrases include "format a Java file to Google style", "auto-format Java code", "java replacement for prettier", "apply consistent style to a java module", "format Android Java sources to AOSP style", "check if java sources need reformatting", "reformat my .java files", "fix import order in Java". Skip for Kotlin (use ktlint), Scala (scalafmt), JavaScript/TypeScript (biome/prettier/biome), C/C++ (clang-format), and skip when the user wants bug detection or static analysis (spotbugs/pmd) rather than formatting.
---

# google-java-format

## When to use

- The user wants to reformat `.java` sources to Google Java Style — that's `google-java-format --replace`.
- The user is writing or reviewing Android code and asks for AOSP indentation — pass `--aosp`.
- The user wants a CI gate that fails on style drift — `google-java-format --dry-run` lists files that would change and exits non-zero on any.
- The agent is about to write or modify a `.java` file and should leave it formatted.
- The user mentions black / prettier / gofmt and asks for "the Java equivalent" — google-java-format is the canonical answer (Spotless wraps it).

**Skip** for: Kotlin (`ktlint`), Scala (`scalafmt`), Groovy (no consensus formatter), JavaScript/TypeScript (`biome`/`prettier`), C/C++ (`clang-format`), bug detection (`spotbugs`, `pmd`), or static analysis / type errors (`error-prone`, `nullaway`).

## Invocation

```bash
# Reformat in place (the canonical mutation invocation)
java -jar google-java-format.jar --replace src/**/*.java

# CI check — exit non-zero if anything would change; prints filenames
java -jar google-java-format.jar --dry-run src/**/*.java

# Android (AOSP) style — wider 4-space indent, 8-space continuation
java -jar google-java-format.jar --aosp --replace src/**/*.java

# Read from stdin, write to stdout (single dash means stdin)
cat Foo.java | java -jar google-java-format.jar -

# Skip the import sorter / unused-import remover / long-string reflow
java -jar google-java-format.jar --replace --skip-sorting-imports --skip-removing-unused-imports Foo.java

# Homebrew bottle exposes a wrapper binary
google-java-format --replace src/**/*.java
```

`--replace`/`-r` mutates files. Without it, output goes to stdout — agents commonly run the tool, see "no diff", and assume it's a no-op when in fact it printed the formatted source and discarded it. Always pair with `--replace` when you want files changed.

## Patterns

### Pattern A — reformat a module in place

```bash
find src -name '*.java' -print0 | xargs -0 java -jar google-java-format.jar --replace
```

Use `find -print0 | xargs -0` for paths with spaces. The jar accepts an unbounded file list.

### Pattern B — CI check (fail on drift)

```bash
java -jar google-java-format.jar --dry-run $(find src -name '*.java')
# exits 0 if all files are already formatted; non-zero with filenames otherwise
```

Pair this with `--set-exit-if-changed` on older versions if `--dry-run` alone doesn't fail your CI; modern releases (≥1.17) exit non-zero by default when `--dry-run` finds drift.

### Pattern C — Android (AOSP) style

```bash
java -jar google-java-format.jar --aosp --replace android/app/src/main/java/**/*.java
```

`--aosp`/`-a` switches to 4-space indent / 8-space continuation. Don't mix with non-AOSP runs in the same module — the styles are not interoperable and will fight each other on every commit.

### Pattern D — read from stdin

```bash
cat Foo.java | java -jar google-java-format.jar -
git show HEAD:src/Foo.java | java -jar google-java-format.jar -
```

The single dash `-` means "read stdin, write stdout". Useful for editor integrations and for previewing what a file would look like without mutating it.

### Pattern E — skip the opinionated extras

```bash
java -jar google-java-format.jar --replace \
  --skip-sorting-imports \
  --skip-removing-unused-imports \
  --skip-reflowing-long-strings \
  src/**/*.java
```

Each flag turns off one transformation. Use sparingly — most teams want all three on. Skip-sorting is sometimes useful when the project has a non-standard import grouping enforced elsewhere.

### Pattern F — JDK 17+ `--add-exports` requirement

```bash
java \
  --add-exports jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED \
  --add-exports jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED \
  -jar google-java-format.jar --replace src/**/*.java
```

JDK ≥11 is required (older releases supported JDK 8). On JDK 17+ the JVM seals `jdk.compiler` internals; recent jar releases ship a manifest that handles this transparently, but if you see `IllegalAccessError` or `module jdk.compiler does not export ...`, add the six `--add-exports` flags above.

### Pattern G — build integration

```bash
# Maven (Spotify's fmt-maven-plugin is the most common wrapper)
mvn com.spotify.fmt:fmt-maven-plugin:format          # mutate
mvn com.spotify.fmt:fmt-maven-plugin:check           # CI gate

# Gradle (via Spotless — the canonical orchestrator)
./gradlew spotlessApply                              # mutate
./gradlew spotlessCheck                              # CI gate

# Bazel — use rules_java + a genrule wrapping the jar
```

Spotless wraps multiple formatters (google-java-format, palantir-java-format, prettier-java) and is the recommended Gradle integration. The Maven plugins call the jar directly.

## Anti-patterns

- **Don't look for a config file.** google-java-format is intentionally non-configurable — no `.google-java-format`, no `pyproject.toml`-style block, no per-rule toggles. Style is fixed. The only knobs are the CLI flags listed above (`--aosp`, `--skip-*`). This is the philosophy; fighting it wastes hours.
- **Don't mix with `palantir-java-format`.** Both reformat braces, line wrapping, and import order — they fight on every save and produce churn. Pick one and remove the other from the build.
- **Don't treat google-java-format as a substitute for `checkstyle`, `pmd`, or `spotbugs`.** Those are linters and bug detectors; google-java-format is a formatter. They serve different purposes and run side-by-side. Don't disable checkstyle just because gjf passes.
- **Don't run on JDK 17+ without the `--add-exports` flags** (or a recent jar with the bundled manifest). Older jars throw `IllegalAccessError` and silently format nothing.
- **Don't invoke without `--replace` and expect file mutation.** Without it, the tool writes to stdout — easy to miss in a script, agents commonly run it and assume "no change = clean" when in fact the formatted text was discarded.
- **Don't apply mid-PR.** Auto-formatting a feature branch mid-review balloons the diff and reviewers can't tell intent from style. Run once at the PR boundary (or pin to a pre-commit hook so every commit is already formatted).
- **Don't run gjf inside the IDE *and* on save *and* in CI with different versions.** Pin one version (the jar SHA or the Spotless coordinate) and use the matching IntelliJ/Eclipse plugin so all three agree.
- **Don't pipe through `sed`/`awk` after gjf** to "fix one more thing". gjf is a fixed-point formatter — your post-hoc edits will be undone on the next run. Either accept gjf's output or pick a different formatter.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "format Java with google-java-format; never hand-roll style fixes".
- Hook recipe: `format` in `docs/hooks.md` is wired to run `google-java-format --replace` on `*.java` writes.
- Peer formatters: `skills/ruff/SKILL.md` (Python), `skills/biome/SKILL.md` (JS/TS) — same shape, different language.
- Upstream: <https://github.com/google/google-java-format>
- Style guide: <https://google.github.io/styleguide/javaguide.html>
- Spotless (Gradle wrapper): <https://github.com/diffplug/spotless>
