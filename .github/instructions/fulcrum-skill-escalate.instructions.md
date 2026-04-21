---
applyTo: "**"
description: "Fulcrum skill: Escalate blocked run to chief_of_staff with clear reason."
---

---
name: escalate
description: Escalate blocked run to chief_of_staff with clear reason.
---

# Escalate

Blocked, cannot proceed:

1. Stop. Do not progress on wrong assumption.
2. Articulate blocker in one sentence: what do you need to know/get to proceed?
3. `fulcrum action exec block_agent_run` with `run_id`, `reason` (one-sentence blocker), `escalation_reason` (why human/CoS decision required).
4. Surface relevant context in `reason` — what was tried, what options are.

**Do not guess.** Wrong assumption costs more than short escalation. Block early, block clearly.
