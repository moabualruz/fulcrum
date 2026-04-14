---
description: Search Fulcrum agent memory for relevant knowledge
argument-hint: "[search query]"
---

Call `mcp__fulcrum__recall_memory` with `query` set to `$ARGUMENTS`, `workspace_id` and `project_id` from `.fulcrum.json`. Display the top results with their titles, summaries, and recall scores. If no query is provided, ask the user what they want to search for.
