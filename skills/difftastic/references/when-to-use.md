## When to use

- The user wants to see what *meaningfully* changed between two versions of a source file and ignore pure reformatting (line wraps, brace placement, trailing whitespace).
- A `git diff` is dominated by reflow / rename / indentation noise and the real change is buried.
- Reviewing two revisions of the same file across languages difft supports (most mainstream: Rust, TS/JS, Python, Go, Java, C/C++, Ruby, Kotlin, Swift, …).
- The user asks for an "AST diff" or "tree diff" between files or commits.

**Skip** for: binary files, PDFs, images (difft refuses); merge conflict resolution (use `git mergetool` — difft is a viewer, not a merger); directory-level sync (`diff -r`, `rsync -nc`); diffs across thousands of files / generated bundles (difft is slower than text diff and will hang on multi-MB files); files in languages difft doesn't parse (falls back to text diff with no structural benefit).
