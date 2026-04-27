---
name: promote
description: Walk vault/pending-global/, present each staged item with a suggested destination, accept user confirm/edit/skip per item, then move confirmed files to vault/cross-project/ or append to ~/.claude/CLAUDE.md. Triggered by /promote. Never autonomous — every file requires explicit user action.
---

# Promote to global (`/promote`)

## When to use

- The user runs `/promote`.
- SessionStart shows the "📬 N pending-global items >24h old — `/promote` to review" notice and the user agrees to review now.

## Workflow

### 1. Walk pending-global

```bash
fd . ~/vault/pending-global/ --extension md --type f
```

If the directory is empty or missing, output `No pending-global items.` and exit.

### 2. For each file

Present in order (oldest first, by mtime). For each:

**a. Show content.** Display the full file content to the user. Show the filename and mtime as a header.

**b. Suggest a destination.** Based on content, propose ONE of:
- `~/vault/cross-project/patterns/<name>.md` — if it's a recurring pattern or anti-pattern from a post-mortem
- `~/vault/cross-project/tools/<name>.md` — if it's a universal tool preference (e.g. "xh beats curl")
- `~/vault/cross-project/anti-patterns/<name>.md` — if it's something the user corrected
- Append to `~/.claude/CLAUDE.md` — if it's a behavioral rule that applies to every Claude session

**c. Accept user input:**
- `y` / `enter` — accept suggested destination
- `n` / `skip` — leave the file in `pending-global/` for later
- `e` / `edit` — let the user choose a different destination or edit the content
- `d` / `delete` — discard (the agent created noise; the user is correcting)

### 3. On confirm

- For `vault/cross-project/...` destinations: `git mv` the file to the chosen path inside the vault.
- For `~/.claude/CLAUDE.md`: append content to CLAUDE.md, then `git rm` the staged file.
- Commit: `git -C ~/vault commit -m "promote: <name> → <destination>"`.

### 4. On delete

- `git rm` the staged file.
- Commit: `git -C ~/vault commit -m "discard: <name>"`.

### 5. On skip

Do nothing. The file stays in `pending-global/`. The next SessionStart will surface it again once it crosses the 24h staleness line.

### 6. Push the vault

After all items processed:
```bash
git -C ~/vault push
```

## Output to user

Summarise the session in three lines:
```
Reviewed 5 pending-global items:
  - 3 promoted (2 → cross-project, 1 → CLAUDE.md)
  - 1 deleted
  - 1 skipped — still in pending-global/
```

## Anti-pattern to avoid

**Never auto-promote.** The Gemini CLI failure mode (issue #6371) was agent-autonomous global memory writes. The whole point of `pending-global/` is to make the human gate explicit. If you find yourself wanting to "just promote the obvious ones without asking" — don't. The cost of asking is small; the cost of polluted global memory is high.
