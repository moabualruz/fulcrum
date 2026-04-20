---
name: fulcrum-first
description: Prefer Fulcrum recall and code-search tools before filesystem grep. Nudges only — never blocks.
---

# Fulcrum-first

Before using `Grep`, `Glob`, or `Read` to search the codebase, try the Fulcrum
recall and code-search tools first. Fulcrum stores prior decisions, task
outcomes, and code relationships the filesystem does not.

For any "where is X", "why was X done", or "does X exist" question, call in
order:

1. `fulcrum action exec recall_knowledge` — natural-language query over
   curated memory (L1 pages with L0 provenance).
2. `fulcrum action exec search_code` — symbol and structural search when the
   question is about code shape.

Fall through to `Grep` / `Glob` / `Read` only when both return nothing
relevant. You may always use filesystem tools; the bias is about default
ordering, not a gate.

Opt out per session with `FULCRUM_NO_RECALL_NUDGE=1`.
