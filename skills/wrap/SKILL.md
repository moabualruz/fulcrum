---
name: wrap
description: At session end, apply the future-behavior test to candidate findings and route them to the vault per the trust model. Triggered by /wrap. Also proposes any missed Vibe ADRs and writes in-flight.md if mid-thought state is detected. Never autonomous — every write goes through user confirmation when it targets cross-project memory.
---

# Extract session (`/wrap`)

## When to use

- The user runs `/wrap`.
- SessionStart shows the "🪄 Previous session was substantive but `/wrap` was not run" notice and the user agrees to extract now.

## Workflow

### 1. Identify candidate findings

Walk the conversation for things worth keeping:
- User corrections ("no, don't do that") → write
- Explicit preferences ("always use X") → write
- Anti-patterns discovered → write
- Surprising tool results → write
- Research findings (library comparisons, gotchas) → run the future-behavior test

**Never extract:** intermediate reasoning, raw API response bodies, transcript excerpts, things derivable from current code.

### 2. Future-behavior test

For each research finding, ask yourself:

> *"Would knowing this change how I act next session on a different task?"*

- **Yes** → write.
- **No** → discard.

### 3. Route per trust model

| Finding type | Destination | Confirmation |
|---|---|---|
| User corrections, anti-patterns | `~/vault/project-specific/<project>/research/<topic>.md` (project-specific autonomous) | None — write directly |
| Project-specific research | `~/vault/project-specific/<project>/research/<topic>.md` | None — write directly |
| Cross-project candidates | `~/vault/pending-global/<topic>.md` (staging) | None to stage — `/promote` reviews later |

`<project>` = `basename "$PWD"`. `<topic>` = lowercase-hyphenated short name.

**Never write directly to `~/vault/cross-project/` or `~/.claude/CLAUDE.md`.** Cross-project promotion goes through `pending-global/` and the `/promote` skill.

### 4. Sub-routine: missed Vibe ADRs

Scan the transcript for decisions that landed but weren't captured via `/adr`. For each:
- Invoke the `adr` skill with the decision summary.
- Wait for user confirmation per skill protocol.
- Move on to the next.

### 5. Sub-routine: in-flight heuristic

Check three conditions:
- `git status --porcelain` is non-empty (uncommitted changes exist), AND
- No new ADR was written this session, AND
- No Plane issue was closed this session (when Plane is running).

If all three are true, propose: "It looks like work is mid-flight. Run `/in-flight <one-line>` to capture state?" Wait for user confirmation; if yes, prompt for the one-line and invoke `/in-flight`.

### 6. Mark the wrap as complete

```bash
mkdir -p ~/.fulcrum/state
touch "$HOME/.fulcrum/state/$(basename "$PWD").last-wrap"
```

This suppresses the SessionStart "previous session was substantive but /wrap was not run" notice on the next session.

### 7. Push the vault

The Stop hook handles vault push. If you wrote files during `/wrap`, you may push immediately:

```bash
git -C ~/vault add -A
git -C ~/vault commit -m "wrap: $(date -u +%Y-%m-%dT%H:%MZ) [<project>]"
git -C ~/vault push
```

## Output to user

Summarise what was written and where, in three short lines:
```
Extracted 3 findings:
  - 2 → vault/project-specific/<project>/research/
  - 1 → vault/pending-global/ (run /promote to review)
Proposed 1 missed ADR (awaiting your confirmation).
```
