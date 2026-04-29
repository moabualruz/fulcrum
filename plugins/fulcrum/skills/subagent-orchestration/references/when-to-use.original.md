## When to use

Use subagents only when delegation beats token/context cost.

Use when:

- User asks for subagents, parallel agents, delegation, workers, reviewers, audits, or agent-driven execution.
- Work splits into independent smallest-doable units.
- Separate judgment matters: review, security, vendor/API research, PR/MR feedback.
- Parent can keep doing useful non-overlapping work while agents run.
- Context would bloat parent or distract from critical path.

Do not use when:

- One small edit/test/review is faster in parent session.
- Task is sequential and parent must wait immediately.
- Multiple agents would need same files/context.
- Platform policy requires explicit user authorization and user has not given it.

Subagents are expensive. Minimize redundant input tokens.

Do not spawn for:

- One obvious test.
- One small edit.
- One-file low-risk review.
- Work parent can do faster than briefing an agent.
- Sequential work where parent waits immediately.

Spawn when:

- Units are independent and smallest testable/doable slices.
- Context isolation is useful.
- Separate judgment reduces risk.
- Multiple sources/files need parallel coverage.
- Parent can keep moving on non-overlapping work.
