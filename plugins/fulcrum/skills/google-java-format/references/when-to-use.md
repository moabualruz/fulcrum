## When to use

- The user wants to reformat `.java` sources to Google Java Style — that's `google-java-format --replace`.
- The user is writing or reviewing Android code and asks for AOSP indentation — pass `--aosp`.
- The user wants a CI gate that fails on style drift — `google-java-format --dry-run` lists files that would change and exits non-zero on any.
- The agent is about to write or modify a `.java` file and should leave it formatted.
- The user mentions black / prettier / gofmt and asks for "the Java equivalent" — google-java-format is the canonical answer (Spotless wraps it).

**Skip** for: Kotlin (`ktlint`), Scala (`scalafmt`), Groovy (no consensus formatter), JavaScript/TypeScript (`biome`/`prettier`), C/C++ (`clang-format`), bug detection (`spotbugs`, `pmd`), or static analysis / type errors (`error-prone`, `nullaway`).
