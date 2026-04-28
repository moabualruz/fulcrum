## Invocation

```bash
eza                                  # basic, replaces `ls`
eza -lah                             # long, all (incl. dotfiles), -h is `--header` (column headers; eza prints human sizes by default with -l)
eza -l --git                         # long format + per-file git status column
eza -l --git-ignore                  # respect .gitignore (hide ignored)
eza --tree --level=2                 # depth-limited tree
eza -l --header --time-style=iso     # column headers + ISO timestamps (also: relative|long)
eza -l --no-quotes                   # drop quotes around names (copy-friendly paths)
eza -l --icons=auto                  # icons: auto|always|never (needs Nerd Font)
eza -l --sort=modified --reverse     # sort: name|Name|extension|Extension|size|modified|changed|accessed|created|inode|type|none
eza -l --group-directories-first     # dirs above files
eza -l --total-size                  # recursive dir size totals (slow on huge trees)
eza -l --color=never                 # plain output for pipes/parsers
```
