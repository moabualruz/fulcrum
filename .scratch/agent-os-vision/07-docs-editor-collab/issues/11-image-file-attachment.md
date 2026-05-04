---
Status: completed
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [02-tiptap-svelte-binding-spike.md, 05-doc-crud-trpc.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (top-class editor row)
Docs: [https://tiptap.dev/docs/editor/extensions/nodes/image]
---

# Inline image paste/drag-drop + FileAttachment NodeView — Bun FS upload

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-28, always-on features)

## What to build
Two related NodeViews:

1. **Image** — paste or drag-drop image into editor → uploads to `FULCRUM_HOME/uploads/<org_id>/` via a `POST /api/upload` Bun handler → inserts `<Image src="...">` node. Uses `@tiptap/extension-image`. Progress indicator during upload.
2. **FileAttachment** (`~150 LOC`) — custom NodeView; `/file` slash command or drag-drop any non-image file → same Bun FS upload → renders as downloadable chip (filename + size + icon). Node attrs: `{url, filename, size, mime}`.

Both: upload API rejects files > 50 MB; accepted MIME types configurable. Failure gate: Bun local FS → MinIO (AGPL, server-side) for multi-user deploy (flag `FULCRUM_FEATURES=storage-minio`).

## Acceptance criteria
- [ ] Paste image: paste clipboard PNG/JPEG → upload triggered → `<img>` node inserted with correct `src` URL
- [ ] Drag-drop image: drop image file on editor → same upload → `<img>` node inserted
- [ ] Upload progress: spinner visible on `<img>` node until upload resolves; error state shown on failure
- [ ] `POST /api/upload` handler: saves file to `FULCRUM_HOME/uploads/<org_id>/<uuid>.<ext>`; returns `{url, filename, size, mime}`
- [ ] `POST /api/upload` rejects files > 50 MB with 413 response
- [ ] FileAttachment NodeView: `/file` inserts placeholder; drag-drop non-image triggers upload; chip shows filename + size
- [ ] FileAttachment chip: click → opens download URL in new tab; delete key on chip removes node and deletes file from disk
- [ ] Uploaded files served via `GET /api/uploads/<org_id>/<filename>` with `Content-Disposition: attachment`
- [ ] Tests: upload handler — valid image saves to correct path, returns correct JSON; oversized file returns 413
- [ ] Tests: duplicate filename — append `-2` suffix, no overwrite
- [ ] Web: images render inline in `/docs/<slug>/edit` and `/docs/<slug>` read view
- [ ] Web: file attachment chips render in read view with correct filename and download link
- [ ] CLI: `fulcrum docs show <slug> --json` `body_md` renders images as `![filename](url)` and attachments as `[filename](url)`
- [ ] TUI: images shown as `[image: filename]` placeholder; attachments shown as `[file: filename]` with download path

## Blocked by
`02-tiptap-svelte-binding-spike.md`, `05-doc-crud-trpc.md`

## Notes / Tech-stack hints
- Bun FS upload: `Bun.write(path, file)` in a `POST` handler; wrap in try/catch for disk-full scenarios
- MinIO flag gate: `FULCRUM_FEATURES=storage-minio` → upload handler swaps `Bun.write` for `MinIO.putObject`; URL format changes to presigned S3 URL
- Avoid serving uploads through SvelteKit — use a dedicated Bun static handler at `/api/uploads/` for streaming efficiency
