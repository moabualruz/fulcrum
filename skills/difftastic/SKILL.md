---
name: difftastic
description: Use this skill whenever the user wants a structural, syntax-aware diff between two source files or git revisions — a diff that parses each side as code (Rust, TS, Python, Go, …) and ignores reformatting, brace movement, or whitespace noise. Trigger phrases include "compare two source files structurally", "syntax-aware diff", "smarter git diff that ignores reformatting", "show only meaningful changes between commits", "diff that understands code structure", "tree diff", "AST diff for these files". The binary is `difft`, NOT `difftastic`. Skip this skill for binary files, PDF/image diffs, merge conflict resolution (use `git mergetool`), directory sync (`rsync`/`diff -r`), or massive generated files where plain `diff` is faster.
---

# difftastic

## When to use

- The user wants to see what *meaningfully* changed between two versions of a source file and ignore pure reformatting (line wraps, brace placement, trailing whitespace).
- A `git diff` is dominated by reflow / rename / indentation noise and the real change is buried.
- Reviewing two revisions of the same file across languages difft supports (most mainstream: Rust, TS/JS, Python, Go, Java, C/C++, Ruby, Kotlin, Swift, …).
- The user asks for an "AST diff" or "tree diff" between files or commits.

**Skip** for: binary files, PDFs, images (difft refuses); merge conflict resolution (use `git mergetool` — difft is a viewer, not a merger); directory-level sync (`diff -r`, `rsync -nc`); diffs across thousands of files / generated bundles (difft is slower than text diff and will hang on multi-MB files); files in languages difft doesn't parse (falls back to text diff with no structural benefit).

## Invocation

The binary is **`difft`** (not `difftastic`). Agents frequently guess `difftastic` and get "command not found".

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

## Anti-patterns

- **Don't call it as `difftastic`.** The binary is `difft`. `difftastic --version` is "command not found" on every install.
- **Don't `git config --global diff.external difft`** without thinking. It silently slows every `git diff` everywhere — including lockfiles, vendored code, and CI logs. Scope with `git config --local` or `GIT_EXTERNAL_DIFF=difft` for one command.
- **Don't run difft on multi-MB generated files** (lockfiles, minified JS, build outputs). It parses both sides and will be much slower than `diff -u`. Exclude generated paths from the diff or use `--no-ext-diff`.
- **Don't use difft to resolve merge conflicts.** difft is a *viewer*. There is no `--merge` mode. Use `git mergetool` (vimdiff, kdiff3, meld, …).
- **Don't assume language autodetect for unusual extensions** (`.in`, `.tmpl`, `.txt` source files, `.h` ambiguous between C and C++). Pass `--override 'glob:LANGUAGE'` using a name from `difft --list-languages`. There is no `--language` flag — that's a common guess but it doesn't exist.
- **Don't pipe difft output into a tool that reflows lines.** Side-by-side mode aligns columns by character; `less -S` (chop) is safe, plain `less` and most pagers wrap and break alignment. Use `--display inline` when piping.
- **Don't use difft for binary or non-text artifacts** (images, PDFs, sqlite). difft refuses; reach for `diff-pdf`, `imagediff`, or a domain tool.
- **Don't expect identical output across versions.** difft's parser and display heuristics evolve. Pin the version in CI (`difft --version`) if you compare output across runs.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` — prefer structural diff for code review on small/medium hand-edited diffs; fall back to plain `diff` / `git diff` for generated or huge files.
- Pairs with: `git`, `bat` (syntax highlight for unrelated read-only previews), `delta` (text-diff pretty-printer; complementary, not a replacement — delta colorizes a textual diff, difft computes a structural one).
- Upstream manual: <https://difftastic.wilfred.me.uk/>
- Source: <https://github.com/Wilfred/difftastic>
- Git integration docs: <https://difftastic.wilfred.me.uk/git.html>
