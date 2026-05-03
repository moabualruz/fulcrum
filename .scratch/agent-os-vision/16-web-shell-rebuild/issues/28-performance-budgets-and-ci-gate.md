---
Status: implemented
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/20-accessibility-audit.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [A1, A2, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Plan after research with failure gates")
Docs: https://playwright.dev/docs/evaluating, https://developer.chrome.com/docs/lighthouse/overview
---

# Performance budgets, Lighthouse CI gate, doctor web subsystem checks

## What to build

Encode and enforce the PRD's performance budgets in Playwright + CI. (1) SSR first-byte p95 < 100ms: Playwright measures `response.timing().responseStart`; assertion in CI. (2) Page navigation p95 < 100ms: `afterNavigate` hook emits `perf.measure`; `local_telemetry` rows captured; doctor reads p95 from last 7d. (3) Kanban 200 tasks × 7 columns cold load < 300ms: Playwright seeds 200 tasks, measures render time. (4) Table 1000 tasks no blank rows: scroll to bottom in Playwright; assert all rows have content. (5) Cmd+K open < 50ms: `performance.mark` assertion in palette open handler. (6) Doc editor autosave round-trip < 200ms: Vitest tRPC stub. (7) Web build < 60s: CI timeout gate. (8) Lighthouse ≥ 85 performance score: Playwright Lighthouse CI audit on `/`. Also wires the 8 `web` doctor checks.

## Acceptance criteria

- [ ] SSR first-byte p95 <100ms assertion passes in Playwright on seeded local instance.
- [ ] Page navigation p95 < 100ms assertion passes (measured via `afterNavigate` + `perf.measure`).
- [ ] Kanban 200 tasks × 7 columns: Playwright cold-load assertion < 300ms.
- [ ] Table 1000 tasks: virtual scroll — no blank row gap at any scroll position (Playwright `elementCount` assertion per viewport).
- [ ] Cmd+K open < 50ms: `performance.mark('palette-open')` → `performance.measure` → Playwright assertion.
- [ ] Autosave < 200ms: Vitest stub measures tRPC call round-trip.
- [ ] `bun run build` CI stage: timeout gate set to 60s; fails CI if exceeded.
- [ ] Lighthouse ≥ 85 on `/`: Playwright Lighthouse audit; fails CI if score < 85.
- [ ] All 8 `web` doctor checks implemented and return correct status for each pass/warn/fail scenario.
- [ ] `fulcrum doctor --json` includes `web` subsystem; all checks pass on healthy system.

## Blocked by

- Issue 20 (accessibility audit) — all major routes must be complete before meaningful performance + lighthouse run.
