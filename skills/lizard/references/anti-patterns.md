## Anti-patterns

- **Don't treat CCN as the only complexity signal.** Cognitive complexity (SonarQube), parameter count, nesting depth, and call-graph fan-out matter too. A 30-branch dispatch table is fine; a 6-branch deeply-nested closure with shared state is not.
- **Don't set CCN < 8 on legacy code without a baseline.** You'll get a flood of false positives. Either use `--ignore_warnings <budget>` to grandfather known offenders, or raise the threshold and ratchet down over time.
- **Don't auto-refactor based on CCN alone.** High-CCN functions are sometimes correct (state machines, parsers, dispatch tables). Have a human triage the warnings list.
- **Don't pipe `--csv` through `jq`.** It's CSV, not JSON. Use `awk`, `miller`, `csvkit`, or `--xml` if you need structured parsing. lizard does not emit JSON.
- **Don't confuse this with the `cyclomatic` PyPI package.** That's Python-only and unmaintained. `lizard` is the cross-language one — install via `pip install lizard` or `brew install lizard`.
- **Don't run lizard on `node_modules/`, `vendor/`, `target/`, or `build/`.** The defaults walk everything; always pass `-x` exclusions or your numbers will be dominated by third-party code.
- **Don't pass `-i N` thinking it limits to top-N functions.** `-i / --ignore_warnings N` is a CI exit-code budget — it lets `N` warnings through before failing. To get top-N by CCN, use `--csv | sort -t, -k2 -nr | head -N`.
- **Don't read the CCN as strict McCabe.** lizard uses a *modified* McCabe: switch arms each add 1, but some short-circuit edges are merged. Numbers are comparable across files inside one run; not 1:1 with other tools.
