---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (cross-cutting section)
Decisions: [A5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (License-clean: all MIT/Apache/BSD)
Docs: []
---

# License-deps audit + CI gate

## Parent
PRD: `.scratch/agent-os-vision/prds/17-cross-cutting-platform.md`

## What to build
Add `scripts/license-audit.ts` that runs `license-checker` (or equivalent) over the full dep graph (Bun + Cargo + Rust workspace), classifies each license, and fails on AGPL / SSPL / BSL / commercial / non-permissive. Generate `LICENSE-DEPS.md` report. Wire into `bun run ci` as a hard gate.
Any persisted audit state uses repository calls (`licenseAuditRepo.saveReport(...)`, `licenseAuditRepo.findLatest(...)`) through MikroORM; no raw data-access strings.

## Acceptance criteria
- [ ] Script: `scripts/license-audit.ts` runs over `package.json` workspaces + Cargo.toml deps.
- [ ] Output: `LICENSE-DEPS.md` lists every dep with name + version + license + classification.
- [ ] CI gate: `scripts/ci.ts` adds `license-audit` step that fails if any classification is non-permissive.
- [ ] CLI command: `fulcrum doctor --license-deps` shows the report inline.
- [ ] TUI surface: integrate into Settings → System → Licenses.
- [ ] Web surface: `/settings/system/licenses` shows the report.
- [ ] Tests: pretend-AGPL fixture must fail; pretend-MIT fixture must pass.

## Blocked by
None — can start immediately.
