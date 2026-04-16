---
name: fulcrum-recall-before-writing
description: Use before making architectural decisions, writing significant new code, or designing APIs to check if relevant knowledge exists in the project memory
---

# Recall Before Writing

Before significant implementation work:

1. Formulate a query about the area you're working on (e.g., "authentication middleware patterns", "database schema decisions")
2. Run the recall command via bash:

```bash
fulcrum action exec recall_memory --json '{"query":"authentication middleware patterns","limit":10}'
```

3. Review memories with score > 0.7 — these are highly relevant
4. If relevant decisions or patterns are found, apply them to your work
5. If no relevant memories exist, proceed normally but write a memory on completion

## After completing significant work

```bash
fulcrum action exec write_memory --json '{
  "content": "Decided to use JWT with 15-minute expiry because session storage had latency issues.",
  "title": "Auth token strategy",
  "tags": ["authentication", "jwt", "decision"]
}'
```

Use `/fulcrum-memory` slash command for quick interactive searches.
