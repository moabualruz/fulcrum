## Patterns

### Pattern A — jump to a known project
```bash
z fulcrum         # any prior `cd ~/workspace/fulcrum` makes this work
```

### Pattern B — disambiguate with a second token
```bash
z work fulc       # match contains both, in order — cheaper than long substrings
```

### Pattern C — script-safe lookup
```bash
target=$(zoxide query fulc) && cd "$target"
```
The shell function `z` isn't visible in `bash -c`, scripts, or non-interactive subshells — go through the binary.
