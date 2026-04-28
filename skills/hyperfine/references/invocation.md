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
