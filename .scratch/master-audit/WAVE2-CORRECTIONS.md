# Wave 2 Corrections to Master Audit

> Generated: 2026-05-04 after 12 deep-dive agents

## Wave 1 Errors Corrected

| Item | Wave 1 Said | Wave 2 Found |
|------|------------|--------------|
| TipTap integration | MISSING | IMPLEMENTED — v3.22.5, DocEditor.svelte, slash menu, autosave |
| KaTeX extension | MISSING | IMPLEMENTED — embeds.ts math embed, slash menu entries |
| Mermaid extension | MISSING | IMPLEMENTED — sandboxed iframe, CDN mermaid@11 |
| Frontmatter form | NOT FOUND | IMPLEMENTED — Zod schemas per doc type, form + YAML toggle |
| svelte-dnd-action | UNUSED | WIRED — BoardColumn.svelte lazy-imports, use:dndzone directive |
| Inbox/feed page | MISSING | EXISTS — /inbox route with notifications + activity feed |
| Cmd+K palette | COMPONENT EXISTS | BUG — component exists but NO keyboard shortcut wired |
| CLI commands | SOME WORK | 12 FULLY FUNCTIONAL (docs, search, auth, flags, routing, repos, agents, db, symphony, skills, memory, init) |
| Artifact edges table | MISSING | IMPLEMENTED — Edge entity with bidirectional links |
| Artifact harvest pipeline | PARTIAL | FULLY IMPLEMENTED — checksums, MIME sniffing, storage, edges, search indexing |
| Notification fanout | PARTIAL | FULLY IMPLEMENTED — rule engine, quiet hours, delivery enqueueing |
| Playwright tests | ONLY IN WORKTREES | 10 e2e specs + 6 a11y tests ON MAIN |

## New Findings from Wave 2

### P0 — Event Divergence (ADV-01)
- MikroORM events use UUID PKs, product-kernel uses ULID PKs — same table
- Neither path publishes to EventBus → WebSocket subscriptions permanently dead
- Events table has mixed PK formats + incompatible columns

### P1 — Security Vulnerabilities
- ADV-05: Webhook secrets stored PLAINTEXT in column named `encrypted_secret`
- ADV-12: `agents.testProfile` spawns arbitrary binary from DB-stored cliPath

### P1 — Architecture (worse than Wave 1 found)
- ADV-02: CLI also imports from web (agent.ts, artifact.ts) — not just product-kernel
- ADV-03: ALTER TABLE runs in request handlers (updateTaskAction, ensureDocLinksCompatibility) → concurrent deadlocks
- ADV-04: Two complete task CRUDs with divergent schemas serving different callers
- ADV-08: Two separate Hono API implementations both claiming /api/v1
- ADV-09: PGlite opened per-request with migrations on every page load

### Symphony Conformance (3 PASS / 10 PARTIAL / 1 FAIL / 6 MISSING)
- FAIL: Continuation retry completely absent (core spec feature)
- MISSING: Dynamic config reload, per-state concurrency, token accounting, codex.command, startup cleanup, $VAR resolution
- PARTIAL: Issue model stripped (5/12 fields missing), stall detection incomplete, workspace safety check only on destroy not create

### Requirements Document Issues (from adversarial review)
- 15 vision done-criteria had no planning requirement → added
- Phase ordering violated vision dependency (SYM before SND) → fixed
- TDD in Phase 9 contradicted TDD-first constraint → TST-10 weaves TDD into every phase
- 3 duplicate requirements → consolidated
- "Three-surface parity" undefined → defined per-domain in TSK-14, DOC-12, REP-07, ART-06, SRC-09, NTF-09
- Missing requirements added: doc_comments, delivery handlers, quiet hours retry, audit logging, graceful shutdown, rate limiting

## Updated Counts

| Metric | Wave 1 | Wave 2 |
|--------|--------|--------|
| Requirements | 190 | 213 |
| Phases | 10 | 10 |
| Symphony conformance | "85% complete" | 3 PASS / 10 PARTIAL / 1 FAIL / 6 MISSING |
| Overall completion | ~55% | ~55% (but much more precisely measured) |
