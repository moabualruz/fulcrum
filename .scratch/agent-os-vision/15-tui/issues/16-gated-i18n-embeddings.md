---
Status: ready-for-agent
Triage: AFK
Pillar: tui
Blocked-by: [15/issues/14-settings-navigator-and-core-screens.md, 15/issues/12-search-and-notifications.md]
PRD: .scratch/agent-os-vision/prds/15-tui.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 15 section)
Decisions: [C1, Q-flag-granularity, Q17, Q-cross-cut]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 15 — TUI (OpenTUI, Full Feature Parity)

## What to build

Two gated feature implementations in TUI:

**i18n** (`FULCRUM_FEATURES=i18n`): Settings → i18n screen (available locale list; `Enter` selects → writes `tenant_settings(locale)`; TUI re-renders all labels from paraglide-js message catalog). When flag OFF, screen route hidden; navigation attempt → "Feature disabled" banner.

**Semantic search** (`FULCRUM_FEATURES=embeddings`): In full-screen search, when flag ON, "Semantic" toggle chip appears in FilterChips rail; selecting hybrid mode calls `search.query` with `mode='hybrid'` → hybrid BM25+cosine score endpoint. When flag OFF, toggle chip hidden; all queries use plain FTS.

Both features: tested OFF (screen/toggle hidden) and ON (feature active). State persisted in `tenant_settings`.

- **Web**: Settings → i18n page; search page semantic toggle.
- **CLI**: `fulcrum flags set i18n on` enables; `fulcrum search "q" --semantic --json` (embeddings flag).
- **TUI**: primary surface.

## Acceptance criteria

- [ ] i18n OFF: `/settings/i18n` route → "Feature disabled" banner; Settings navigator does not show i18n tab.
- [ ] i18n ON: locale list renders; selecting `fr` → `tenant_settings.locale='fr'`; TUI labels switch to French (test with at least 3 translated strings).
- [ ] Embeddings OFF: search screen shows no "Semantic" toggle; `search.query` called with `mode='fts'`.
- [ ] Embeddings ON: "Semantic" toggle chip visible; selecting → `search.query` with `mode='hybrid'`; results differ from FTS-only (fixture data).
- [ ] Both flags independently controlled; toggling one does not affect the other.
- [ ] CLI `fulcrum flags set i18n on` → TUI i18n screen becomes accessible; CLI `fulcrum flags set i18n off` → hidden again.

## Blocked by

- 15/issues/14-settings-navigator-and-core-screens.md
- 15/issues/12-search-and-notifications.md

## Notes

T15-69–T15-70 maps to this slice.
