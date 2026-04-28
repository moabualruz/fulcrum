---
name: difftastic
description: Use this skill whenever user wants structural, syntax-aware diff between two source files or git revisions — diff that parses each side as code (Rust, TS, Python, Go, …) and ignores reformatting, brace movement, whitespace noise. Trigger phrases: "compare two source files structurally", "syntax-aware diff", "smarter git diff that ignores reformatting", "show only meaningful changes between commits", "diff that understands code structure", "tree diff", "AST diff for these files". Binary is `difft`, NOT `difftastic`. Skip for binary files, PDF/image diffs, merge conflict resolution (use `git mergetool`), directory sync (`rsync`/`diff -r`), or massive generated files where plain `diff` faster.
---

# difftastic

## When to use

- User wants see what *meaningfully* changed between two versions of source file, ignore pure reformatting (line wraps, brace placement, trailing whitespace).
- `git diff` dominated by reflow / rename / indentation noise, real change buried.
- Reviewing two revisions of same file across languages difft supports (most mainstream: Rust, TS/JS, Python, Go, Java, C/C++, Ruby, Kotlin, Swift, …).
- User asks for "AST diff" or "tree diff" between files or commits.

**Skip** for: binary files, PDFs, images (difft refuses); merge conflict resolution (use `git mergetool` — difft viewer, not merger); directory-level sync (`diff -r`, `rsync -nc`); diffs across thousands of files / generated bundles (difft slower than text diff, hangs on multi-MB files); files in languages difft doesn't parse (falls back to text diff, no structural benefit).

## Invocation

Binary is **`difft`** (not `difftastic`). Agents frequently guess `difftastic`, get "command not found".

```bash
# Two-file structural diff
difft a.rs b.rs

# Force a language when the extension is ambiguous or wrong (use --override GLOB:LANG)
difft --override 'old.txt:TypeScript' --override 'new.txt:TypeScript' old.txt new.txt

# Or scope the override by glob (one form fits many files)
difft --override '*.in:Rust' template.in template.out

# Side-by-side, full unchanged context, no syntax highlight (terminals/logs)
difft --display side-by-side --context 999 --syntax-highlight off a.py b.py

# Show BOTH sides fully even when one side is unchanged in a hunk
difft --display side-by-side-show-both a.py b.py

# Inline (single-column) — useful for narrow terminals or piping
difft --display inline a.py b.py

# Ignore comment-only changes
difft --ignore-comments a.go b.go

# Strip CR for Windows files mixed with Unix
difft --strip-cr win.ts unix.ts

# What languages are supported?
difft --list-languages
```

## Patterns

### Pattern A — one-shot structural diff in git (no config change)

```bash
GIT_EXTERNAL_DIFF=difft git diff
GIT_EXTERNAL_DIFF=difft git diff HEAD~3 HEAD -- src/parser.rs
GIT_EXTERNAL_DIFF=difft git log -p --ext-diff
GIT_EXTERNAL_DIFF=difft git show <sha>
```

`GIT_EXTERNAL_DIFF` safest entry point: scopes difft to one invocation. `git log -p` and `git show` honor it too, but `git log -p` needs `--ext-diff` (some configs require it).

### Pattern B — wire difft into single repo (not globally)

```bash
git config --local diff.external difft   # this repo only
git diff                                  # now uses difft
git config --local --unset diff.external  # undo
```

Prefer `--local` over global `git config` change — difft slower than text diff, global default makes huge diffs (lockfiles, generated code) crawl. Some tools (`git add -p`, `git blame -p`) bypass `diff.external`, still use text diff — correct.

### Pattern C — review one file across two refs

```bash
difft <(git show HEAD~1:src/lib.rs) <(git show HEAD:src/lib.rs)
```

Process substitution lets you point difft at any two blobs without checkout.

### Pattern D — display modes by terminal width

```bash
difft --display side-by-side a.ts b.ts             # default when wide enough
difft --display side-by-side-show-both a.ts b.ts   # both columns even if unchanged
difft --display inline a.ts b.ts                    # narrow / piping
```

Default auto: side-by-side when terminal wide enough, else inline. Force `inline` when piping into `less`, `bat`, `tee`, or CI log — column alignment breaks on rewrap.

### Pattern E — language override for unusual extensions

```bash
difft --override '*.in:Rust' template.in template.out                          # glob-scoped
difft --override 'tsconfig.json:JSON with comments' tsconfig.json.bak tsconfig.json
difft --list-languages | grep -i kotlin                                        # find the exact name
```

Flag is `--override GLOB:LANGUAGE`, not `--language NAME`. Use language name as printed by `--list-languages` (case-sensitive). Without override, files with no/unknown extension fall back to text diff.

### Pattern F — performance fallback

```bash
# difft is fine for hand-edited source files; it parses both sides.
# For these, fall back to plain text diff:
git diff --no-ext-diff                  # bypass diff.external for one command
diff -u huge.lock.old huge.lock.new
git diff -- ':!**/*.lock' ':!dist/**'   # exclude generated paths
```

difft slower than `diff`, noisier on lockfiles, minified bundles, generated code. Exclude or fall back; don't wait for it finish.

## Anti-patterns

- **Don't call it as `difftastic`.** Binary is `difft`. `difftastic --version` = "command not found" on every install.
- **Don't `git config --global diff.external difft`** without thinking. Silently slows every `git diff` everywhere — including lockfiles, vendored code, CI logs. Scope with `git config --local` or `GIT_EXTERNAL_DIFF=difft` for one command.
- **Don't run difft on multi-MB generated files** (lockfiles, minified JS, build outputs). Parses both sides, much slower than `diff -u`. Exclude generated paths from diff or use `--no-ext-diff`.
- **Don't use difft to resolve merge conflicts.** difft is *viewer*. No `--merge` mode. Use `git mergetool` (vimdiff, kdiff3, meld, …).
- **Don't assume language autodetect for unusual extensions** (`.in`, `.tmpl`, `.txt` source files, `.h` ambiguous between C and C++). Pass `--override 'glob:LANGUAGE'` using name from `difft --list-languages`. No `--language` flag — common guess, doesn't exist.
- **Don't pipe difft output into tool that reflows lines.** Side-by-side mode aligns columns by character; `less -S` (chop) safe, plain `less` and most pagers wrap, break alignment. Use `--display inline` when piping.
- **Don't use difft for binary or non-text artifacts** (images, PDFs, sqlite). difft refuses; reach for `diff-pdf`, `imagediff`, or domain tool.
- **Don't expect identical output across versions.** difft's parser and display heuristics evolve. Pin version in CI (`difft --version`) if comparing output across runs.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — prefer structural diff for code review on small/medium hand-edited diffs; fall back to plain `diff` / `git diff` for generated or huge files.
- Pairs with: `git`, `bat` (syntax highlight for unrelated read-only previews), `delta` (text-diff pretty-printer; complementary, not replacement — delta colorizes textual diff, difft computes structural one).
- Upstream manual: <https://difftastic.wilfred.me.uk/>
- Source: <https://github.com/Wilfred/difftastic>
- Git integration docs: <https://difftastic.wilfred.me.uk/git.html>