## When to use

- The user asks to run PMD, find Java code smells, scan for unused imports / empty catch blocks / dead code / god classes, or apply a custom ruleset.
- The user wants to find duplicated code blocks (copy-paste) across a tree — that's `pmd cpd`, the Copy-Paste Detector shipped in the same distribution.
- The user is wiring a CI gate that fails a PR on new violations or tokens-of-duplication above a threshold.
- The user is auditing Apex / Visualforce (Salesforce), Kotlin, PLSQL, or another supported language with the same ruleset machinery.

**Skip** for: Python (`ruff`), JS/TS (`biome`, `eslint`), Go (`golangci-lint`), Rust (`clippy`); Java *bytecode* bug-finding (`spotbugs` reads `.class`, PMD reads source — they find different bugs and many shops run both); formatting (`google-java-format`, `spotless`); dependency CVEs (`osv-scanner`); type errors (the compiler — PMD assumes the code compiles).
