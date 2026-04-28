---
name: zoxide
description: Use this skill when the user wants to jump between directories by partial name on the command line — a smarter `cd` that learns frequently visited folders and ranks them by frecency (frequency × recency). Trigger phrases include "jump to a directory by partial name", "smarter cd that learns frequently visited folders", "cd to a project by typing one word", "fuzzy directory navigation", "jump to my fulcrum directory", "navigate to a recent project fast". Covers the `z` / `zi` shell functions, the `zoxide` binary's database commands (`query`, `add`, `remove`, `import`), shell init, and the agent-vs-human distinction (`zi` is fzf/TTY-bound). Skip for: finding files by name (use `fd`), listing a directory (use `eza`/`ls`), searching shell history (use `fzf` + history), opening a folder in Finder, or setting `cwd` inside a script (just use `cd`).
---

# zoxide

## When to use

- The user wants to *cd* somewhere by typing a fragment of the path — `z fulc` instead of `cd ~/workspace/fulcrum`.
- The user asks about "frecency", autojump, fasd, or "that thing that remembers directories".

**Skip** for: file search (`fd`), listing dirs (`eza`/`ls`), shell-history search (`fzf` over `~/.zsh_history`), GUI-open, or scripts that already know their target (just `cd`).

## Invocation

`z` and `zi` are **shell functions**, not binaries — they only exist after `zoxide init` runs:

```bash
# Last line of ~/.bashrc / ~/.zshrc / config.fish
eval "$(zoxide init bash)"           # or zsh / fish / posix / nushell / xonsh / elvish
eval "$(zoxide init bash --cmd j)"   # rebind to `j` (avoids autojump clash)
```

Once initialized:

```bash
z foo            # cd to highest-frecency dir matching `foo`
z foo bar        # tokens AND-ed, in order
z -              # toggle to previous directory (like `cd -`)
zi foo           # interactive fzf picker among matches
```

The binary itself works regardless of init:

```bash
zoxide query foo [--list] [--score]   # print top match / ranked / with scores
zoxide add /path                      # bump manually
zoxide remove /path                   # forget
zoxide import --from autojump ~/.local/share/autojump/autojump.txt
zoxide import --from z ~/.z                              # also handles fasd / z.lua / zsh-z
```

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

## Anti-patterns

- **Don't** call `z` from a script or `bash -c` — it's a shell function defined by `zoxide init`, not on `$PATH`. Use `cd "$(zoxide query foo)"`.
- **Don't** assume `z foo` works on a cold install — the database is empty until you `cd` around (or `zoxide add`).
- **Don't** rely on `zi` in agent / CI / non-TTY shells — it spawns `fzf` and needs a TTY. Use `zoxide query foo --list` and pick programmatically.
- **Don't** run zoxide and autojump with default names side-by-side — both bind prompt hooks and the `j` command. Pick one, or rebind with `--cmd`.
- **Don't** edit `~/.local/share/zoxide/db.zo` by hand — binary format. Use `zoxide add` / `zoxide remove`.

## Cross-refs

- `skills/fzf/SKILL.md` — `zi` is fzf-driven; same TTY caveat applies.
- Upstream: <https://github.com/ajeetdsouza/zoxide>
