# Fulcrum Local MCP

Fulcrum exposes agent-facing MCP over local stdio by default. Stdio keeps traffic inside the spawned process pair and avoids any listen socket.

## Stdio

Use the CLI entrypoint from an MCP client:

```json
{
  "mcpServers": {
    "fulcrum": {
      "command": "fulcrum",
      "args": ["mcp", "stdio"]
    }
  }
}
```

During source checkout development:

```json
{
  "mcpServers": {
    "fulcrum": {
      "command": "pnpm",
      "args": ["--filter", "@fulcrum/cli", "dev", "--", "mcp", "stdio"]
    }
  }
}
```

## Loopback Visibility

The local API publishes MCP metadata for cockpit and operators:

- `GET /api/v1/mcp/tools`
- `GET /api/v1/mcp/resources`

Loopback stays on `127.0.0.1` unless public bind approval is explicitly provided through policy.

## Policy

MCP tools call the same core services as CLI and cockpit. Dangerous actions return structured `denied` or `approval_required` responses. `fulcrum_policy_check` returns the decision and audit event as successful machine data so agents can request approval without treating the check itself as failed.

Policy-gated tools include run start/complete, worktree allocation, quality gate execution, repo packing, and policy checks. Shell-backed quality gate execution requires an approved `arbitrary_shell` policy decision for the target gate before MCP will run the command.

Cockpit adapter settings show each MCP tool, alias, and permission class.
