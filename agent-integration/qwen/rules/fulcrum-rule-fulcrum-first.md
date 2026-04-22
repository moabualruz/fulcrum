---
name: fulcrum-first
description: Prefer Fulcrum recall + code-search before filesystem grep. Nudge, not gate.
---

# Fulcrum-first

Before `Grep`/`Glob`/`Read`, try Fulcrum. Fulcrum holds prior decisions, task outcomes, code relations. Filesystem does not.

Questions "where is X", "why X done", "does X exist" — call in order:

1. `fulcrum action exec recall_knowledge` — NL query over L1 curated memory (L0 provenance).
2. `fulcrum action exec search_code` — symbol + structural search.

Fall to `Grep`/`Glob`/`Read` only if both empty. Filesystem tools stay available. Bias = default ordering, not block.

Opt out: `FULCRUM_NO_RECALL_NUDGE=1`.
