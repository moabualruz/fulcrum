---
name: search-memory
description: Search agent memory before starting work — surface prior knowledge.
---

# Search Memory

Before any substantial work:

1. Formulate 2-3 queries: system being modified, related decisions, known constraints.
2. Each query: `fulcrum action exec recall_memory` with `workspace_id`, `project_id`, query string.
3. Review for: architectural decisions, known pitfalls, established patterns, prior failure modes.
4. `recall_score < 0.3` → low-confidence. Verify before relying.
5. Incorporate findings before writing code or deciding.

**Do not skip.** Most expensive errors come from repeating past mistakes or violating prior decisions already in memory.
