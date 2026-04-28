## Anti-patterns

- **Don't skip `--warmup`** for I/O- or compile-heavy commands. The first run pays cold page-cache, JIT, or DNS costs and distorts the mean by 10×+. Use `--warmup 3` minimum; `--warmup 10` for filesystem traversal.
- **Don't benchmark inside the shell that runs your editor / IDE / browser.** Background CPU and disk activity inject noise. Quiet the box: close other apps, disable Spotlight indexing, plug laptops in (battery throttles), check Activity Monitor / `htop` for idle.
- **Don't trust `--runs 1`.** That's not a benchmark — it's a single sample with infinite variance. The default ≥10 is the floor.
- **Don't measure microsecond-scale work.** hyperfine's process-spawn and OS scheduler jitter dominate below ~1 ms. For sub-ms work use `cargo bench` (Rust), `pytest-benchmark` (Python), `tachometer` (JS), or `criterion`.
- **Don't compare commands that produce different output.** A "fast" command that does less work isn't faster. Run once with `--show-output` and diff the results before believing the ratio.
- **Don't trust ratios on noisy hardware.** If stddev/mean exceeds ~5%, the result is unreliable. Re-run, increase `--runs`, or quiet the machine. Thermal throttling on laptops is a silent killer — hyperfine corrects for shell startup but not for CPU frequency scaling.
- **Don't conflate hyperfine with profiling.** It tells you *how long* — not *where* the time went. Pair with `perf record` / `py-spy record` / `cargo flamegraph` to find hotspots.
- **Don't use `time cmd1; time cmd2`** and call it a benchmark. No warmup, no repeats, no statistics.
