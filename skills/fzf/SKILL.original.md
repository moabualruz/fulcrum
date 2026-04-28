---
name: fzf
description: Use this skill for non-interactive, scriptable fuzzy ranking on the command line — the batch `--filter` (`-f`) mode, NOT the interactive picker UI. Trigger when an agent needs to rank or score a list of strings (branches, files, PR titles, kubectl resources, log lines) by similarity to a query without launching a TUI. Trigger phrases include "fuzzy match against", "rank by similarity to", "find the closest match in this list", "filter this list by approximate name", "best fuzzy hits for", "score these candidates against a query". Use fzf's `-f` mode for one-shot ranking; pair with `jq -r`, `git`, `gh`, `fd`, or `kubectl` to build the candidate list. Skip this skill for exact substring search (use `rg -F`), regex search across file contents (use `rg`), file finding by name pattern (use `fd`), or any actual interactive picker — those will hang the agent shell.
---

# fzf

## When to use

- Agent has a list of candidates (branches, files, PR titles, k8s pods, log entries) and needs the top fuzzy matches for a query string. Reach for `fzf --filter <query>`.
- A previous step produced JSON; after `jq -r` flattens it to TSV, fzf ranks the rows by a chosen column.
- The user says "find the closest matching X to Y" or "rank these by similarity to Y" — that's fuzzy ranking, not exact match.
- An interactive workflow needs to be ported to a script: replace `fzf` with `fzf -f <query> | head -n 1` to make it deterministic.

**Skip** for: exact substring filtering (`rg -F` / `grep -F` is faster and clearer); regex matching (`rg`); finding files by name glob (`fd`); content search across files (`rg` returns files-with-matches, fzf does not); interactive pickers in an agent shell — fzf without `-f` opens a TUI and will block on the missing TTY.

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

## Patterns

### Pattern A — rank a list of git branches against a topic

```bash
git branch --format='%(refname:short)' | fzf -f auth
```

Returns every branch whose name fuzzy-matches `auth`, best first. Pipe to `head -n 1` to pick the top one.

### Pattern B — match against a specific column of TSV

`-d` sets the delimiter, `--nth` picks which field(s) the query is matched against. Display still includes the whole line.

```bash
gh pr list --json number,title --jq '.[] | [.number, .title] | @tsv' \
  | fzf -d $'\t' --nth=2 -f bug
```

The `2` means "match against the title column"; the number column is preserved in the output for the next step.

### Pattern C — display fewer columns than you matched

`--with-nth` controls what is *printed*, independent of `--nth`. Useful when the candidate list carries an id you want to use later but don't want printed.

```bash
kubectl get pods -o json \
  | jq -r '.items[] | [.metadata.uid, .metadata.name] | @tsv' \
  | fzf -d $'\t' --nth=2 --with-nth=2 -f web
```

### Pattern D — preserve input order (don't re-sort)

The default sorts by score. For already-meaningful input order (`git log`, `ls -t`, a manually curated list), pass `--no-sort` so fzf only filters.

```bash
git log --oneline -n 200 | fzf --no-sort -f refactor
```

### Pattern E — tiebreaker control

When several candidates score equally, `--tiebreak` decides ordering. Common values: `length` (shorter first), `end` (match closer to end first), `index` (preserve input order), `chunk` (favor matches in same chunk).

```bash
fd -t f | fzf -f main --tiebreak=length,index | head -n 1
```

### Pattern F — top-1 pick in a script

```bash
best=$(fd -t f -e ts | fzf -f "$query" | head -n 1)
[ -z "$best" ] && { echo "no match for $query" >&2; exit 1; }
```

Always check for empty output — fzf in `-f` mode prints nothing and exits 1 when there are no matches; the script must handle that.

### Pattern G — combine with jq for structured input

JSON in → flatten to TSV with jq → rank with fzf → if needed, post-process with `awk -F'\t'` or another `jq` step.

```bash
gh issue list --json number,title,labels \
  | jq -r '.[] | [.number, .title, ([.labels[].name] | join(","))] | @tsv' \
  | fzf -d $'\t' --nth=2,3 -f flaky \
  | awk -F'\t' '{print $1}'
```

## Anti-patterns

- **Don't run bare `fzf` in an agent shell.** Without `-f`, fzf opens a TUI and blocks waiting for a TTY that the agent doesn't have. The shell call hangs until killed. Always pass `--filter`/`-f` (or pipe input + use `-f`).
- **Don't use fzf for exact substring filtering.** `rg -F 'pattern'` or `grep -F` is faster, clearer, and exits with a meaningful status. fzf's fuzzy scoring will surface false positives.
- **Don't use fzf to search file contents.** fzf ranks lines, not files-with-matches. Use `rg pattern` (or `rg -l pattern` for filenames only).
- **Don't forget `--no-sort`** when input order is already meaningful (`git log`, version-sorted tags, time-ordered logs). Default fzf re-sorts by fuzzy score and you'll lose the chronology.
- **Don't pass `--height`, `--preview`, `--bind`, `--header`** in batch mode — they're inert with `-f` and add noise. They only matter in the interactive UI, which agents shouldn't invoke.
- **Don't shell-interpolate the query unsafely.** `fzf -f "$Q"` is fine for one token, but quoted multi-word queries with shell metacharacters can surprise. Quote at the shell level — `--literal` is about diacritic-folding, not shell escaping.
- **Don't rely on exit code 0 to mean "match found".** `-f` exits 1 when nothing matched and 130 on interrupt. Check both stdout and `$?`.

## Cross-refs

- See the `rg`/`fd` skill row in `skills/SOURCES.md` — fzf is the *fuzzy* sibling; rg/fd handle exact and pattern-based search.
- For JSON-shaped input, run `jq -r` first to produce a flat line-per-candidate stream — see `skills/jq/SKILL.md` Pattern E (`@tsv`).
- Upstream: <https://github.com/junegunn/fzf>
- Manual page: `man fzf` — search `/FILTER MODE` for the batch-ranking section.
