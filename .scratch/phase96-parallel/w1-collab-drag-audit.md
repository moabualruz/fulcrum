# Phase 9.6 W1 Collaboration And Drag Audit

Date: 2026-05-17
Mode: read-only focused audit, except this report file.

## Sources Of Truth

- `.planning/phases/09.6-product-workflow-completeness-human-agent-journeys/09.6-CORRECT-RESTART-COPY-FIRST-WORKFLOW-PLAN.md`
- `.planning/phases/09.6-product-workflow-completeness-human-agent-journeys/09.6-COPY-FIRST-GOAL-TRACKER.md`
- `docs/superpowers/plans/2026-05-15-mikroorm-to-typeorm-migration.md`
- `docs/superpowers/specs/2026-05-15-mikroorm-to-typeorm-migration-design.md`

## Required W1 Closure Evidence

The tracker says W1 is still blocked by:

- real-time Yjs collaboration evidence
- drag-reorder evidence

The ORM/Nest migration docs say stack migration is currently verified, but final Phase 9.6 gates must wait for remaining product workflow blockers. They do not close W1 collaboration/drag behavior.

## Existing Collaboration Implementation

- `apps/web/src/routes/docs/[id]/edit/+page.svelte`
  - imports `PresenceAvatars`, `CursorOverlay`, `isCollabEnabled`, `createBellWebSocket`, and collab provider types.
  - gates presence/cursors behind `real-time-collab-server`.
  - creates a provider via `createCollabProvider({ docId: data.doc.id, user })`.
  - renders `DocEditor`, not a Yjs-bound editor.
  - does not pass a Y.Doc, provider, awareness, or Collaboration extension into the editor.

- `apps/web/src/lib/collab/provider-factory.ts`
  - returns `MockCollabProvider` when feature flag is off.
  - attempts dynamic imports of `@hocuspocus/provider` and `yjs` when flag is on.
  - falls back to mock provider when `@hocuspocus/provider` is absent.

- `apps/web/src/lib/collab/PresenceAvatars.svelte`
  - renders presence avatars from provider state.

- `apps/web/src/lib/collab/CursorOverlay.svelte`
  - renders cursor badges from provider state.

- `services/knowledge-workspace/src/application/docs/collaboration/*`
  - includes provider config, feature guard, Hocuspocus config/persistence adapter, and Bun WS room manager.

- `apps/server/src/runtime/yjs-server.ts`
  - creates a Yjs WebSocket handler, persists `YjsSnapshot`, loads snapshots, and exports standalone startup.

- `apps/web/src/lib/components/tasks/CollaborativeEditor.svelte`
  - has a real Tiptap/Yjs collaborative editor path, but it is task-oriented and is not used by docs edit route.

## Existing Collaboration Proof

- `apps/web/src/lib/collab/collab.test.ts`
  - proves feature flag parsing, mock presence/cursors, and provider fallback.
  - explicitly says "No real Hocuspocus/Yjs deps -- all mock-based."

- `services/knowledge-workspace/src/application/docs/collaboration/collab-provider-factory.test.ts`
  - proves configuration output for Yjs doc/provider names and awareness config.

- `services/knowledge-workspace/src/application/docs/collaboration/hocuspocus-server.test.ts`
  - proves config and persistence adapter serialization helpers.

- `services/knowledge-workspace/src/application/docs/collaboration/bun-ws-collab-server.test.ts`
  - proves room manager behavior.

- `apps/server/src/runtime/yjs-server.test.ts`
  - attempts server proof, but current focused run fails in persistence because the test mock omits `em.save`.

Focused command:

```bash
bun test apps/web/src/lib/collab/collab.test.ts apps/web/src/lib/components/docs/doc-tree.test.ts apps/web/src/lib/components/docs/TiptapEditor.svelte.test.ts 'apps/web/src/routes/docs/[id]/edit/page.svelte.test.ts' services/knowledge-workspace/src/application/docs/collaboration/collab-provider-factory.test.ts services/knowledge-workspace/src/application/docs/collaboration/hocuspocus-server.test.ts services/knowledge-workspace/src/application/docs/collaboration/bun-ws-collab-server.test.ts apps/server/src/runtime/yjs-server.test.ts --test-name-pattern 'collab|Yjs|Hocuspocus|dnd|move|TiptapEditor|edit'
```

Result: 44 pass, 2 fail.

Failures:

- `apps/server/src/runtime/yjs-server.test.ts`: `TypeError: em.save is not a function`.
- `apps/web/src/routes/docs/[id]/edit/page.svelte.test.ts`: cannot find package `svelte-tiptap` from `DocEditor.svelte`.

Collaboration gap:

- No passing proof that two docs editor clients converge through Yjs.
- No passing proof that docs editor content is bound to a Y.Doc/Tiptap Collaboration extension.
- No production dependency in `package.json` for `@hocuspocus/provider`, `@hocuspocus/server`, `y-websocket`, `y-prosemirror`, or `svelte-tiptap`; `package.json` currently lists only `yjs`.
- `bun.lock` contains stale/indirect entries for some collab/DnD packages, but `package.json` is the source of install truth.

## Existing Drag-Reorder Implementation

- `apps/web/src/lib/components/docs/DocsSidebar.svelte`
  - imports `svelte-dnd-action`.
  - flattens the tree for DnD.
  - handles `onconsider` and `onfinalize`.
  - calls `onUpdatePosition(id, parentId, sortPosition)` for every item after finalize.
  - renders a visible drag handle.

- `apps/web/src/lib/components/docs/doc-tree.ts`
  - builds/sorts/flattens doc trees.
  - has `buildMoveInput()` and `midpoint()` helper for move payloads.

## Existing Drag-Reorder Proof

- `apps/web/src/lib/components/docs/doc-tree.test.ts`
  - proves `buildMoveInput()` produces midpoint sort position for one reparent move.

Drag-reorder gap:

- `DocsSidebar.svelte` is not used by the `/docs` hub; `/docs` renders `DocTree.svelte`, which is static.
- No route passes `onUpdatePosition` into `DocsSidebar`.
- No public document API/client/store method exists for doc move/reorder.
- `apps/web/src/routes/docs/+page.server.ts` currently maps every doc to `parentId: null` and `sortPosition: 0`, so real parent/sort data is lost before tree rendering.
- `package.json` does not declare `svelte-dnd-action`, even though `DocsSidebar.svelte` imports it.
- No component test dispatches a DnD finalize event and asserts `onUpdatePosition` calls.
- No server/API test proves persistence of changed parent/sort position.

## Smallest Non-Overlapping Slice To Close W1

Slice A: docs real-time collaboration proof.

- Add/install exact runtime deps needed by the selected path: either `@hocuspocus/provider` + matching server package, or `y-websocket` + `y-prosemirror`/Tiptap collaboration packages if the existing task editor path is reused.
- Prefer adapting the existing task `CollaborativeEditor.svelte` behavior into a docs editor component instead of adding a second collab model.
- Wire `/docs/[id]/edit` body editor to Yjs-backed Tiptap collaboration when `real-time-collab-server` is enabled.
- Add a focused test that creates two Yjs docs/providers or a local server-backed pair, edits one, and asserts the other receives the same content.
- Fix `apps/server/src/runtime/yjs-server.test.ts` mock to match TypeORM `EntityManager.save()` or move the persistence proof to a real TypeORM/PGlite integration test.

Slice B: docs drag-reorder persistence.

- Add `svelte-dnd-action` to `package.json` if retaining `DocsSidebar.svelte`.
- Preserve document `parentId` and sort position from the public docs API through `/docs/+page.server.ts`.
- Add a thin public API/client/store move method, for example `docs.move({ id, parentId, sortPosition })`, backed by the existing TypeORM document store.
- Render `DocsSidebar.svelte` or move its DnD behavior into the currently rendered `DocTree.svelte`, not both.
- Add a focused component test for finalize -> `onUpdatePosition`.
- Add a route/API/store test proving the persisted parent/sort change changes the rendered order.

Non-overlap:

- Collaboration slice touches editor/collab/server-runtime tests only.
- Drag slice touches docs tree route/component/API/store tests only.
- Do not mix these with W8/W9 PM surface or TypeORM migration cleanup.

## Audit Verdict

W1 is not closed. There is collaboration scaffolding and drag UI scaffolding, but no current passing evidence for real docs Yjs collaboration or persisted docs drag-reorder. The smallest closure path is two focused slices: first make docs editor Yjs sync real and tested, then make docs tree reorder persisted and tested.
