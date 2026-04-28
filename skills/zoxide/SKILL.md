---
name: zoxide
description: Use this skill when the user wants to jump between directories by partial name on the command line — a smarter `cd` that learns frequently visited folders and ranks them by frecency (frequency × recency). Trigger phrases include "jump to a directory by partial name", "smarter cd that learns frequently visited folders", "cd to a project by typing one word", "fuzzy directory navigation", "jump to my fulcrum directory", "navigate to a recent project fast". Covers the `z` / `zi` shell functions, the `zoxide` binary's database commands (`query`, `add`, `remove`, `import`), shell init, and the agent-vs-human distinction (`zi` is fzf/TTY-bound). Skip for: finding files by name (use `fd`), listing a directory (use `eza`/`ls`), searching shell history (use `fzf` + history), opening a folder in Finder, or setting `cwd` inside a script (just use `cd`).
---

# zoxide

## When to use

- User want *cd* by path fragment — `z fulc` not `cd ~/workspace/fulcrum`.
- User ask about "frecency", autojump, fasd, or "thing that remember directories".

**Skip** for: file search (`fd`), list dirs (`eza`/`ls`), shell-history search (`fzf` over `~/.zsh_history`), GUI-open, or scripts that know target (just `cd`).

## Invocation

`z` and `zi` are **shell functions**, not binaries — exist only after `zoxide init` runs:

```bash
# Last line of ~/.bashrc / ~/.zshrc / config.fish
eval "$(zoxide init bash)"           # or zsh / fish / posix / nushell / xonsh / elvish
eval "$(zoxide init bash --cmd j)"   # rebind to `j` (avoids autojump clash)
```

Once init:

```bash
z foo            # cd to highest-frecency dir matching `foo`
z foo bar        # tokens AND-ed, in order
z -              # toggle to previous directory (like `cd -`)
zi foo           # interactive fzf picker among matches
```

Binary work regardless of init:

```bash
zoxide query foo [--list] [--score]   # print top match / ranked / with scores
zoxide add /path                      # bump manually
zoxide remove /path                   # forget
zoxide import --from autojump ~/.local/share/autojump/autojump.txt
zoxide import --from z ~/.z                              # also handles fasd / z.lua / zsh-z
```

## Patterns

### Pattern A — jump to known project
```bash
z fulcrum         # any prior `cd ~/workspace/fulcrum` makes this work
```

### Pattern B — disambiguate with second token
```bash
z work fulc       # match contains both, in order — cheaper than long substrings
```

### Pattern C — script-safe lookup
```bash
target=$(zoxide query fulc) && cd "$target"
```
Shell function `z` not visible in `bash -c`, scripts, non-interactive subshells — go through binary.

## Anti-patterns

- **Don't** call `z` from script or `bash -c` — shell function defined by `zoxide init`, not on `$PATH`. Use `cd "$(zoxide query foo)"`.
- **Don't** assume `z foo` work on cold install — database empty until you `cd` around (or `zoxide add`).
- **Don't** rely on `zi` in agent / CI / non-TTY shells — spawns `fzf`, need TTY. Use `zoxide query foo --list`, pick programmatically.
- **Don't** run zoxide and autojump with default names side-by-side — both bind prompt hooks and `j` command. Pick one, or rebind with `--cmd`.
- **Don't** edit `~/.local/share/zoxide/db.zo` by hand — binary format. Use `zoxide add` / `zoxide remove`.

## Cross-refs

- `skills/fzf/SKILL.md` — `zi` fzf-driven; same TTY caveat apply.
- Upstream: <https://github.com/ajeetdsouza/zoxide>