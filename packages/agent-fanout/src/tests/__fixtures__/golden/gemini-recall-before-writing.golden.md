---
name: fulcrum-recall-before-writing
description: >-
  Query the Fulcrum memory layer before writing new code, docs, or architectural
  decisions. Applies whenever you are about to produce novel output on a topic
  the project may have prior context on.
---
# Recall memory before writing

Fulcrum's L2 memory layer stores prior decisions, task outcomes, and lessons
learned. Skipping it means reinventing the wheel — or, worse, contradicting
a decision a previous agent already made. Always call
`fulcrum action exec recall_memory` before producing novel output.

## When to apply

- You are about to write a new module, file, or function
- You are about to make an architectural decision (naming, schema, API shape,
  dependency choice)
- You are writing documentation that describes "how things work"
- You encounter a term or convention you don't recognise — the memory layer
  may have defined it
- You are resuming a task after a break or handoff from another agent

## How

Call the MCP tool with a short list of search terms drawn from the task goal:

```
fulcrum action exec recall_memory
  workspace_id: (same workspace as your run)
  query:        "plain english description of what you are about to do"
  limit:        5 or 10
```

Run two or three queries, not just one:

1. **Goal query**: `"{task goal in plain english}"` — e.g., `"reranker
   tokenizer batching"`
2. **Path query**: `"{file path or directory}"` — e.g.,
   `"packages/core/src/memory"`
3. **Concept query**: `"{component or pattern name}"` — e.g., `"FTS5
   fallback"`, `"WIP limiter"`

Read every returned memory before you start typing. A single 200-word
decision from a prior run can save you an hour.

## Citing memories

When a recalled memory changes your approach, cite it:

- In your final response to the user: "based on prior decision M-0423, this
  module uses text_pair tokenization..."
- In your commit message: `Refs memory M-0423`
- In the `complete_agent_run` summary: include the memory IDs you relied on

This creates a visible chain of reasoning the chief_of_staff can audit later.

## Red flags

- You wrote a new file without a single `recall_memory` call → you're
  probably contradicting something.
- A memory said "don't do X" and you did X → stop, re-read, either justify
  the divergence or revert.
- You recalled zero memories on a mature project → broaden your query or
  search by file path; zero results usually means a bad query, not an empty
  memory store.

See also: [start-every-task](../start-every-task/SKILL.md),
[write-memory-on-completion](../write-memory-on-completion/SKILL.md).
