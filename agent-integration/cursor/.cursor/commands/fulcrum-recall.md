---
name: fulcrum-recall
description: Recall Fulcrum memory on a topic before writing code or making decisions
---

Query Fulcrum memory for prior decisions, outcomes, or context on the given topic.

Run: `fulcrum action exec recall_knowledge --query "<topic>" --limit 10`

If results are empty, also try: `fulcrum action exec recall_memory --query "<topic>"`

Report back what was found before proceeding with any implementation.
