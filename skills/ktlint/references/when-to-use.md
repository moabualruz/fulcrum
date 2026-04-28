## When to use

- The user wants to lint or format `.kt` / `.kts` sources — find indentation, import-order, wildcard-import, no-semicolon, trailing-comma, naming, and chain-wrapping issues, then fix them.
- The user mentions Kotlin coding conventions, the official Kotlin style guide, Android's Kotlin style, or "the strict subset of IntelliJ formatter that ktlint enforces".
- The agent is wiring CI for a Kotlin/Android repo and needs a check that fails on style drift, plus a `--format` step for local pre-commit.
- The user wants `.editorconfig` to be the single source of truth so IntelliJ and the CLI agree.

**Skip** for: Java (use `google-java-format`, `checkstyle`, or `pmd`), Scala (`scalafmt`), Groovy `build.gradle` (use `spotless` or `npm-groovy-lint`), Swift (`swift-format` / `swiftlint`), Kotlin **type errors** (use `kotlinc -Werror` or the IDE — ktlint is purely syntactic), or Android-specific lint rules beyond style (use `lint` / `detekt`).
