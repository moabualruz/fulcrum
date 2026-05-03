---
Status: implemented
Triage: AFK
Pillar: artifacts
Blocked-by: [06-trpc-procedures.md, 07-manual-upload.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q25, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# Artifact preview + download: text/image/binary surfaces across Web, CLI, TUI

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Always-on: Manual upload + preview + CRUD, surfaces; issues 10-11)

## What to build
Implement artifact preview logic across all three surfaces. Web: `/artifacts/<id>` detail route with preview panel — text-MIME renders Shiki-highlighted inline code block; images render `<img>`; binary shows hex dump header + download-only link. CLI: `fulcrum artifacts show <id>` prints metadata; `fulcrum artifacts download <id> [--out <path>]` streams file to stdout or path (uses `bat` for display, raw bytes for `--out`). TUI: scrollable buffer for text preview; Sixel image rendering if terminal supports; binary shows dimensions or hex header; `d` key triggers download to `~/Downloads/<filename>`.

## Acceptance criteria
- [ ] Schema migration: N/A — reads `artifacts.mime` and `artifacts.path`.
- [ ] tRPC procedure / module: `artifacts.get` returns full metadata including path; download served via SvelteKit file response (not tRPC stream).
- [ ] Web surface: `/artifacts/<id>` renders correct preview for PNG (image), `.ts` (Shiki TypeScript highlight), `.bin` (download-only + hex header); Playwright test covers all three MIME categories.
- [ ] CLI command: `fulcrum artifacts download <id> --out /tmp/foo.txt` writes correct bytes; `fulcrum artifacts show <id> --json` includes mime, size_bytes, checksum_sha256, path.
- [ ] TUI screen: text file shows scrollable syntax-highlighted buffer; image shows Sixel if supported, else dimensions; binary shows hex header; `d` downloads to `~/Downloads`.
- [ ] Tests: mock artifact rows for each MIME category; preview logic unit-tested (correct branch for text/image/binary); download streams correct bytes; RED→GREEN.

## Blocked by
- `06-trpc-procedures.md` — `artifacts.get` procedure.
- `07-manual-upload.md` — test fixtures need uploaded artifacts.

## Notes / Tech-stack hints
- Shiki v1 (MIT) — reuse WASM instance from Pillar 7/9; dynamic import for code splitting.
- Sixel support detection: check `TERM` and `COLORTERM`; graceful fallback to dimensions string.
- SvelteKit download route: `+server.ts` `GET /artifacts/<id>/download` → streams `node:fs` read stream with correct `Content-Disposition` header.
- Failure gate: if Shiki WASM unavailable in TUI → `highlight.js` subset for common languages.
