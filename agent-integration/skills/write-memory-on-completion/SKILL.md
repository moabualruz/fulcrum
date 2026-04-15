---
name: write-memory-on-completion
description: Persist a memory after completing any task that involved a decision, trade-off, or surprising finding. Applies after complete_agent_run when the work produced durable knowledge.
allowed-tools:
  - mcp__fulcrum__write_memory
user-invocable: false
---

# Write memory on completion

After completing a task — especially one that involved a decision, a
trade-off, or a surprising finding — call `mcp__fulcrum__write_memory`.
This is what makes Fulcrum's L2 memory graph valuable over time. Every
memory you write is a gift to the next agent (and often your future self).

## When to apply

- You made an architectural choice that wasn't obvious
- You discovered a gotcha (a library quirk, a flaky test, a subtle bug)
- You changed a convention or introduced a new pattern
- The task outcome is worth remembering even if the task itself is done
- You just cited recalled memories — link your output back

Skip memory writes for: trivial typo fixes, pure formatting changes,
reverts of work that happened in the same session.

## How

```
mcp__fulcrum__write_memory
  workspace_id: (same workspace as your run)
  kind:         "task_outcome" | "decision" | "lesson"
  scope:        "task" | "project"
  task_id:      (if scope=task)
  content:      (1-3 paragraphs — see below)
  tags:         ["packages/core/src/memory", "FTS5", "fallback"]
```

### Choosing `kind`

- **task_outcome**: what happened on this specific task. "We did X to
  achieve Y; tests pass; PR #42 merged." Default for completion writes.
- **decision**: an architectural or convention choice. "We use text_pair
  tokenization for the reranker because batching with pairwise inputs
  avoids a 40% throughput hit." Read-heavy over time.
- **lesson**: something you learned that generalizes. "SQLite FTS5
  `MATCH` raises any `SQLITE_ERROR`, not a specific subclass — catch
  broadly in fallback paths." Reusable across tasks.

### Choosing `scope`

- `task`: this memory is bound to the task's lifecycle. Use for
  `task_outcome`.
- `project`: this memory applies to the whole workspace. Use for
  `decision` and `lesson`.

### `tags`

Tags are the primary recall vector. Include:

- File paths touched (`packages/core/src/memory/recall.ts`)
- Component or concept names (`FTS5`, `reranker`, `WIP limiter`)
- Error types or symptoms (`SQLITE_ERROR`, `unterminated string`)

## Citing prior memories

If you relied on memories you recalled earlier in the session, link them
in your `content` body: `Supersedes M-0301. Builds on M-0423.` This
creates the memory graph the chief-of-staff traverses when planning.

## Red flags

- You completed a run without writing any memory on a non-trivial task →
  the knowledge is gone the moment the conversation ends.
- You wrote a memory with empty tags → it will never be recalled; add
  paths and concepts.
- You wrote a `lesson` that is actually a `task_outcome` — re-classify; a
  lesson should read as useful to a stranger with no context.

See also: [recall-before-writing](../recall-before-writing/SKILL.md),
[complete-agent-run](../complete-agent-run/SKILL.md).
