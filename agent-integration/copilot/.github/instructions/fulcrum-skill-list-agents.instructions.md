---
applyTo: "**"
description: "Fulcrum skill: Discover available agent roles + capabilities before assigning work."
---

---
name: list-agents
description: Discover available agent roles + capabilities before assigning work.
---

# List Agents

Discover available roles:

1. `fulcrum action exec list_agent_profiles` → all 24 canonical roles + descriptions + capabilities.
2. Key roles:
   - `chief_of_staff` (L1): orchestrates teams, creates tasks. Never writes code.
   - `software_engineer`: general implementation.
   - `qa_engineer`: testing + verification.
   - `code_reviewer`: code review + quality.
   - `architecture_reviewer`: system design review.
   - `research_worker`: investigation + analysis.
   - `memory_curator`: memory maintenance + consolidation.
3. Custom roles: check `fulcrum action exec list_agent_profiles` for workspace-specific definitions.
4. Assign tasks by `done criteria` — match required skill to role description.
