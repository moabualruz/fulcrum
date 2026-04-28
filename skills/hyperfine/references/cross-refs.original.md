## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — performance section ("benchmark before claiming a speedup").
- Pairs with `cargo bench` / `pytest-benchmark` / `tachometer` for sub-millisecond microbenchmarks; hyperfine is for whole-process timing.
- JSON output → jq: see `skills/jq/SKILL.md` Pattern D (aggregate) for postprocessing `bench.json`.
- Upstream: <https://github.com/sharkdp/hyperfine>
- Manual: `man hyperfine` and <https://github.com/sharkdp/hyperfine#detailed-usage>
