---
name: search-memory
description: Search agent memory before starting work to surface relevant prior knowledge
triggers:
  - starting any non-trivial task
  - before writing code
  - need context on prior decisions
version: 1.0.0
author: fulcrum
user-invocable: false
allowed-tools:
  - mcp__fulcrum__recall_memory
---

# Search Memory

Before starting any substantial work:

1. Formulate 2-3 queries that would surface relevant context: the system being modified, related decisions, known constraints.
2. For each query, call `mcp__fulcrum__recall_memory` with `workspace_id`, `project_id`, and the query string.
3. Review results for: architectural decisions, known pitfalls, established patterns, prior failure modes.
4. If results include a `recall_score < 0.3`, treat them as low-confidence — verify before relying on them.
5. Incorporate relevant findings before writing any code or making decisions.

**Do not skip this.** The most expensive errors come from repeating past mistakes or violating established decisions that are already in memory.
