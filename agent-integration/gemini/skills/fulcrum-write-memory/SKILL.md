---
name: fulcrum-write-memory
description: Use after completing significant work to save key findings, decisions, or lessons to the project memory vault for future recall
---

# Write Memory to Fulcrum

After completing significant work, persist what you learned:

```bash
fulcrum action exec write_memory --json '{
  "content": "Full description of the decision, finding, or lesson.",
  "title": "Short descriptive title",
  "tags": ["component-name", "decision", "bug-fix"]
}'
```

## What to write

- **Architectural decisions**: why you chose this pattern, what alternatives were rejected
- **Bug root causes**: what broke and why, so future agents don't re-investigate
- **New patterns or conventions**: what they are and where they apply
- **Lessons learned**: gotchas, library quirks, non-obvious behavior

## Good tags

Include file paths, concept names, and categories:
- `["packages/auth/src", "jwt", "decision"]`
- `["database", "migration", "lesson"]`
- `["packages/cli/src", "bug-fix", "error-handling"]`

Tags are the primary recall vector — empty tags mean the memory will never be found.

Use `/fulcrum-memory` slash command to search or save memories interactively.
