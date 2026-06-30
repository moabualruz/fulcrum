## When To Use

Use `macro-subagent-orchestration` when:

- The user asks for more lanes, more subagents, a wave, orchestration, or broad execution.
- Work comes from a backlog, tracker, local issue database, milestone, or PR queue.
- Multiple small tasks share an owner path, checkout, branch, test command, or PR destination.
- Previous orchestration produced too many tiny PRs or tiny agent tasks.
- You need to keep 10 to 30 agents useful without wasting time on micro slices.
- You need worker dispatch, review loops, verification, and integration guidance in one skill.

Use micro subagent skills instead when:

- There is one narrow independent task.
- The next action is a small parent edit.
- A reviewer or explorer has one bounded question.
- A task cannot be safely bundled because of a recorded split reason.

Do not load the micro skills just to complete a broad wave. This skill already covers their macro-level cases: when to delegate, how to brief workers, how to handle worker statuses, how to review, how to verify, and when to keep work local.
