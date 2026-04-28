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
