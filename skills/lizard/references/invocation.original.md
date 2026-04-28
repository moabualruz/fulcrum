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
