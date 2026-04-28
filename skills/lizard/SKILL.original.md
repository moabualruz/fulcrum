---
name: lizard
description: Use this skill whenever the user wants to measure cyclomatic complexity, find overly complex functions, audit code complexity, or generate a complexity report for a codebase. Trigger phrases include "measure cyclomatic complexity", "find overly complex functions", "audit code complexity", "complexity report for a codebase", "find functions over N lines or branches", "fail CI when a function exceeds N branches", "which functions are too long", "report CCN across the repo", "scan a multi-language codebase for hotspots". lizard is a single-binary, multi-language analyzer covering C/C++, Java, Python, JS/TS, Go, Rust, Swift, Objective-C, C#, Kotlin, PHP, Lua, Scala, Ruby, Erlang and more — no per-language toolchain needed. Skip this skill for raw line counting (use `cloc`/`tokei`), duplicate-block detection (use `jscpd`), bug-pattern static analysis (use `semgrep`), code formatting (use the language's formatter), or style linting.
---

# lizard

## When to use

- The user asks for cyclomatic complexity (CCN/McCabe), function length (NLOC), or parameter-count metrics across a tree.
- A reviewer wants a list of the top-N most complex functions in a repo to prioritise refactoring.
- CI needs a hard gate that fails when any function exceeds a CCN, length, or argument threshold.
- The codebase is polyglot (C++ + Python + TS, etc.) and you need one tool that walks them all.
- The user pipes "find me the longest functions" or "which functions have too many branches" — that's lizard.

**Skip** for: raw line counting (`cloc`, `tokei`); duplicate-block detection (`jscpd` — lizard's `--duplicate` is partial); bug-pattern static analysis (`semgrep`, `codeql`); cognitive complexity per SonarQube definition (CCN ≠ cognitive complexity); formatting / linting (`ruff`, `biome`, `prettier`, `clang-format`).

## Invocation

```bash
# Basic — recursive scan, per-function table + module summary
lizard <path>

# Single language only
lizard -l python src/
lizard -l cpp -l c src/        # stack flags for multi-pick

# Exclude paths (glob, repeatable)
lizard -x './build/*' -x './vendor/*' .

# Thresholds (CCN / length / parameter count)
lizard -C 10 -L 60 -a 5 src/

# CI budget: tolerate up to N existing warnings without failing
lizard -C 10 -L 60 --warnings_only --ignore_warnings 5 src/

# Top-N most complex functions (lizard has no native top-N flag — sort + head)
lizard --csv src/ | sort -t, -k2 -nr | head -20      # CSV columns: NLOC,CCN,token,...

# Warnings-only mode (CI gate — exits non-zero on threshold violation)
lizard -C 10 -L 60 -a 5 --warnings_only src/

# Structured output for tooling
lizard --csv src/        > complexity.csv
lizard --xml src/        > complexity.xml   # CCCC-compatible XML
lizard --html src/       > complexity.html  # human report

# Parallel scan on big trees
lizard --working_threads 8 .
```

## Patterns

### Pattern A — first-look audit

```bash
lizard .                                             # full per-function table + module summary
lizard --csv . | sort -t, -k2 -nr | head -20         # top 20 by CCN
```

`lizard` has no native top-N flag. The default CCN warning threshold is 15; `-C N` overrides. The summary prints avg NLOC, avg CCN, function count, and warning count at the end.

### Pattern B — CI gate

```bash
lizard -C 10 -L 60 -a 5 --warnings_only --ignore_warnings 0 .
```

Tightens to CCN ≤ 10, length ≤ 60 NLOC, ≤ 5 parameters. `--warnings_only` suppresses the per-function table and prints only the violators; the process exits non-zero when any remain. `--ignore_warnings N` allows a budget of `N` known-bad functions before failing — useful while paying down a baseline.

### Pattern C — single-language drill-down

```bash
lizard -l python -x './tests/*' -C 10 src/           # tighter CCN threshold for one language
```

`-l <lang>` restricts the parser; lizard's language list is documented at <https://github.com/terryyin/lizard#languages> (C/C++, C#, Java, JS, TS, Python, Go, Rust, Swift, Objective-C, Kotlin, PHP, Lua, Scala, Ruby, and several more depending on the installed version). There is no `-l ?` query syntax — consult the README or `pip show lizard`.

### Pattern D — structured output → spreadsheet or CI artefact

```bash
lizard --csv . > complexity.csv
lizard --xml . > complexity.xml      # consumed by Jenkins CCCC plugin
lizard --html . > complexity.html
```

The CSV columns are `NLOC,CCN,token,PARAM,length,location`. Open in Excel / Numbers, or post-process with `awk` / `miller`. Avoid `--csv | jq` — the row format isn't JSON; XML or HTML is the structured path for reports.

### Pattern E — focus on hotspots that exceed a threshold

```bash
lizard -C 15 . | awk '/^[[:space:]]*[0-9]/ && $2 > 15'
```

Or, more cleanly, use `--warnings_only` and let lizard do the filtering. The warnings table is the right input for "give me the list of functions to refactor".

### Pattern F — per-extension include filter

```bash
lizard -l java -x './target/*' -x './src/test/*' --working_threads 8 .
```

`-x` is glob (not regex). Combine with `--working_threads` on large trees — lizard parallelises across files.

### Pattern G — diff a baseline

```bash
lizard --csv old/ > before.csv
lizard --csv new/ > after.csv
diff <(sort before.csv) <(sort after.csv)
```

No native diff mode — capture two CSVs and diff. Pair with hyperfine or git pre-push hook to flag regressions.

## Anti-patterns

- **Don't treat CCN as the only complexity signal.** Cognitive complexity (SonarQube), parameter count, nesting depth, and call-graph fan-out matter too. A 30-branch dispatch table is fine; a 6-branch deeply-nested closure with shared state is not.
- **Don't set CCN < 8 on legacy code without a baseline.** You'll get a flood of false positives. Either use `--ignore_warnings <budget>` to grandfather known offenders, or raise the threshold and ratchet down over time.
- **Don't auto-refactor based on CCN alone.** High-CCN functions are sometimes correct (state machines, parsers, dispatch tables). Have a human triage the warnings list.
- **Don't pipe `--csv` through `jq`.** It's CSV, not JSON. Use `awk`, `miller`, `csvkit`, or `--xml` if you need structured parsing. lizard does not emit JSON.
- **Don't confuse this with the `cyclomatic` PyPI package.** That's Python-only and unmaintained. `lizard` is the cross-language one — install via `pip install lizard` or `brew install lizard`.
- **Don't run lizard on `node_modules/`, `vendor/`, `target/`, or `build/`.** The defaults walk everything; always pass `-x` exclusions or your numbers will be dominated by third-party code.
- **Don't pass `-i N` thinking it limits to top-N functions.** `-i / --ignore_warnings N` is a CI exit-code budget — it lets `N` warnings through before failing. To get top-N by CCN, use `--csv | sort -t, -k2 -nr | head -N`.
- **Don't read the CCN as strict McCabe.** lizard uses a *modified* McCabe: switch arms each add 1, but some short-circuit edges are merged. Numbers are comparable across files inside one run; not 1:1 with other tools.

## Cross-refs

- Behavioural rule: see `rules/AGENTS.md` — complexity section ("flag functions over CCN 15 or 60 NLOC before submitting").
- Pairs with `cloc` / `tokei` for raw line counts, `jscpd` for duplicates, `semgrep` for bug patterns, `radon` (Python-only) for cognitive complexity.
- CSV postprocessing: see `skills/jq/SKILL.md` only after converting CSV→JSON (`mlr --c2j cat`); lizard itself does not emit JSON.
- Upstream: <https://github.com/terryyin/lizard>
