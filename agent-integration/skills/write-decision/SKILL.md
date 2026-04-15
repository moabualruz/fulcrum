---
name: write-decision
description: Record an architectural or implementation decision to memory
triggers:
  - made a significant design choice
  - chose between multiple approaches
  - established a constraint or pattern
version: 1.0.0
author: fulcrum
user-invocable: false
allowed-tools:
  - mcp__fulcrum__write_memory
---

# Write Decision

When you make a non-obvious decision that future agents should know about:

1. Call `mcp__fulcrum__write_memory` with:
   - `kind: "decision"`
   - `title`: short, searchable label (e.g. "Use RRF over pure vector search for recall")
   - `content`: full rationale — what options were considered, why this was chosen, what was rejected and why
   - `importance: 0.7` or higher for architectural decisions
   - `tags`: relevant system names, components, or concepts
2. Be specific in the content. Vague decisions ("used the better approach") are useless to future agents.
3. Write decisions immediately — don't defer until session end when context is lost.
