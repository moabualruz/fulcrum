---
name: fulcrum-write-decision
description: Record a non-obvious architectural or implementation decision to Fulcrum memory
---

When you make a choice that a future agent might question, record it:

`fulcrum action exec write_memory --kind decision --content "<decision and rationale>" --tags '["decision","architecture"]'`

Include: what was decided, what alternatives were considered, and why this approach.
