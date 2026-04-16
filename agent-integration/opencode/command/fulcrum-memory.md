---
description: search or save Fulcrum agent memory
---

If the user wants to search memory, run via bash:
```bash
fulcrum action exec recall_memory --json '{"query":"<user query>","limit":10}'
```
Present results with content, score (highlight > 0.7 as highly relevant), and tags.

If the user wants to save a memory, run:
```bash
fulcrum action exec write_memory --json '{"content":"<content>","title":"<title>","tags":["tag1","tag2"]}'
```
Return the memory_id on save.
