## Invocation

```bash
bat file.py                              # basic — colors + line numbers + pager
bat --paging=never file.json             # required when piping or in scripts
bat -pp file.json                        # short for --style=plain --paging=never
cat foo | bat -l json                    # stdin: must hint language, can't sniff pipe
bat --style=plain file.txt               # closest to cat (no gutter, no header)
bat --style=numbers,header file.go       # mix-and-match decorations
bat -d old.py                            # syntax-aware diff vs git HEAD
bat --line-range 40:80 long.log          # only lines 40–80
bat --color=always file | less -R        # force ANSI through a pager/tmux scrollback
BAT_THEME="ansi" bat file                # set default theme; --theme=<name> for one-off
bat --list-languages                     # what bat can highlight
bat --list-themes                        # what themes are available
```

On Debian/Ubuntu the binary is `batcat` (collision with an old utility). Either call `batcat …` or `mkdir -p ~/.local/bin && ln -s "$(which batcat)" ~/.local/bin/bat`.
