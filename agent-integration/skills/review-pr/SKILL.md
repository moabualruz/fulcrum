---
name: review-pr
description: Perform a structured code review of a pull request or diff
allowed-tools:
  - mcp__fulcrum__recall_memory
  - mcp__fulcrum__write_memory
  - mcp__fulcrum__update_task
  - Bash
  - Read
---

# Review PR

To review a pull request or code change:

1. Recall relevant context: `mcp__fulcrum__recall_memory` with the PR title, affected system, and author role.
2. Review the diff against the task's done criteria (from the task description or memory).
3. Check five axes:
   - **Correctness**: does it solve the stated problem without introducing new bugs?
   - **Security**: any secrets, injection vectors, or unsafe patterns (check against `checkSecrets` invariants)?
   - **Test coverage**: are edge cases and failure modes tested?
   - **Architecture**: does it follow established patterns recorded in memory?
   - **Scope**: does it only touch what was required, or is there unrelated churn?
4. Record the review outcome with `mcp__fulcrum__write_memory` (`kind: "task_outcome"` if approved, `kind: "error"` if issues found).
5. Update the task status accordingly via `mcp__fulcrum__update_task`.
