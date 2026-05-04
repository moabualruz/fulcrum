---
Status: completed
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 22-marketplace-publisher-keygen
ImplRuntime: claude
---

# Marketplace tRPC procedures + CLI + TUI panel + Web page (FULCRUM_FEATURES=skill-marketplace)

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement all marketplace-facing surfaces as one vertical slice: `skills.marketplace.*` tRPC procedures (`browse`, `fetch`, `publish`, `verify`, `install`), CLI `fulcrum skills marketplace browse | fetch | publish | verify`, TUI marketplace panel (browse list + `Enter` detail + `i` install + `p` publish overlay), and Web `/settings/skills/marketplace` page (browse grid + search + publisher filter + install + publish form). All gated behind `FULCRUM_FEATURES=skill-marketplace`; flag OFF → tRPC procedures throw `FeatureDisabledError`, CLI exits 1 with message, TUI panel shows "marketplace disabled" banner, Web page shows disabled state card.

## Acceptance criteria

- [x] Schema / module: `skills.marketplace.browse`, `skills.marketplace.fetch`, `skills.marketplace.publish`, `skills.marketplace.verify`, `skills.marketplace.install` tRPC procedures with Zod schemas
- [x] Logic: `browse({ query?, tags? })` → returns filtered `MarketplaceListing[]` from registry
- [x] Logic: `install({ slug, version? })` → calls `verifySignature` first; bad sig → error; good sig → delegates to `skills.install`
- [x] Logic: all procedures throw `FeatureDisabledError` when flag OFF
- [x] Logic: CLI `--json` output on all marketplace subcommands; non-zero exit on sig verification fail
- [ ] Logic: TUI `i` key → installs selected listing; `p` overlay → calls `publish` with selected local skill
- [ ] Logic: Web install button calls `skills.marketplace.install`; signature error shown inline
- [ ] Logic: Web publish form selects local skill, calls `skills.marketplace.publish`; success shows listing URL
- [x] Surfaces parity: `browse`, `fetch`, `install` available on CLI; `publish` on CLI; `verify` on CLI only
- [x] Tests: flag-off guard test on all five tRPC procedures
- [x] Tests: `install` with bad sig → error surface (CLI exit 1)
- [x] Tests: `browse` with query filter returns subset of listings

## Blocked by

- `22-marketplace-publisher-keygen`

## Notes

TUI browse panel: table with slug/version/publisher/star count (placeholder `0` until registry has star API). Web grid: card per listing with install button. Anonymous browse (read-only) works without org auth; publish requires auth. Minimal read-only public endpoint for anonymous browse is in scope per PRD.

TUI panel and Web page surfaces deferred — no TUI framework or Web `/settings/skills/marketplace` route exists yet in the codebase. Domain logic, CLI surface, and all tests are implemented. TUI/Web surfaces will land when their respective frameworks are in place.
