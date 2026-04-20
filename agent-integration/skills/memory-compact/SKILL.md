---
name: memory-compact
description: Compact + consolidate session memories before context window fills.
---

# Memory Compact

Before compaction or session end, preserve knowledge:

1. Identify decisions made this session: architectural choices, constraints discovered, rejected approaches.
2. Each decision → `fulcrum action exec write_memory` with `kind: "decision"`, clear `title`, full `content` (rationale), `importance: 0.8+`.
3. Facts discovered (API behaviors, invariants, system properties): `kind: "fact"` with `importance: 0.6`.
4. Don't duplicate existing memories. Check `fulcrum action exec recall_memory` first.

**Don't defer.** After compaction, conversation context gone. Memory carries knowledge to next session.
