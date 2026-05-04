---
Status: completed
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/09-task-detail-and-bulk-ops.md, 16-web-shell-rebuild/issues/11-doc-tree-reader-editor-history.md, 16-web-shell-rebuild/issues/15-search-facets-inbox-audit.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q38, Q-cross-cut, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Accessibility beyond aria-label sweep")
Docs: https://playwright.dev/docs/accessibility-testing, https://www.deque.com/axe/
---

# Accessibility audit — axe-core Playwright scan, keyboard nav, skip links, focus traps

## What to build

Implement WCAG 2.1 AA compliance across all major routes via Playwright `@axe-core/playwright`. Four test suites: (1) axe scan on 7 major routes (`/`, `/projects`, `/tasks/[id]`, `/docs/[id]/edit`, `/search`, `/inbox`, `/auth/login`) — zero violations each; (2) keyboard nav — `Tab` through dashboard reaches all interactive elements, no mouse-only patterns; (3) skip link — first `Tab` on page load focuses `<a href="#main-content">`; `Enter` skips to `<main id="main-content">`; (4) focus trap — `Tab` cycles within Dialog/Sheet modal; `Esc` closes; focus returns to trigger. Fix all violations found during implementation.

Also: `aria-live` regions verified for toast container, bell badge count, run log stream.

## Acceptance criteria

- [ ] axe-core: zero violations on all 7 routes (WCAG 2.1 AA ruleset).
- [ ] Skip link: present as first focusable element on every page; `Enter` moves focus to `#main-content`.
- [ ] Keyboard nav: Playwright `page.keyboard.press('Tab')` sequence reaches all interactive elements on `/` dashboard; no orphaned focusable elements.
- [ ] Focus trap: shadcn-svelte Dialog opened → `Tab` cycles within dialog only; `Esc` closes dialog; focus returns to button that opened it.
- [ ] Sheet (slide-over) same focus trap behavior as Dialog.
- [ ] `aria-live="polite"` on toast container; `aria-live="polite"` on bell badge; `aria-live="off"` on run log (too frequent).
- [ ] All icon-only buttons have `aria-label`.
- [ ] All form inputs have associated `<label>` (via `for` or `aria-labelledby`).
- [ ] Colour contrast: pass `color-contrast` axe rule (enforces ≥4.5:1 text, ≥3:1 UI components).
- [ ] CI: `@axe-core/playwright` scan runs in Playwright e2e suite; any violation fails CI.

## Blocked by

- Issues 09, 11, 15 — task detail, doc editor, search/inbox must be built first for meaningful axe scan.
