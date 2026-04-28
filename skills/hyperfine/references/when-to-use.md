## When to use

- The user wants to compare the wall-clock runtime of two or more whole commands and asks for ratios, mean ± stddev, or "is X faster than Y".
- A refactor, version bump, or compiler flag change needs a regression check — run the old and new binary side-by-side.
- The user pipes `time cmd1; time cmd2` and eyeballs the numbers — that's a single sample with no warmup. Replace with hyperfine.
- A parameter sweep is needed: thread count, batch size, input file, optimisation flag.
- The agent needs machine-readable timing data (`--export-json`) for downstream analysis with jq.

**Skip** for: sub-millisecond microbenchmarks (`cargo bench`, `pytest-benchmark`, `tachometer`, `criterion`); in-process CPU profiling (`perf`, `py-spy`, `flamegraph`, `cargo flamegraph`); memory/RSS measurement (`/usr/bin/time -v`, `valgrind --tool=massif`, `heaptrack`); syscall tracing (`strace`, `dtrace`, `bpftrace`); CI performance dashboards (use `bencher`, `codspeed`, or roll your own around hyperfine's JSON).
