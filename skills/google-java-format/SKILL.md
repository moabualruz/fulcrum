---
name: google-java-format
description: Use this skill whenever user formats Java source files to consistent style on command line — apply Google Java Style or Android (AOSP) style, replace files in place, or run CI check that fails on style drift. Trigger phrases: "format a Java file to Google style", "auto-format Java code", "java replacement for prettier", "apply consistent style to a java module", "format Android Java sources to AOSP style", "check if java sources need reformatting", "reformat my .java files", "fix import order in Java". Skip for Kotlin (use ktlint), Scala (scalafmt), JavaScript/TypeScript (biome/prettier/biome), C/C++ (clang-format), and skip when user wants bug detection or static analysis (spotbugs/pmd) not formatting.
---

# google-java-format

## When to use

- User want reformat `.java` sources to Google Java Style — `google-java-format --replace`.
- User writing/reviewing Android code, ask AOSP indent — pass `--aosp`.
- User want CI gate fail on style drift — `google-java-format --dry-run` lists files would change, exits non-zero on any.
- Agent about to write or modify `.java` file, leave formatted.
- User mention black / prettier / gofmt, ask "Java equivalent" — google-java-format canonical answer (Spotless wraps it).

**Skip** for: Kotlin (`ktlint`), Scala (`scalafmt`), Groovy (no consensus formatter), JavaScript/TypeScript (`biome`/`prettier`), C/C++ (`clang-format`), bug detection (`spotbugs`, `pmd`), static analysis / type errors (`error-prone`, `nullaway`).

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
java -jar google-java-format.jar --replace --skip-sorting-imports --skip-removing-unused-import Foo.java

# Homebrew bottle exposes a wrapper binary
google-java-format --replace src/**/*.java
```

`--replace`/`-r` mutates files. Without it, output go stdout — agents commonly run tool, see "no diff", assume no-op when in fact printed formatted source and discarded. Always pair with `--replace` when want files changed.

## Patterns

### Pattern A — reformat a module in place

```bash
find src -name '*.java' -print0 | xargs -0 java -jar google-java-format.jar --replace
```

Use `find -print0 | xargs -0` for paths with spaces. Jar accept unbounded file list.

### Pattern B — CI check (fail on drift)

```bash
java -jar google-java-format.jar --dry-run $(find src -name '*.java')
# exits 0 if all files are already formatted; non-zero with filenames otherwise
```

Pair with `--set-exit-if-changed` on older versions if `--dry-run` alone don't fail CI; modern releases (≥1.17) exit non-zero by default when `--dry-run` finds drift.

### Pattern C — Android (AOSP) style

```bash
java -jar google-java-format.jar --aosp --replace android/app/src/main/java/**/*.java
```

`--aosp`/`-a` switches to 4-space indent / 8-space continuation. Don't mix with non-AOSP runs in same module — styles not interoperable, fight each other on every commit.

### Pattern D — read from stdin

```bash
cat Foo.java | java -jar google-java-format.jar -
git show HEAD:src/Foo.java | java -jar google-java-format.jar -
```

Single dash `-` means "read stdin, write stdout". Useful for editor integrations and previewing file without mutating.

### Pattern E — skip the opinionated extras

```bash
java -jar google-java-format.jar --replace \
  --skip-sorting-imports \
  --skip-removing-unused-import \
  --skip-reflowing-long-strings \
  src/**/*.java
```

Each flag turn off one transformation. Use sparingly — most teams want all three on. Skip-sorting sometimes useful when project has non-standard import grouping enforced elsewhere.

### Pattern F — JDK 16+ `--add-exports` requirement

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

JDK 21+ required (older 1.x lines supported JDK 11; recent releases ≥1.22 require JDK 21). On JDK 16+ JVM seals `jdk.compiler` internals; recent jar releases ship manifest handling this transparently, but if see `IllegalAccessError` or `module jdk.compiler does not export ...`, add six `--add-exports` flags above.

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

Spotless wraps multiple formatters (google-java-format, palantir-java-format, prettier-java); recommended Gradle integration. Maven plugins call jar directly.

## Anti-patterns

- **Don't look for config file.** google-java-format intentionally non-configurable — no `.google-java-format`, no `pyproject.toml`-style block, no per-rule toggles. Style fixed. Only knobs are CLI flags above (`--aosp`, `--skip-*`). Philosophy; fighting it waste hours.
- **Don't mix with `palantir-java-format`.** Both reformat braces, line wrapping, import order — fight on every save, produce churn. Pick one, remove other from build.
- **Don't treat google-java-format as substitute for `checkstyle`, `pmd`, or `spotbugs`.** Those are linters and bug detectors; google-java-format is formatter. Different purposes, run side-by-side. Don't disable checkstyle just because gjf passes.
- **Don't run on JDK 16+ without `--add-exports` flags** (or recent jar with bundled manifest). Older jars throw `IllegalAccessError` and silently format nothing.
- **Don't invoke without `--replace` and expect file mutation.** Without it, tool writes to stdout — easy to miss in script, agents commonly run it and assume "no change = clean" when formatted text was discarded.
- **Don't apply mid-PR.** Auto-formatting feature branch mid-review balloons diff, reviewers can't tell intent from style. Run once at PR boundary (or pin to pre-commit hook so every commit already formatted).
- **Don't run gjf inside IDE *and* on save *and* in CI with different versions.** Pin one version (jar SHA or Spotless coordinate), use matching IntelliJ/Eclipse plugin so all three agree.
- **Don't pipe through `sed`/`awk` after gjf** to "fix one more thing". gjf is fixed-point formatter — post-hoc edits undone on next run. Either accept gjf output or pick different formatter.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — "format Java with google-java-format; never hand-roll style fixes".
- Hook recipe: `format` in `docs/hooks.md` wired to run `google-java-format --replace` on `*.java` writes.
- Peer formatters: `skills/ruff/SKILL.md` (Python), `skills/biome/SKILL.md` (JS/TS) — same shape, different language.
- Upstream: <https://github.com/google/google-java-format>
- Style guide: <https://google.github.io/styleguide/javaguide.html>
- Spotless (Gradle wrapper): <https://github.com/diffplug/spotless>