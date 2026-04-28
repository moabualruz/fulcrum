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
