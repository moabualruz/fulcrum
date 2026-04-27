---
name: tool-name
description: Third-person, imperative trigger sentence. Include the trigger phrases an agent would actually encounter ("when grepping a tree", "when filtering JSON"). Stay under 1024 characters.
---

# Tool Name

## When to use

- Trigger phrase 1 → invoke this skill.
- Trigger phrase 2 → invoke this skill.
- Counter-trigger (when NOT to use): …

## Invocation

Canonical command:

```bash
<tool> [args]
```

JSON-friendly variant (parse with `jq`):

```bash
<tool> --json | jq '<query>'
```

## Patterns

### Pattern A — <name>
What it is, when to reach for it, single example.

```bash
<example>
```

### Pattern B — <name>
…

## Anti-patterns

- **Don't** `<bad invocation>` — it `<failure mode>`. Use `<good>` instead.
- **Don't** assume `<X>` — it changes between versions; verify with `<check>`.

## Cross-refs

- Behavioral rule: see `rules/AGENTS.md` §<n>.
- Hook recipe: see `docs/hooks.md` §<n> (if applicable).
- Upstream docs: <https://…>
