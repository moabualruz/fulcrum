# Orchestration and context rules

Read when using subagents, long-running sessions, large outputs, or compressed output style.

## Subagents

- Dispatch parallel subagents only for independent workstreams.
- Partition by file ownership to avoid collisions.
- Require verifiable handles from subagents for side effects.
- Verify subagent claims with status, diffs, file reads, or tests.

## Output style

- Keep answers compact by default.
- Preserve code blocks, paths, commands, URLs, version numbers, tool names, headings, and error messages exactly.
- Drop compact style for security warnings, destructive-action confirmations, and multi-step sequences where order matters.
