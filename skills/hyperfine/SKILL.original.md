---
name: hyperfine
description: Use this skill whenever the user wants to benchmark, time, or compare the wall-clock performance of one or more command-line programs with statistical rigor. Trigger phrases include "benchmark a command line tool", "compare the speed of two scripts", "measure performance regression", "time a command with statistics", "is X faster than Y", "run a CLI benchmark with warmup", "how fast does this binary run", "compare old vs new build", "parameter sweep over thread counts". hyperfine handles warmup runs, ≥10 samples, mean/stddev/min/max, ratio output, and JSON/CSV/Markdown export. Skip this skill for sub-millisecond microbenchmarks (use `cargo bench`, `pytest-benchmark`, `tachometer`), in-process profiling (use `perf`, `py-spy`, `flamegraph`), memory measurement (use `/usr/bin/time -v`, `valgrind --tool=massif`), or syscall tracing (use `strace`, `dtrace`).
---

# hyperfine

## When to use

- The user wants to compare the wall-clock runtime of two or more whole commands and asks for ratios, mean ± stddev, or "is X faster than Y".
- A refactor, version bump, or compiler flag change needs a regression check — run the old and new binary side-by-side.
- The user pipes `time cmd1; time cmd2` and eyeballs the numbers — that's a single sample with no warmup. Replace with hyperfine.
- A parameter sweep is needed: thread count, batch size, input file, optimisation flag.
- The agent needs machine-readable timing data (`--export-json`) for downstream analysis with jq.

**Skip** for: sub-millisecond microbenchmarks (`cargo bench`, `pytest-benchmark`, `tachometer`, `criterion`); in-process CPU profiling (`perf`, `py-spy`, `flamegraph`, `cargo flamegraph`); memory/RSS measurement (`/usr/bin/time -v`, `valgrind --tool=massif`, `heaptrack`); syscall tracing (`strace`, `dtrace`, `bpftrace`); CI performance dashboards (use `bencher`, `codspeed`, or roll your own around hyperfine's JSON).

## Invocation

```bash
# Compare two commands — each run ≥10 times with 0 warmups by default
hyperfine 'cmd1 args' 'cmd2 args'

# Add warmup runs (NOT counted in stats) — critical for I/O or JIT
hyperfine --warmup 3 'rg foo .' 'grep -r foo .'

# Fix the sample count (default is adaptive: min 10, capped by time)
hyperfine --runs 50 'cmd'
hyperfine --min-runs 20 --max-runs 200 'cmd'

# Run a setup command before each timed iteration (drop caches, regenerate input)
hyperfine --prepare 'sync && echo 3 > /proc/sys/vm/drop_caches' 'cat big.bin'

# One-time setup (before all runs, not timed)
hyperfine --setup './build.sh' --cleanup 'rm -rf out/' 'bin/app'

# Skip shell wrapping — closer to real timing for short commands
hyperfine --shell=none 'rg foo' 'grep -r foo'

# Export structured results
hyperfine --export-json bench.json --export-markdown bench.md 'cmd1' 'cmd2'

# See the command's stdout/stderr (otherwise suppressed)
hyperfine --show-output 'cmd1' 'cmd2'
```

## Patterns

### Pattern A — head-to-head comparison

```bash
hyperfine --warmup 3 --runs 30 \
  'rg --no-ignore foo .' \
  'grep -r foo .'
```

Output ends with `Summary` showing the fastest and the ratio (e.g. `rg ran 12.3 ± 0.4 times faster than grep`). Aim for stddev/mean ratio under 5%; rerun if not.

### Pattern B — warmup for cache-sensitive workloads

```bash
hyperfine --warmup 5 'cat 4gb.bin > /dev/null'
```

The first read populates the page cache; subsequent runs hit RAM. Without warmup the mean is dominated by the cold-cache outlier. For the *cold* case, use `--prepare` to drop caches between runs (Linux only).

### Pattern C — regression check across versions

```bash
hyperfine --warmup 3 --runs 50 \
  --export-json bench.json \
  -n old './bin-old --process input.txt' \
  -n new './bin-new --process input.txt'
```

`-n/--command-name` labels each command in the report and JSON. Then:

```bash
jq '.results | map({name, mean, stddev}) | sort_by(.mean)' bench.json
```

### Pattern D — parameter sweep with `-L`

```bash
hyperfine -L threads 1,2,4,8,16 'sort --parallel={threads} big.txt'
```

`{threads}` is interpolated into each command. Multiple `-L` flags create the cross-product:

```bash
hyperfine \
  -L impl rg,grep \
  -L pattern foo,bar \
  '{impl} {pattern} corpus/'
```

### Pattern E — JSON pipeline with jq

```bash
hyperfine --warmup 2 --export-json b.json 'a' 'b' 'c'
jq -r '.results | sort_by(.mean) | .[] | "\(.command)\t\(.mean)"' b.json
```

The JSON schema includes `command`, `mean`, `stddev`, `median`, `min`, `max`, `times[]`, and `exit_codes[]`. Pipe through jq for custom comparison logic.

### Pattern F — tolerate failure (e.g. negative-test benchmark)

```bash
hyperfine -i 'cmd-that-may-fail'
```

`-i/--ignore-failure` keeps measuring even when the command exits non-zero. Without it, hyperfine aborts the whole run on the first failure.

### Pattern G — choose the shell (or skip it)

```bash
hyperfine --shell=none 'rg foo' 'grep foo'        # ~1ms shell overhead saved
hyperfine --shell=bash 'shopt -s globstar; ls **/*.rs | wc -l'   # need bash features
```

`--shell=none` execs the command directly (faster, more accurate for short commands but no `|`, `>`, glob expansion, or env interpolation). hyperfine measures shell startup once and subtracts it; for sub-10 ms commands, prefer `--shell=none`.

## Anti-patterns

- **Don't skip `--warmup`** for I/O- or compile-heavy commands. The first run pays cold page-cache, JIT, or DNS costs and distorts the mean by 10×+. Use `--warmup 3` minimum; `--warmup 10` for filesystem traversal.
- **Don't benchmark inside the shell that runs your editor / IDE / browser.** Background CPU and disk activity inject noise. Quiet the box: close other apps, disable Spotlight indexing, plug laptops in (battery throttles), check Activity Monitor / `htop` for idle.
- **Don't trust `--runs 1`.** That's not a benchmark — it's a single sample with infinite variance. The default ≥10 is the floor.
- **Don't measure microsecond-scale work.** hyperfine's process-spawn and OS scheduler jitter dominate below ~1 ms. For sub-ms work use `cargo bench` (Rust), `pytest-benchmark` (Python), `tachometer` (JS), or `criterion`.
- **Don't compare commands that produce different output.** A "fast" command that does less work isn't faster. Run once with `--show-output` and diff the results before believing the ratio.
- **Don't trust ratios on noisy hardware.** If stddev/mean exceeds ~5%, the result is unreliable. Re-run, increase `--runs`, or quiet the machine. Thermal throttling on laptops is a silent killer — hyperfine corrects for shell startup but not for CPU frequency scaling.
- **Don't conflate hyperfine with profiling.** It tells you *how long* — not *where* the time went. Pair with `perf record` / `py-spy record` / `cargo flamegraph` to find hotspots.
- **Don't use `time cmd1; time cmd2`** and call it a benchmark. No warmup, no repeats, no statistics.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — performance section ("benchmark before claiming a speedup").
- Pairs with `cargo bench` / `pytest-benchmark` / `tachometer` for sub-millisecond microbenchmarks; hyperfine is for whole-process timing.
- JSON output → jq: see `skills/jq/SKILL.md` Pattern D (aggregate) for postprocessing `bench.json`.
- Upstream: <https://github.com/sharkdp/hyperfine>
- Manual: `man hyperfine` and <https://github.com/sharkdp/hyperfine#detailed-usage>
