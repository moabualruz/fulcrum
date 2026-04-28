## Patterns

### Pattern A — one-shot structural diff in git (no config change)

```bash
GIT_EXTERNAL_DIFF=difft git diff
GIT_EXTERNAL_DIFF=difft git diff HEAD~3 HEAD -- src/parser.rs
GIT_EXTERNAL_DIFF=difft git log -p --ext-diff
GIT_EXTERNAL_DIFF=difft git show <sha>
```

`GIT_EXTERNAL_DIFF` is the safest entry point: it scopes difft to one invocation. `git log -p` and `git show` honor it too, but `git log -p` needs `--ext-diff` (some configs require it).

### Pattern B — wire difft into a single repo (not globally)

```bash
git config --local diff.external difft   # this repo only
git diff                                  # now uses difft
git config --local --unset diff.external  # undo
```

Prefer `--local` over a global `git config` change — difft is slower than text diff, and a global default makes huge diffs (lockfiles, generated code) crawl. Some tools (`git add -p`, `git blame -p`) bypass `diff.external` and still use text diff, which is correct.

### Pattern C — review one file across two refs

```bash
difft <(git show HEAD~1:src/lib.rs) <(git show HEAD:src/lib.rs)
```

Process substitution lets you point difft at any two blobs without a checkout.

### Pattern D — display modes by terminal width

```bash
difft --display side-by-side a.ts b.ts             # default when wide enough
difft --display side-by-side-show-both a.ts b.ts   # both columns even if unchanged
difft --display inline a.ts b.ts                    # narrow / piping
```

Default is auto: side-by-side when the terminal is wide enough, otherwise inline. Force `inline` when piping into `less`, `bat`, `tee`, or a CI log — column alignment breaks on rewrap.

### Pattern E — language override for unusual extensions

```bash
difft --override '*.in:Rust' template.in template.out                          # glob-scoped
difft --override 'tsconfig.json:JSON with comments' tsconfig.json.bak tsconfig.json
difft --list-languages | grep -i kotlin                                        # find the exact name
```

The flag is `--override GLOB:LANGUAGE`, not `--language NAME`. Use the language name as printed by `--list-languages` (case-sensitive). Without an override, files with no/unknown extension fall back to text diff.

### Pattern F — performance fallback

```bash
# difft is fine for hand-edited source files; it parses both sides.
# For these, fall back to plain text diff:
git diff --no-ext-diff                  # bypass diff.external for one command
diff -u huge.lock.old huge.lock.new
git diff -- ':!**/*.lock' ':!dist/**'   # exclude generated paths
```

difft is slower than `diff` and noisier on lockfiles, minified bundles, and generated code. Exclude or fall back; don't wait for it to finish.
