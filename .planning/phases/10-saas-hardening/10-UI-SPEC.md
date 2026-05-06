# Phase 10: Huashu UI/UX Closure Spec

**Reviewed:** 2026-05-06
**Skill:** `$huashu-design`
**Mode:** Focused product-surface review gate, not prototype/animation generation.

## Assumptions

Fulcrum Phase 10 is a closure/hardening phase for an operational Agent OS. Interfaces must feel like tools operators use repeatedly: dense, legible, keyboard-first, status-rich, and low-decoration. Web, CLI, and TUI should be capability-equivalent, not visually identical.

## Existing Design Context

- Web uses shadcn-svelte/Bits-style operational components, CSS tokens, dense route headers, tables, filters, settings forms, route skeletons, and Playwright/a11y tests.
- CLI already favors domain verbs and JSON output; Phase 10 must make `--json` universal and add optional formatting without breaking automation.
- TUI uses OpenTUI-style screens with FakeTTY tests, `renderPlain`, keyboard navigation, status panes, and no screen-owned business logic.
- Phase 8 already rejected hero/marketing/orb/gradient composition for operational routes; Phase 10 extends that gate to all closure surfaces.

## Huashu Four Questions

| Interface | Narrative role | Audience distance | Visual temperature | Capacity rule |
|---|---|---|---|---|
| Web | Admin/control room for orgs, billing, queues, connectors, tasks, goals, reports | 1m laptop/desktop | Calm, authoritative, failure-visible | Dense but grouped; tables/split panes over cards |
| CLI | Scriptable automation and human terminal status | 10cm terminal | Precise, terse, deterministic | One command = one action/status; JSON schema first |
| TUI | Live operational cockpit inside repo | 50cm terminal | Focused, high-contrast, low-noise | Keyboard panes, footer hints, scrollback/logs |
| API/tRPC | Automation contract | N/A | Strict, typed | No `z.any()`, stable error envelopes |

## Required Design System

### Web
- Keep existing token vocabulary: `background`, `foreground`, `muted`, `border`, `card`, `primary`, semantic status colors.
- Use route headers, compact toolbars, segmented filters, data tables, detail drawers/split panes, inline forms, and status badges.
- Avoid landing-page tropes: no hero blocks, marketing copy, gradient blobs, decorative card grids, oversized iconography, or filler metrics.
- Every Phase 10 Web route needs keyboard focus order, labelled controls, empty/error/loading states, and axe coverage.

### CLI
- Default output: readable tables/lists with short labels.
- Automation output: `--json` on every new command, stable schemas, non-zero exits on actionable failure.
- Optional Phase 10 formatting: `--jq` and `--template` if migration plan chooses Commander/oclif path.
- No interactive-only workflow for org switching, billing, connector setup, task intake, or closure verification.

### TUI
- Keyboard-only navigation; no mouse-required action.
- Live panes for queues/connectors/billing/task intake/goals where useful.
- Status footer shows active org, backend, queue/EventBus adapter, and active command hints.
- Use plain text labels for status; color never carries meaning alone.
- `renderPlain` snapshots must remain useful for screen readers/tests.

## Huashu Critique Score Target

| Dimension | Web target | CLI target | TUI target |
|---|---:|---:|---:|
| Philosophy alignment | 8/10 | 8/10 | 8/10 |
| Visual/information hierarchy | 8/10 | 8/10 | 8/10 |
| Craft | 7/10 | 7/10 | 7/10 |
| Functionality | 8/10 | 9/10 | 8/10 |
| Originality/no-slop | 7/10 | 8/10 | 7/10 |

## Blocking Findings Converted To Gates

- Route source tests reject hero/marketing/orb/gradient decoration in Phase 10 Web routes.
- Web a11y tests cover organization, billing/quota, connector workflow designer, task intake, goals, reports, artifact attestation, and SaaS status pages.
- CLI snapshot tests assert default output and `--json` schemas for every new command family.
- TUI FakeTTY tests assert keyboard navigation, plain text rendering, and non-color-only status labels.
- API schema tests assert no public `z.any()` additions.

## Interface Parity Matrix

| Capability | Web | CLI | TUI | API/tRPC | Tests |
|---|---|---|---|---|---|
| Org/member management | Settings/admin | `orgs` commands | Organization screen | `orgs` router | Postgres + e2e/a11y |
| SaaS status | Status panels | `saas status --json` | SaaS status screen | status router | Postgres + snapshots |
| Billing/API quotas | Billing settings | `billing`, `quotas` | Quota panel | billing/quota routers | unit + integration |
| Slack/Discord/email intake | Connector settings + intake inbox | `connectors`, `intake` | Intake queue | connector/intake routers | webhook/interaction tests |
| Goals/OKRs | Goals tree/dashboard | `goals` JSON | Goals screen | goals router | service + e2e |
| Time/timesheets | Timesheet/report views | `time` commands | Timer/timesheet screen | time router | service + snapshot |
| Notification workflow | Rule designer | `notifications rules` | Rule list/detail | notification routers | delivery + UI tests |
| Artifact attestations | Artifact detail verify badge | `artifacts verify` | Artifact status | artifacts router | sigstore tests |
| Search/Q&A | Search page/Q&A panel | `search ask` | Search screen | search router | deterministic evals |

## Acceptance

- `10-13-PLAN.md` implements this UI spec through source tests, Playwright/a11y tests, CLI snapshots, and TUI FakeTTY tests.
- Phase 10 UAT records Huashu score evidence for Web, CLI, and TUI.
