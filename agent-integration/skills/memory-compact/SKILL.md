---
name: memory-compact
description: Compact and consolidate session memories before context window fills
---

# Memory Compact

Before context compaction or session end, preserve key knowledge:

1. Identify decisions made this session: architectural choices, constraints discovered, rejected approaches.
2. For each decision, call `fulcrum action exec write_memory` with `kind: "decision"`, a clear `title`, full `content` explaining the rationale, and `importance: 0.8` or higher.
3. For facts discovered (API behaviors, invariants, system properties), use `kind: "fact"` with `importance: 0.6`.
4. Do not duplicate memories already written. Check `fulcrum action exec recall_memory` first.

**Don't defer this.** After compaction, the conversation context is gone. The memory is what carries knowledge to the next session.
