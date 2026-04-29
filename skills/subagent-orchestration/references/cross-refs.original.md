## Cross-refs

Invoke related skills explicitly when conditions match:

- Invoke `dispatching-parallel-agents` when 2+ independent units can run at once.
- Invoke `using-git-worktrees` when work starts or review happens in isolated worktree.
- Invoke `test-driven-development` for behavior changes before implementation.
- Invoke `requesting-code-review` before accepting implementation output.
- Invoke `receiving-code-review` when reviewer finds issues.
- Invoke `verification-before-completion` before claiming done.
- Invoke `systematic-debugging` when tests, workers, or reviewers expose failure.

Agent-specific surfaces:

- Claude Code: subagents, tool limits, model choice, project/user agent files, optional worktree isolation.
- Codex CLI: custom agents, explicit user authorization before spawning, parallel review/implementation agents when allowed.
- Gemini CLI: `@agent_name`, `/agents`, separate context/tool surfaces.
- OpenCode: writable implementation agents vs read-only explore agents.
- Pi CLI: parallel builder/chains, inheritance flags, worktree-aware execution.
