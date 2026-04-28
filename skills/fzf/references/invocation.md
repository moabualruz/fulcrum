## Invocation

```bash
# One-shot ranking. NO ui, NO tty needed. Reads stdin, writes ranked matches to stdout.
printf '%s\n' alpha beta gamma delta | fzf --filter alpha

# Equivalent short form
printf '%s\n' alpha beta gamma delta | fzf -f alpha

# From a file
fzf -f config < candidates.txt

# Top N matches only
fd -t f | fzf -f utils | head -n 5

# Exact match (substring, no fuzzing)
fzf -fe alpha < candidates.txt

# Case-insensitive (default in -f is smart-case; force with -i)
fzf -i -f Auth < branches.txt

# Disable Latin-script normalization (so 'café' ≠ 'cafe')
fzf --literal -f 'café' < items
# `--literal` disables diacritic-folding so `café` doesn't match `cafe`. It does **not** affect shell metacharacters — quote your shell input normally.

# Use stderr's TTY instead of /dev/tty (for emacsclient and similar wrappers)
fzf --no-tty -f query < input.txt
# `--no-tty` makes fzf find the TTY via stderr instead of `/dev/tty`. Useful inside `emacsclient` and similar wrappers. In `--filter`/`-f` mode fzf already does not open a TTY, so `--no-tty` is unnecessary there.
```

The `-f`/`--filter` flag is the single switch that turns fzf into a batch ranker — it prints matches to stdout in score order and exits. Without it, fzf opens an interactive picker.
