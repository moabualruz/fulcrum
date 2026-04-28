## Anti-patterns

- **Don't confuse mikefarah/yq with kislyuk/yq.** `yq -y` does not exist in mikefarah — that's a kislyuk flag for "emit YAML". Mikefarah writes YAML by default; pass `-o json` to switch. Always run `yq --version` first if the recipe behaves oddly.
- **Don't path into multi-document YAML without `select`.** `yq '.kind' manifests.yaml` emits one value per document, which surprises pipelines that expect a single answer. Filter explicitly with `select(.kind == "...")` or `select(documentIndex == N)`.
- **Don't edit YAML with `sed`/`awk`.** They mangle quoting, anchors (`&foo`/`*foo`), block scalars (`|`/`>`), and comments. `yq -i` round-trips cleanly.
- **Don't expect `yq -o json` to keep comments.** JSON has no comment syntax — they're dropped by design. If comments are load-bearing, stay in YAML.
- **Don't shell-interpolate values into the expression.** `yq ".tag = \"$VAR\""` breaks on quotes/spaces and is a quoting hazard. Use `name=value yq '... strenv(name) ...'` for strings, or `name=value yq '... (env(name) | tonumber) ...'` for typed values. yq has no `--arg`/`--argjson` flags (those are jq-specific).
- **Don't use mikefarah's `-i` flag on stdin.** `-i` requires a file argument. For stdin, pipe and capture: `cat f.yaml | yq '...' > new.yaml`.
- **Don't pipe binary data through yq.** It's a text processor — UTF-8 in, UTF-8 out. For raw JSON-only streams with no YAML involved, `jq` is faster and more idiomatic.
- **Don't reach for `eval-all` for single-document edits.** `ea` loads every doc into memory and changes the implicit context — use plain `yq` unless you need cross-doc operations.
