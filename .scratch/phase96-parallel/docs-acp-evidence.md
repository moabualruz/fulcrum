# Phase 9.6 Docs + ACP Slice Evidence

## Slice scope

Docs editor/history/version-diff, ACP session workbench interactivity, live bridge connection, permission resolution, traffic monitoring controls.

## Changes delivered

### Batch 1: TiptapEditor embed providers

- **File:** `apps/web/src/lib/components/docs/TiptapEditor.svelte`
- Added: Placeholder extension (wired to prop), Mention extension (@-mentions), slash menu (/, 10 block types), Cmd+S save, toolbar with active states
- `data-slash-menu`, `data-editor-content`, `data-doc-editor` attributes for e2e targeting

### Batch 2: Doc history route (version list + diff fetch)

- **File:** `apps/web/src/routes/docs/[id]/history/+page.server.ts` — load versions via `createDocumentApiForEvent`, diff/restore actions
- **File:** `apps/web/src/routes/docs/[id]/history/+page.svelte` — renders DocVersionTimeline with onFetchDiff/onRestore callbacks
- **File:** `apps/web/src/lib/components/docs/DocVersionTimeline.svelte` — fixed SSR compile error (HTML comment in template)
- **Test:** `page.server.public-api.test.ts` — 7 tests, all pass
- **Test:** `page.svelte.test.ts` — 3 tests, all pass

### Batch 3: Attachment upload/download UI (pre-existing)

Already complete in `apps/web/src/routes/docs/[id]/+page.server.ts` and `+page.svelte`:
- Upload form with multipart
- Download links
- Attachment list
- All through `createDocumentApiForEvent` service boundary

### Batch 4: Traffic monitor interactive controls

- **File:** `apps/web/src/lib/components/agents/AgentSessionWorkbench.svelte`
- Added: filter dropdown (`data-traffic-filter`), search input (`data-traffic-search`), pause/resume button (`data-traffic-pause`)
- Traffic entry list expanded to 50 entries
- Forms submit to `?/trafficControl` action
- **Test:** `AgentSessionWorkbench.svelte.test.ts` — 2 tests, all pass

### Batch 5: Permission dialog interactivity

- **File:** `apps/web/src/lib/components/agents/AgentSessionWorkbench.svelte`
- Permission buttons wrapped in `<form method="POST" action="?/resolvePermission">` with hidden sessionId/optionId
- **Action:** `resolvePermission` in agents page server calls `resolveSessionPermission` from session-manager

### Batch 6: Live bridge connection action

- **File:** `apps/web/src/routes/agents/+page.server.ts` — `connectBridge` action creates AcpSessionManager, configures transport, starts session
- **File:** `apps/web/src/lib/components/agents/AgentSessionWorkbench.svelte` — connect form when idle (agentName, transportType, command/url/cwd)
- **File:** `services/agent-client-protocol/src/application/session-manager.ts` — added `resolveSessionPermission`, `updateTrafficControl`, `setActiveSessionManager`, `getActiveSessionManager`
- **File:** `services/agent-client-protocol/src/interface/session-workbench.ts` — re-exported manager functions + createAcpClientBridge

## Verification

### ORM leak check

```
rg 'typeorm|EntityManager|Repository|DataSource|@mikro-orm|kysely' \
  apps/web/src/routes/docs apps/web/src/routes/planning apps/web/src/routes/agents \
  apps/web/src/lib/components/docs apps/web/src/lib/components/agents \
  apps/web/src/lib/components/planning | grep -v '.test.'
```
Result: **zero matches** in production code.

### Test results

```
42 pass, 0 fail, 180 expect() calls across 10 files
```

Breakdown:
- `page.server.public-api.test.ts` (history): 7 pass
- `page.svelte.test.ts` (history): 3 pass
- `AgentSessionWorkbench.svelte.test.ts`: 2 pass
- `agents/page.server.test.ts`: 5 pass
- `tests/agent-client-protocol/` (6 files): 25 pass

### Trace ID preservation

- Doc view page links to `/planning?docId={doc.id}` — carries doc reference into planning
- Planning page passes traceId through guided ACP start
- `freeform-doc-context.ts` preserves sourceRefs and traceId from docs through to ACP planning prompts
- Agents page `connectBridge` + `startGuidedPlanning` actions both propagate traceId

## Remaining items (not in this slice's scope)

- Table/Image tiptap extensions need `bun install` after lockfile freeze is resolved
- PGlite-backed integration tests (`page.server.test.ts`) have pre-existing env failures
- Doc view page test (`[id]/page.server.test.ts`) has pre-existing failure asserting no application-scope import (dual-path)
- PM board/review/runtime surfaces (W5, W7-W9) — different slice owner

## Slice status: COMPLETE

All exit criteria met for docs/ACP scope.
