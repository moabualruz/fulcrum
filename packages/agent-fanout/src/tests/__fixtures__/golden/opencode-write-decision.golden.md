---
name: fulcrum-skill-write-decision
description: Record architectural or implementation decision to memory.
mode: subagent
hidden: true
permission:
  task:
    '*': deny
---
# Write Decision

Non-obvious decision future agents should know:

1. `fulcrum action exec write_memory`:
   - `kind: "decision"`.
   - `title`: short, searchable label (e.g., "Use RRF over pure vector search for recall").
   - `content`: full rationale — options considered, why chosen, what rejected + why.
   - `importance: 0.7+` for architectural.
   - `tags`: system names, components, concepts.
2. Be specific. Vague decisions ("used the better approach") = useless.
3. Write immediately. Don't defer — context lost at session end.
