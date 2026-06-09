# Orchestration and context rules

Read when using subagents, long-running sessions, context-mode tools, large outputs, or compressed output style.

## Context-mode routing

- Use context-mode MCP tools when available.
- Prefer batch execution for multi-command exploration.
- Use indexed search for follow-up lookup.
- Use sandboxed execution or file-based artifacts for analysis or output over 20 lines.
- Fetch and index web documents instead of dumping raw HTTP output into chat.
- If context-mode transport is closed, repair narrowly, then retry the context-mode path.

## Subagents

- Dispatch parallel subagents only for independent workstreams.
- Partition by file ownership to avoid collisions.
- Require verifiable handles from subagents for side effects.
- Verify subagent claims with status, diffs, file reads, or tests.

## Output style

- Keep answers compact by default.
- Preserve code blocks, paths, commands, URLs, version numbers, tool names, headings, and error messages exactly.
- Drop compact style for security warnings, destructive-action confirmations, and multi-step sequences where order matters.
