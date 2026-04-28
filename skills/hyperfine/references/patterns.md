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
