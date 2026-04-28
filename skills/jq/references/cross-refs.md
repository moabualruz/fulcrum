## Cross-refs

- Rule: see `rules/AGENTS.md` §3 — "use jq for any JSON read/transform".
- Hook recipe: `tool-output-router` (in `docs/tool-output-policy.md`) routes large JSON outputs through the policy file; jq runs against either the raw stdout or the saved `~/.fulcrum/state/.../*.out` file.
- Manual: <https://jqlang.org/manual/>
- Cookbook: <https://github.com/stedolan/jq/wiki/Cookbook>
