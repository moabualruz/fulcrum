## When to use

- The user wants to *read* a source file, config, or small log with syntax colors and line numbers.
- The agent prints a file back to the user as part of an explanation — `bat` produces far more legible output than `cat`.
- Piping JSON / YAML / a diff to the terminal and wanting it colorized (with `--paging=never --color=always`).
- A syntax-aware diff between two files (`bat --diff` or `bat -d`).

**Skip** for: plain concatenation (`cat a b > c`), `tail -f`, hex/binary inspection, in-editor reads, and content search (jobs for `rg`/`grep`).
