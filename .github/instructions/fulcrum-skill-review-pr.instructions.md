---
applyTo: "**"
description: "Fulcrum skill: Structured code review of pull request or diff."
---

---
name: review-pr
description: Structured code review of pull request or diff.
---

# Review PR

Review PR/code change:

1. Recall context: `fulcrum action exec recall_memory` with PR title, affected system, author role.
2. Review diff against task done criteria (from task description or memory).
3. Check 5 axes:
   - **Correctness**: solves stated problem without new bugs?
   - **Security**: secrets, injection vectors, unsafe patterns (check vs `checkSecrets` invariants)?
   - **Test coverage**: edge cases + failure modes tested?
   - **Architecture**: follows established patterns recorded in memory?
   - **Scope**: only touches what was required, or unrelated churn?
4. Record outcome: `fulcrum action exec write_memory` (`kind: "task_outcome"` if approved, `kind: "error"` if issues).
5. Update task status via `fulcrum action exec update_task`.
