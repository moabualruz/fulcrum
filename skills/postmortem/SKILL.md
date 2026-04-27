---
name: postmortem
description: Two-document post-mortem — full incident write-up to Plane Pages (or docs/postmortems/ if Plane is not running), and a 3-line lesson note to vault/cross-project/patterns/. Triggered by /postmortem <incident-slug>. Both documents are written together; the lesson note is non-negotiable.
---

# Extract postmortem lesson (`/postmortem <incident-slug>`)

## When to use

Immediately after an incident or production issue. **Both documents are written together** — never defer the lesson note to a "batch review later". Forgetting decays sharply after 24 hours.

## Workflow

### 1. Gather facts

Ask the user (or scan recent context) for:
- Timeline (when it started, when it was detected, when it was resolved)
- What broke (the technical root cause, not just the symptom)
- What action items prevent recurrence
- The *transferable lesson* — the one sentence that would have helped you avoid this even on a different project

### 2. Draft document 1 — full post-mortem (project-scoped)

```markdown
# Post-mortem: <incident-slug>

## Summary
<1-2 sentences>

## Timeline (UTC)
- HH:MM — <event>
- HH:MM — <detection>
- HH:MM — <mitigation>
- HH:MM — <resolution>

## Root cause
<technical root cause, 2-3 sentences>

## Impact
<users / data / time>

## Action items
- [ ] <preventive change 1>
- [ ] <preventive change 2>

## Lesson extracted
<the 1-line transferable lesson — same as document 2>
```

**Destination:**
- If `$PLANE_ENDPOINT` is reachable (try `xh --quiet --check-status GET "$PLANE_ENDPOINT/api/v1/" "x-api-key:$(cat ~/.config/plane/key)"`), POST as a Plane Page under the active project.
- Otherwise: `docs/postmortems/<incident-slug>.md` in the project repo.

### 3. Draft document 2 — extracted lesson (cross-project, exactly 3 lines)

`~/vault/cross-project/patterns/<lesson-slug>.md`:

```markdown
# <lesson title — declarative sentence, e.g. "Pin third-party webhook payload versions">

**Domain:** <one or two tags — e.g. "webhooks, third-party-api">
**Source:** <project>/docs/postmortems/<incident-slug>.md (or Plane Page URL)
```

`<lesson-slug>` is lowercase-hyphenated, derived from the lesson title.

### 4. Show both drafts to user

Wait for explicit confirmation. Accept edits. Both documents must be approved together.

### 5. On confirmation, write both

- **Doc 1** to Plane (POST /api/v1/.../pages/) or to `docs/postmortems/<incident-slug>.md` + `git add` + `git commit -m "docs: post-mortem <incident-slug>"`.
- **Doc 2** to `~/vault/cross-project/patterns/<lesson-slug>.md` + `git -C ~/vault add` + `git -C ~/vault commit -m "lesson: <slug> from <project>/<incident-slug>"`.

### 6. Push the vault

```bash
git -C ~/vault push
```

## Output to user

```
Post-mortem written:
  Full report   → <plane URL or docs/postmortems/<incident-slug>.md>
  Lesson        → ~/vault/cross-project/patterns/<lesson-slug>.md
```

## Anti-pattern to avoid

**Never write the full report without the lesson.** A post-mortem stuck in Plane with no extracted lesson means the same incident shape will recur on a different project. The cross-project lesson note is the whole point.
