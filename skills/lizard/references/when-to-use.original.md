## When to use

- The user asks for cyclomatic complexity (CCN/McCabe), function length (NLOC), or parameter-count metrics across a tree.
- A reviewer wants a list of the top-N most complex functions in a repo to prioritise refactoring.
- CI needs a hard gate that fails when any function exceeds a CCN, length, or argument threshold.
- The codebase is polyglot (C++ + Python + TS, etc.) and you need one tool that walks them all.
- The user pipes "find me the longest functions" or "which functions have too many branches" — that's lizard.

**Skip** for: raw line counting (`cloc`, `tokei`); duplicate-block detection (`jscpd` — lizard's `--duplicate` is partial); bug-pattern static analysis (`semgrep`, `codeql`); cognitive complexity per SonarQube definition (CCN ≠ cognitive complexity); formatting / linting (`ruff`, `biome`, `prettier`, `clang-format`).
