---
name: bat
description: Use this skill when viewing or printing source/config files to the terminal with syntax highlighting and line numbers — a `cat` replacement that colorizes code, configs, and diffs. Trigger phrases include "view a file with syntax highlighting", "cat with colors", "print a code file to terminal with line numbers", "show a config with highlighting", "preview source from stdin", "syntax-aware diff in the shell". Use bat instead of `cat` when humans need to read code, instead of opening an editor for a quick peek, and to render piped output (logs, JSON, YAML) with colors. Skip for: concatenating files into one (use `cat`), tailing live logs (use `tail -f`/`less +F`), hex dumps of binaries (use `xxd`/`hexyl`), in-place edits (use an editor), or content search (use `rg`/`grep`).
---

# bat

## When to use

- User want *read* source file, config, small log with syntax colors + line numbers.
- Agent print file back to user in explanation — `bat` way more legible than `cat`.
- Pipe JSON / YAML / diff to terminal, want colorized (with `--paging=never --color=always`).
- Syntax-aware diff between two files (`bat --diff` or `bat -d`).

**Skip** for: plain concat (`cat a b > c`), `tail -f`, hex/binary inspect, in-editor read, content search (jobs for `rg`/`grep`).

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

On Debian/Ubuntu binary is `batcat` (collision with old utility). Either call `batcat …` or `mkdir -p ~/.local/bin && ln -s "$(which batcat)" ~/.local/bin/bat`.

## Patterns

### Pattern A — print a config file legibly
```bash
bat ~/.config/nvim/init.lua
```
Default style (`numbers,changes,header,grid`) fine for human reader at terminal.

### Pattern B — colorize stdin from a tool that emits JSON/YAML
```bash
kubectl get pod foo -o yaml | bat -l yaml --paging=never
gh pr view 42 --json title,body | bat -l json -pp
```
`bat` cannot sniff language from pipe — pass `-l <lang>` (see `--list-languages`).

### Pattern C — syntax-aware diff
```bash
bat -d src/server.ts                     # vs git HEAD
git diff | bat -l diff -pp               # any diff text
```

### Pattern D — extract a slice for a code review reply
```bash
bat --line-range 120:160 --style=numbers,header src/parser.rs
```

### Pattern E — keep colors when piping into `less` or tmux
```bash
bat --color=always huge.log | less -R
```
Without `--color=always`, `bat` strip ANSI when stdout not TTY.

## Anti-patterns

- **Don't** pipe `bat` into `grep`/`jq`/`awk` without `--paging=never --color=never` (or `bat -p`) — pager hijack TTY, ANSI escapes corrupt downstream parsing.
- **Don't** rely on autodetect for stdin — `bat` can't sniff pipe. Pass `-l json|yaml|diff|...`.
- **Don't** alias `cat=bat` system-wide — first-run latency + missing themes break unconfigured shells, CI scripts that pipe `cat`.
- **Don't** assume binary is `bat` on Debian/Ubuntu — ships as `batcat`. Check with `command -v bat || command -v batcat` before scripting.
- **Don't** reach for `bat` to read 200 MB log — pager startup + highlighter cost dominate. Use `less` / `tail` / `rg` instead.

## Cross-refs

- Upstream: <https://github.com/sharkdp/bat>
- Manual: `bat --help` (compact) and `man bat` (full).