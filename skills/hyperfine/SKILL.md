---
name: hyperfine
description: Use this skill whenever the user wants to benchmark, time, or compare the wall-clock performance of one or more command-line programs with statistical rigor. Trigger phrases include "benchmark a command line tool", "compare the speed of two scripts", "measure performance regression", "time a command with statistics", "is X faster than Y", "run a CLI benchmark with warmup", "how fast does this binary run", "compare old vs new build", "parameter sweep over thread counts". hyperfine handles warmup runs, ≥10 samples, mean/stddev/min/max, ratio output, and JSON/CSV/Markdown export. Skip this skill for sub-millisecond microbenchmarks (use `cargo bench`, `pytest-benchmark`, `tachometer`), in-process profiling (use `perf`, `py-spy`, `flamegraph`), memory measurement (use `/usr/bin/time -v`, `valgrind --tool=massif`), or syscall tracing (use `strace`, `dtrace`).
---

# hyperfine

## When to use

- User want compare wall-clock runtime of two+ whole commands. Ask ratios, mean ± stddev, "is X faster than Y".
- Refactor, version bump, compiler flag change need regression check — run old + new binary side-by-side.
- User pipe `time cmd1; time cmd2` + eyeball numbers — single sample, no warmup. Replace with hyperfine.
- Parameter sweep: thread count, batch size, input file, optimisation flag.
- Agent need machine-readable timing data (`--export-json`) for downstream jq analysis.

**Skip** for: sub-millisecond microbenchmarks (`cargo bench`, `pytest-benchmark`, `tachometer`, `criterion`); in-process CPU profiling (`perf`, `py-spy`, `flamegraph`, `cargo flamegraph`); memory/RSS measurement (`/usr/bin/time -v`, `valgrind --tool=massif`, `heaptrack`); syscall tracing (`strace`, `dtrace`, `bpftrace`); CI perf dashboards (use `bencher`, `codspeed`, or roll own around hyperfine JSON).

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

Output end with `Summary` show fastest + ratio (e.g. `rg ran 12.3 ± 0.4 times faster than grep`). Aim stddev/mean ratio under 5%; rerun if not.

### Pattern B — warmup for cache-sensitive workloads

```bash
hyperfine --warmup 5 'cat 4gb.bin > /dev/null'
```

First read populate page cache; later runs hit RAM. No warmup → mean dominated by cold-cache outlier. For *cold* case, use `--prepare` drop caches between runs (Linux only).

### Pattern C — regression check across versions

```bash
hyperfine --warmup 3 --runs 50 \
  --export-json bench.json \
  -n old './bin-old --process input.txt' \
  -n new './bin-new --process input.txt'
```

`-n/--command-name` label each command in report + JSON. Then:

```bash
jq '.results | map({name, mean, stddev}) | sort_by(.mean)' bench.json
```

### Pattern D — parameter sweep with `-L`

```bash
hyperfine -L threads 1,2,4,8,16 'sort --parallel={threads} big.txt'
```

`{threads}` interpolated into each command. Multiple `-L` flags = cross-product:

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

JSON schema include `command`, `mean`, `stddev`, `median`, `min`, `max`, `times[]`, `exit_codes[]`. Pipe through jq for custom compare logic.

### Pattern F — tolerate failure (e.g. negative-test benchmark)

```bash
hyperfine -i 'cmd-that-may-fail'
```

`-i/--ignore-failure` keep measuring even when command exit non-zero. Without it, hyperfine abort whole run on first failure.

### Pattern G — choose the shell (or skip it)

```bash
hyperfine --shell=none 'rg foo' 'grep foo'        # ~1ms shell overhead saved
hyperfine --shell=bash 'shopt -s globstar; ls **/*.rs | wc -l'   # need bash features
```

`--shell=none` exec command direct (faster, more accurate for short commands but no `|`, `>`, glob expansion, env interpolation). hyperfine measure shell startup once + subtract; for sub-10 ms commands, prefer `--shell=none`.

## Anti-patterns

- **No skip `--warmup`** for I/O- or compile-heavy commands. First run pay cold page-cache, JIT, DNS cost — distort mean 10×+. Use `--warmup 3` minimum; `--warmup 10` for filesystem traversal.
- **No benchmark inside shell running editor / IDE / browser.** Background CPU + disk inject noise. Quiet box: close other apps, disable Spotlight indexing, plug laptops in (battery throttle), check Activity Monitor / `htop` for idle.
- **No trust `--runs 1`.** Not benchmark — single sample, infinite variance. Default ≥10 is floor.
- **No measure microsecond work.** hyperfine process-spawn + OS scheduler jitter dominate below ~1 ms. For sub-ms work use `cargo bench` (Rust), `pytest-benchmark` (Python), `tachometer` (JS), `criterion`.
- **No compare commands producing different output.** "Fast" command doing less work not faster. Run once with `--show-output` + diff results before trust ratio.
- **No trust ratios on noisy hardware.** stddev/mean over ~5% = unreliable. Re-run, increase `--runs`, or quiet machine. Thermal throttling on laptops silent killer — hyperfine correct for shell startup but not CPU frequency scaling.
- **No conflate hyperfine with profiling.** Tells *how long* — not *where* time went. Pair with `perf record` / `py-spy record` / `cargo flamegraph` find hotspots.
- **No use `time cmd1; time cmd2`** + call benchmark. No warmup, no repeats, no statistics.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — performance section ("benchmark before claiming a speedup").
- Pair with `cargo bench` / `pytest-benchmark` / `tachometer` for sub-millisecond microbenchmarks; hyperfine for whole-process timing.
- JSON output → jq: see `skills/jq/SKILL.md` Pattern D (aggregate) for postprocess `bench.json`.
- Upstream: <https://github.com/sharkdp/hyperfine>
- Manual: `man hyperfine` and <https://github.com/sharkdp/hyperfine#detailed-usage>