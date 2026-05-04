---
Status: completed
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q38, C1, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Tauri desktop wrapper gated)
Docs: https://tauri.app/v2/guide/
---

# GATED: desktop-app — Tauri v2 wrapper, native window, drag-drop artifact upload, auto-update

## What to build

Behind `FULCRUM_FEATURES=desktop-app`. `src-tauri/` Tauri v2 workspace wrapping the SvelteKit web app. Native OS window; auto-update via Tauri updater plugin. Native drag-and-drop artifact upload: user drops file onto artifact upload zone → Tauri IPC `copy_artifact(path)` → copies to `FULCRUM_HOME/artifacts/` → `artifacts.create` tRPC. macOS/Linux/Windows builds in release pipeline. Feature-flag check via `invoke('check_feature_flag')` at startup.

Flag OFF: `src-tauri/` directory absent from build output; `bun run build` succeeds without Tauri toolchain. Flag ON: `tauri build` produces signed app; drag-drop creates artifact row.

Failure gate: Tauri build fails on target platform → remove that target from release matrix; web-only fallback for that platform; release notes document which platforms ship binary.

## Acceptance criteria

- [ ] Flag OFF: no `src-tauri/` in build output; `bun run build` exits 0 without Rust/Tauri toolchain; existing Playwright tests unaffected.
- [ ] Flag ON: `tauri build` produces binary on macOS arm64 (primary target); binary launches and loads `localhost:5173` in webview.
- [ ] Drag-drop: file dragged onto artifact upload zone → Tauri IPC fires → file copied to `FULCRUM_HOME/artifacts/` → `artifacts.create` → artifact appears in `/artifacts` list.
- [ ] Auto-update: `tauri-update` endpoint configured; `invoke('check_for_updates')` returns response (mocked in test).
- [ ] Release pipeline: cross-compile lanes for macOS arm64 + x64; failure on one target → other targets still publish.
- [ ] `fulcrum doctor web`: `web.tauri_build` check returns `ok` when binary present; `skip` when flag OFF.

## Blocked by

- Issue 01 (scaffold) — SvelteKit app must exist to wrap.
