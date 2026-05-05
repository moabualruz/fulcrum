# Phase 8: Surface Delivery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-06  
**Phase:** 8-Surface Delivery  
**Areas discussed:** Surface parity contract, CLI JSON/completion, TUI OpenTUI rewrite, Web completion/UAT, REST/API validation and rate limiting

---

## Surface Parity Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Maximum feature parity | Every domain capability exposed through Web/CLI/TUI and REST where applicable, with surface-native UX. | ✓ |
| Web-first only | Complete Web and leave CLI/TUI/API as minimal wrappers. | |
| Generated stubs acceptable | Keep generated placeholders where backend exists but surface UX is thin. | |

**User's choice:** Auto-selected maximum feature parity per request: "Make sure maximum feature parity in all interfaces as much as possible."  
**Notes:** Parity means capability-equivalent, not identical UI.

---

## CLI JSON/Completion

| Option | Description | Selected |
|--------|-------------|----------|
| Keep existing Bun CLI and wire all commands | Complete current command architecture through tRPC/local caller. | ✓ |
| Migrate to oclif/Clipanion/Commander | Adopt a full CLI framework before wiring commands. | |
| Only generated command scaffold | Keep generated files as placeholders. | |

**User's choice:** Auto-selected existing Bun CLI wiring to minimize scope and preserve binary architecture.  
**Notes:** GitHub CLI/Linear patterns inform JSON/completion behavior.

---

## TUI OpenTUI Rewrite

| Option | Description | Selected |
|--------|-------------|----------|
| Gate OpenTUI first, then rewrite | Install/prove `@opentui/core` + JSX binding before large rewrite. | ✓ |
| Rewrite blindly on OpenTUI | Adopt OpenTUI immediately despite upstream maturity risk. | |
| Keep ANSI TUI | Avoid OpenTUI and only fill existing screens. | |

**User's choice:** Auto-selected gate-first OpenTUI rewrite.  
**Notes:** `@opentui/core@0.2.2` + `@opentui/solid@0.2.2` preferred; stop for fallback if gate fails.

---

## Web Completion/UAT

| Option | Description | Selected |
|--------|-------------|----------|
| Verify and complete existing routes | Route render gate + 14 Playwright journeys + prior phase regression coverage. | ✓ |
| Redesign Web UX | Rework page design during surface delivery. | |
| Only unit tests | Skip end-to-end journey coverage. | |

**User's choice:** Auto-selected completion/verification, not redesign.  
**Notes:** Existing shadcn-svelte/Bits UI route/component structure remains source of truth.

---

## REST/API Validation + Rate Limits

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Hono + zod-openapi and replace stubs | Extend current API with real route wiring, OpenAPI path tests, Zod validation tests, local rate limiter. | ✓ |
| Replace API framework | Introduce another API/OpenAPI framework. | |
| Leave stubs behind OpenAPI | Document routes before real handlers. | |

**User's choice:** Auto-selected existing Hono path and real route replacement.  
**Notes:** Rate limit semantics copied from Sentry/Jira identity-keyed operational model.

---

## the agent's Discretion

- Exact parity matrix artifact format.
- CLI human output formatting.
- Exact OpenTUI layout after renderer gate.
- Exact rate-limit defaults.

## Deferred Ideas

- CLI framework migration.
- CLI `--jq`/`--template`.
- Web redesign.
- Hosted API gateway/tier billing.
