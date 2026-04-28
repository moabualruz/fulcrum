## Anti-patterns

- **Don't call it as `difftastic`.** The binary is `difft`. `difftastic --version` is "command not found" on every install.
- **Don't `git config --global diff.external difft`** without thinking. It silently slows every `git diff` everywhere — including lockfiles, vendored code, and CI logs. Scope with `git config --local` or `GIT_EXTERNAL_DIFF=difft` for one command.
- **Don't run difft on multi-MB generated files** (lockfiles, minified JS, build outputs). It parses both sides and will be much slower than `diff -u`. Exclude generated paths from the diff or use `--no-ext-diff`.
- **Don't use difft to resolve merge conflicts.** difft is a *viewer*. There is no `--merge` mode. Use `git mergetool` (vimdiff, kdiff3, meld, …).
- **Don't assume language autodetect for unusual extensions** (`.in`, `.tmpl`, `.txt` source files, `.h` ambiguous between C and C++). Pass `--override 'glob:LANGUAGE'` using a name from `difft --list-languages`. There is no `--language` flag — that's a common guess but it doesn't exist.
- **Don't pipe difft output into a tool that reflows lines.** Side-by-side mode aligns columns by character; `less -S` (chop) is safe, plain `less` and most pagers wrap and break alignment. Use `--display inline` when piping.
- **Don't use difft for binary or non-text artifacts** (images, PDFs, sqlite). difft refuses; reach for `diff-pdf`, `imagediff`, or a domain tool.
- **Don't expect identical output across versions.** difft's parser and display heuristics evolve. Pin the version in CI (`difft --version`) if you compare output across runs.
