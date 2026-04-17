# Fulcrum × GitHub Copilot integration

GitHub Copilot (Chat + Agent Mode + cloud agents) can use the Fulcrum control plane via three paths. Pick whichever matches your workflow.

## Path A — Copilot Chat in VS Code (MCP)

Copilot Chat reads MCP server definitions from `.vscode/mcp.json` in the workspace root.

```bash
cp agent-integration/copilot/.vscode/mcp.json /path/to/your/repo/.vscode/mcp.json
```

Restart VS Code. Fulcrum tools (`recall_memory`, `write_memory`, `start_agent_run`, etc., filtered via `--profile software_engineer`) appear in the Copilot Chat tool picker.

## Path B — Copilot Agent Mode / cloud agents (CLI-first)

Agent Mode and cloud agents have bash access. They use Fulcrum by shelling out to `fulcrum action exec <name>`. Copy the instructions file into your repo so Copilot reads it on every session:

```bash
mkdir -p /path/to/your/repo/.github
cp agent-integration/copilot/.github/copilot-instructions.md /path/to/your/repo/.github/copilot-instructions.md
```

The instructions teach Copilot which actions to call and when (start_agent_run → heartbeat → complete_agent_run lifecycle; recall_memory before making load-bearing decisions; write_memory after non-obvious choices).

## Path C — `gh mcp install fulcrum` (GitHub CLI)

If your version of the GitHub CLI exposes the MCP registrar (`gh mcp install`), you can install Fulcrum globally:

```bash
gh mcp install fulcrum
```

This registers the same command as Path A (`fulcrum serve mcp --profile software_engineer`) but at the user level, so every repo opened in VS Code picks it up without copying `.vscode/mcp.json`. If `gh mcp install` is not available in your CLI version, fall back to Path A or B.

## Shared skills

`agent-integration/copilot/.agents/skills/` symlinks to the canonical skills tree at `agent-integration/skills/` — the same tree Claude Code, Cursor, Windsurf, Gemini, Codex, and OpenCode consume. No per-host divergence.

## Verify the install

```bash
# Path A: open VS Code → Copilot Chat → type "@fulcrum" to see tool list
# Path B: from inside a Copilot Agent session, run
fulcrum action exec recall_memory --query "fulcrum install" --limit 3
# Path C: gh mcp list  # should show fulcrum
```

## Uninstall

```bash
rm -rf /path/to/your/repo/.vscode/mcp.json
rm -rf /path/to/your/repo/.github/copilot-instructions.md
# Or remove the host-level registration:
gh mcp uninstall fulcrum   # if gh supports it
```
