---
description: Search Fulcrum agent memory for relevant knowledge
argument-hint: "[search query]"
---

Call `mcp__fulcrum__get_current_context` (no parameters) to obtain `workspace_id` and `project_id`, then call `mcp__fulcrum__recall_memory` with `query` set to `$ARGUMENTS` and those IDs. Display the top results with their titles, summaries, and recall scores. If no query is provided, ask the user what they want to search for.
