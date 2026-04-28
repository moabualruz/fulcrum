## Anti-patterns

- **Don't translate sed `\1` to `\1` in sd** — sd's Rust `regex` engine uses `$1` for backrefs; `\1` matches a literal.
- **Don't reach for `sd -i`** — that flag does not exist. sd writes in-place by default.
- **Don't double-quote the pattern.** `"$1"` lets the shell eat your backreference. Single-quote.
- **Don't use sd for non-replacement edits** (delete line N, append, conditional ops) — sed/awk.
- **Don't run sd across a repo without `-p` first.** Preview on a sample file, then batch with fd.
- **Don't reach for sd when ast-grep would be safer.** For code refactors that must respect syntax, `ast-grep` > `sd` > `sed`. sd is text-level — it rewrites inside strings and comments too.
- **Don't assume `-l` means literal.** The flag is `-F` / `--fixed-strings` (alias `-s` / `--string-mode`).
