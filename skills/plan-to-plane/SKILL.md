---
name: plan-to-plane
description: Parse a plan/spec markdown into discrete Plane issues, preview the proposed list, and create the issues via the Plane REST API after user confirmation. Triggered by /plan-to-plane. Never auto-create — the preview-and-confirm step is non-skippable.
---

# To Plane (`/plan-to-plane`)

## When to use

The user has a plan, spec, or design document and wants the action items tracked as discrete Plane issues. The document may be the current file in the editor, a path the user provides, or pasted text.

## Prerequisites

- `$PLANE_ENDPOINT` set (from env or `~/.config/plane/endpoint`).
- API key in `~/.config/plane/key`.
- `xh` and `jq` on PATH.

If any prerequisite is missing, abort with a clear message — do not silently fall back.

## Workflow

### 1. Resolve endpoint and auth

```bash
PLANE_ENDPOINT="${PLANE_ENDPOINT:-$(grep '^PLANE_ENDPOINT=' ~/.config/plane/endpoint 2>/dev/null | cut -d= -f2-)}"
KEY=$(cat ~/.config/plane/key)
```

### 2. Identify workspace and project

If the project name (`basename "$PWD"`) matches an existing Plane project, use it. Otherwise ask the user which Plane project to target — list candidates by querying:

```bash
xh GET "$PLANE_ENDPOINT/api/v1/workspaces/" "x-api-key:$KEY" | jq -r '.[] | "\(.slug) - \(.name)"'
xh GET "$PLANE_ENDPOINT/api/v1/workspaces/<ws>/projects/" "x-api-key:$KEY" | jq -r '.[] | "\(.id) - \(.name)"'
```

### 3. Parse the plan

Read the source document. Extract action items using these heuristics in order:
- Markdown checklist items: `- [ ] ...` and `- [x] ...`.
- Numbered list items at any depth: `1. ...`, `2. ...`.
- H2/H3 headings under an "Action items", "Tasks", or "TODO" section.

For each candidate, derive:
- **Title** — the line content, trimmed, max 80 chars.
- **Description** — the surrounding context (the paragraph or sub-bullets under the item).
- **Labels** — derived from the heading hierarchy or `[label]` markers in the line.

### 4. Preview to user

Show the full proposed list before any API call:

```
Proposed Plane issues for project: <project-name>

  1. <title>
     description: <first 60 chars>...
     labels: <comma-separated>

  2. <title>
     ...

Create all? [y / n / edit-N]
```

Allow:
- `y` — create all
- `n` — abort
- `edit-N` — let user adjust title/description/labels for issue N, then re-preview

**Never skip the preview.** Even when the source is a clean checklist, the user must see what's about to land in Plane.

### 5. Create issues

For each confirmed item:

```bash
xh --check-status POST "$PLANE_ENDPOINT/api/v1/workspaces/<ws>/projects/<proj>/issues/" \
  "x-api-key:$KEY" \
  name="<title>" \
  description_html="<description>" \
  labels:='["<label1>", "<label2>"]'
```

Capture the response `id` and project URL.

### 6. Output the list

```
Created 7 Plane issues:
  PROJ-42  <title>  <url>
  PROJ-43  <title>  <url>
  ...
```

## Failure handling

- **API 401 / 403:** key is wrong or expired. Tell the user to regenerate from the Plane UI; do not try alternate auth methods.
- **API 404 on project:** the project name didn't match. Re-prompt with workspace listing.
- **API 5xx:** retry once with exponential backoff (1s, then abort). Do not silently swallow — surface the error to the user.

## Anti-pattern to avoid

**Never auto-create without the preview.** Plane is shared state visible to other users. A skill that creates 30 issues without confirmation has the same blast radius as a force-push. Preview is the gate.
