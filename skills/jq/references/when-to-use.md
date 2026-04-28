## When to use

- The user has JSON in front of them — a file, an API response, an HTTP body, CLI tool output (`gh`, `kubectl`, `aws`, `terraform output -json`, `npm pkg get`, `cargo metadata`) — and wants to query, filter, reshape, or convert it.
- The agent itself is about to invoke a tool with JSON output (anything with `--json`, `--format json`, `-o json`) and needs a specific value.
- The user asks how to count, sort, group, or aggregate items inside a JSON array.
- The user pipes JSON through `grep` or `awk` — that almost always wants jq.

**Skip** for: YAML / TOML / XML (use `yq` or `xmlstarlet`); CSV (use `awk` / `miller` / `csvkit`); JSON parsing inside Python/Go/Node *source code* (use the language's stdlib).
