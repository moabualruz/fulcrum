---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 22-marketplace-publisher-keygen
---

# Marketplace tRPC procedures + CLI + TUI panel + Web page (FULCRUM_FEATURES=skill-marketplace)

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement all marketplace-facing surfaces as one vertical slice: `skills.marketplace.*` tRPC procedures (`browse`, `fetch`, `publish`, `verify`, `install`), CLI `fulcrum skills marketplace browse | fetch | publish | verify`, TUI marketplace panel (browse list + `Enter` detail + `i` install + `p` publish overlay), and Web `/settings/skills/marketplace` page (browse grid + search + publisher filter + install + publish form). All gated behind `FULCRUM_FEATURES=skill-marketplace`; flag OFF → tRPC procedures throw `FeatureDisabledError`, CLI exits 1 with message, TUI panel shows "marketplace disabled" banner, Web page shows disabled state card.

## Acceptance criteria

- [ ] Schema / module: `skills.marketplace.browse`, `skills.marketplace.fetch`, `skills.marketplace.publish`, `skills.marketplace.verify`, `skills.marketplace.install` tRPC procedures with Zod schemas
- [ ] Logic: `browse({ query?, tags? })` → returns filtered `MarketplaceListing[]` from registry
- [ ] Logic: `install({ slug, version? })` → calls `verifySignature` first; bad sig → error; good sig → delegates to `skills.install`
- [ ] Logic: all procedures throw `FeatureDisabledError` when flag OFF
- [ ] Logic: CLI `--json` output on all marketplace subcommands; non-zero exit on sig verification fail
- [ ] Logic: TUI `i` key → installs selected listing; `p` overlay → calls `publish` with selected local skill
- [ ] Logic: Web install button calls `skills.marketplace.install`; signature error shown inline
- [ ] Logic: Web publish form selects local skill, calls `skills.marketplace.publish`; success shows listing URL
- [ ] Surfaces parity: `browse`, `fetch`, `install` available on all three surfaces; `publish` on Web + CLI; `verify` on CLI only
- [ ] Tests: flag-off guard test on all five tRPC procedures
- [ ] Tests: `install` with bad sig → error surface (CLI exit 1, Web inline error, TUI error banner)
- [ ] Tests: `browse` with query filter returns subset of listings

## Blocked by

- `22-marketplace-publisher-keygen`

## Notes

TUI browse panel: table with slug/version/publisher/star count (placeholder `0` until registry has star API). Web grid: card per listing with install button. Anonymous browse (read-only) works without org auth; publish requires auth. Minimal read-only public endpoint for anonymous browse is in scope per PRD.
