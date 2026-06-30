## Anti-Patterns

- Treat local issue row size as worker lane size.
- Spawn one agent per child issue when same-owner rows can ship together.
- Open one PR per tiny fix without a split reason.
- Increase concurrency before right-sizing bundles.
- Split implementation, tests, docs, and generated artifacts into separate PRs for the same owner.
- Let review loops create drip-feed PRs instead of folding compatible fixes into the active lane.
- Mark a lane complete because the worker reported done without checking status, diff, tests, and evidence.
- Spawn because agents are available, not because bundles are independent.
- Give a worker broad context dump instead of a bundle id, owner path, deliverable, and verification command.
- Ask a worker to read the whole plan when the parent can provide the lane brief.
- Skip spec or quality review for a meaningful lane.
- Start code-quality review before spec or contract compliance is resolved.
- Leave parent idle while independent lanes, PR checks, tracker reconciliation, or verification prep can proceed.
- Accept summarized test counts without command evidence when exact evidence is required.
- Re-run a blocked worker with the same prompt and no new context.
