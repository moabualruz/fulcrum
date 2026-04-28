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
