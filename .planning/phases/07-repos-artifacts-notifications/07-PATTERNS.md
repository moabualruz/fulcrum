# Phase 07: repos-artifacts-notifications - Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 30 (new/modified)
**Analogs found:** 9 / 30 (strong matches by role+flow; remaining map to closest same-domain references)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/repos/watcher.ts` | service | file-I/O | `src/repos/watcher.ts` (self, existing baseline) | exact |
| `src/repos/register.ts` | service | file-I/O | `src/repos/watcher.ts` | role-match |
| `src/repos/workers/sync-local.ts` | service | event-driven | `src/repos/workers/sync-remote.ts` | exact |
| `src/repos/workers/sync-remote.ts` | service | event-driven | `src/repos/workers/sync-remote.ts` | exact |
| `src/search/indexers/repo.ts` | service | transform | `src/repos/watcher.ts` | role-match |
| `src/artifacts/harvest.ts` | service | event-driven | `src/artifacts/worker.ts` | exact |
| `src/artifacts/storage.ts` | service | file-I/O | `src/artifacts/harvest.ts` | role-match |
| `src/artifacts/pruner.ts` | service | file-I/O | `src/artifacts/pruner.ts` | exact |
| `src/artifacts/manual-upload.ts` | controller | request-response | `src/artifacts/harvest.ts` | role-match |
| `src/artifacts/preview-download.ts` | controller | request-response | `src/artifacts/storage.ts` | role-match |
| `src/artifacts/worker.ts` | service | event-driven | `src/artifacts/worker.ts` | exact |
| `src/orchestration/artifact-harvest-hook.ts` | middleware | event-driven | `src/repos/watcher.ts` | role-match |
| `src/search/indexers/artifact.ts` | service | transform | `src/search/indexers/repo.ts` | role-match |
| `src/trpc/routers/repos.ts` | route | request-response | `src/trpc/routers/artifacts.ts` | role-match |
| `src/trpc/routers/artifacts.ts` | route | request-response | `src/trpc/routers/notifications.ts` | role-match |
| `src/trpc/schemas/artifacts.ts` | model | request-response | `src/trpc/schemas/notifications.ts` | role-match |
| `src/notifications/rule-engine.ts` | service | event-driven | `src/notifications/fanout-worker.ts` | exact |
| `src/notifications/fanout-worker.ts` | service | event-driven | `src/notifications/fanout-worker.ts` | exact |
| `src/notifications/realtime-bell.ts` | service | request-response | `src/notifications/realtime-bell.ts` | exact |
| `src/notifications/bell-counter-poll.ts` | service | event-driven | `src/notifications/realtime-bell.ts` | role-match |
| `src/notifications/defaults.ts` | model | request-response | `src/notifications/rule-engine.ts` | role-match |
| `src/notifications/release-retention.ts` | service | batch | `src/notifications/rule-engine.ts` | role-match |
| `src/webhooks/dispatcher.ts` | service | event-driven | `src/webhooks/dispatcher.ts` | exact |
| `src/trpc/routers/notifications.ts` | route | request-response | `src/trpc/routers/webhooks.ts` | role-match |
| `src/trpc/routers/webhooks.ts` | route | request-response | `src/trpc/routers/notifications.ts` | role-match |
| `src/trpc/schemas/notifications.ts` | model | request-response | `src/trpc/schemas/webhooks.ts` | exact |
| `src/trpc/schemas/webhooks.ts` | model | request-response | `src/trpc/schemas/notifications.ts` | exact |
| `src/api/routes/repos.ts` | route | request-response | `src/api/routes/artifacts.ts` | role-match |
| `src/api/routes/artifacts.ts` | route | request-response | `src/api/routes/repos.ts` | role-match |
| `src/api/routes/notifications.ts` | route | request-response | `src/api/routes/artifacts.ts` | role-match |
| `src/cli/commands/repos.ts` | utility | request-response | `src/cli/commands/pillar14-generated.ts` | role-match |
| `src/cli/artifacts.ts` | utility | request-response | `src/cli/commands/repos.ts` | role-match |
| `src/cli/generated/artifacts.ts` | utility | request-response | `src/cli/generated/notify.ts` | exact |
| `src/cli/generated/notify.ts` | utility | request-response | `src/cli/commands/pillar14-generated.ts` | exact |
| `src/cli/notify.ts` | utility | request-response | `src/cli/artifacts.ts` | role-match |
| `src/cli/commands/pillar14-generated.ts` | utility | request-response | `src/cli/generated/notify.ts` | role-match |
| `src/tui/screens/repos.ts` | component | request-response | `src/tui/screens/artifacts.ts` | role-match |
| `src/tui/screens/artifacts.ts` | component | CRUD | `src/tui/screens/repos.ts` | role-match |
| `src/tui/screens/notifications.ts` | component | request-response | `src/tui/screens/artifacts.ts` | role-match |
| `src/tui/screens/notification-rules.ts` | component | request-response | `src/tui/screens/notifications.ts` | role-match |
| `src/web/src/routes/settings/notifications/+page.server.ts` | component | request-response | `src/web/src/routes/settings/notifications/channels/+page.server.ts` | role-match |
| `src/web/src/routes/settings/notifications/+page.svelte` | component | request-response | `src/web/src/routes/settings/notifications/channels/+page.svelte` | role-match |
| `src/web/src/routes/settings/notifications/channels/+page.server.ts` | component | request-response | `src/web/src/routes/settings/notifications/+page.server.ts` | role-match |
| `src/web/src/routes/settings/notifications/channels/+page.svelte` | component | request-response | `src/web/src/routes/settings/notifications/+page.svelte` | role-match |
| `src/web/src/routes/settings/integrations/webhooks/+page.server.ts` | component | request-response | `src/web/src/routes/settings/notifications/channels/+page.server.ts` | role-match |
| `src/web/src/routes/settings/integrations/webhooks/+page.svelte` | component | request-response | `src/web/src/routes/settings/notifications/channels/+page.svelte` | role-match |

## Pattern Assignments

### `src/repos/watcher.ts` (service, file-I/O)

**Analog:** `src/repos/watcher.ts` (existing implementation)

**Imports pattern** (lines 1-10):
```ts
import { watch } from 'fs';
import { join } from 'path';
import { createTaskQueue, QueueJob } from '../queue';
```

**Core event-driven pattern** (lines 18-60):
```ts
watch(projectPath, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  queue.enqueue({ type: 'repo-change', payload: { projectPath, filename, eventType } });
});
```

**Error handling pattern** (lines 60-76):
```ts
try {
  ...
} catch (err) {
  logger.error({ err, projectPath }, 'failed to register repo watcher');
}
```

### `src/repos/workers/sync-remote.ts` (service, event-driven)

**Analog:** `src/repos/workers/sync-remote.ts`

**Imports pattern** (lines 1-12):
```ts
import { z } from 'zod';
import { defineTask, defineQueue } from '../queue';
import { syncRepoFromRemote } from './sync-local';
```

**Core processing pattern** (lines 20-90):
```ts
export const syncRemoteTask = defineTask({
  name: 'repos-sync-remote',
  schema: z.object({ repoId: z.string() }),
  async handler(input) {
    const { repoId } = input;
    await syncRepoFromRemote(repoId);
  },
});
```

**Queue registration pattern** (lines 90-110):
```ts
defineQueue('repos-sync-remote', syncRemoteTask);
```

### `src/artifacts/worker.ts` (service, event-driven)

**Analog:** `src/artifacts/worker.ts`

**Imports pattern** (lines 1-12):
```ts
import { z } from 'zod';
import { defineTask, defineQueue } from '../queue';
import { harvestArtifact } from './harvest';
```

**Core CRON+task pattern** (lines 14-70):
```ts
export const artifactWorkerTask = defineTask({
  name: 'artifacts-harvest',
  schema: z.object({ repoId: z.string(), artifactPath: z.string() }),
  async handler(input) {
    await harvestArtifact(input.repoId, input.artifactPath);
  },
});

defineQueue('artifacts-harvest', artifactWorkerTask);
```

**Error handling pattern** (lines 70-84):
```ts
catch (err) {
  logger.error({ err, job: input }, 'artifact harvest failed');
  throw err;
}
```

### `src/notifications/fanout-worker.ts` (service, event-driven)

**Analog:** `src/notifications/fanout-worker.ts`

**Imports pattern** (lines 1-12):
```ts
import { defineTask, defineQueue } from '../queue';
import { dispatchWebhookEvent } from '../webhooks/dispatcher';
import { selectDeliveryChannels, markUnread } from './rule-engine';
```

**Core fanout pattern** (lines 24-92):
```ts
export const fanoutWorker = defineTask({
  name: 'notifications-fanout',
  async handler(event) {
    const targets = await selectDeliveryChannels(event);
    for (const t of targets) {
      await markUnread(t);
      await queue.enqueue({ type: `notify-deliver-${t.channel}`, payload: t });
    }
  },
});
```

**Quiet-hours/retry pattern** (lines 92-130):
```ts
if (isQuietHours(targets.channel, targets.userId)) {
  await scheduleForWindow(targets.nextWindowStart);
  return;
}
```

### `src/webhooks/dispatcher.ts` (service, event-driven)

**Analog:** `src/webhooks/dispatcher.ts`

**Imports pattern** (lines 1-16):
```ts
import { createHmac, timingSafeEqual } from 'crypto';
import { fetchWithRetry } from '../http';
import { WebhookDeliveryStatus } from '@fulcrum/db';
```

**Core dispatch pattern** (lines 25-78):
```ts
export async function dispatchWebhook(url: string, secret: string, payload: unknown) {
  const signature = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  const res = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'x-webhook-signature': signature },
    body: JSON.stringify(payload),
  });
  return res.status;
}
```

**Error/retry pattern** (lines 78-116):
```ts
if (!res.ok) {
  throw new Error(`webhook dispatch failed: ${res.status}`);
}
```

### `src/cli/commands/repos.ts` (utility, request-response)

**Analog:** `src/cli/commands/pillar14-generated.ts`

**Imports pattern** (lines 1-14):
```ts
import { createCaller } from '../../server/trpc';
import { logger } from '../logger';
import { outputJson, outputText } from '../output';
```

**Call + format pattern** (lines 42-90):
```ts
const caller = await createCaller(session);
const result = await caller.repos.sync(input);
if (opts.json) outputJson(result);
else outputText(formatRepos(result));
```

### `src/cli/generated/notify.ts` (utility, request-response)

**Analog:** `src/cli/generated/notify.ts` (baseline)

**Imports pattern** (lines 1-18):
```ts
import { parse } from 'smol-toml';
import { z } from 'zod';
import { createCaller } from '../../server/trpc';
```

**Command skeleton pattern** (lines 20-55):
```ts
export function registerNotifyCommands(program) {
  const cmd = program.command('notify').description('notification ops');
  cmd.command('list').action(() => {});
  cmd.command('rules').action(() => {});
}
```

### `src/tui/screens/artifacts.ts` (component, CRUD)

**Analog:** `src/tui/screens/artifacts.ts`

**Imports pattern** (lines 1-20):
```ts
import type { Screen } from './types';
import { getCaller } from './client';
```

**Caller + async load pattern** (lines 25-72):
```ts
const caller = await getCaller();
const artifacts = await caller.artifacts.list(query);
for (const a of artifacts.items) {
  ...
}
```

**Action pattern** (lines 72-130):
```ts
if (selection) {
  await caller.artifacts.archive({ id: selection.id });
}
```

### `src/web/src/routes/settings/notifications/channels/+page.server.ts` (component, request-response)

**Analog:** `src/web/src/routes/settings/notifications/+page.server.ts`

**Imports pattern** (lines 1-14):
```ts
import { error } from '@sveltejs/kit';
import { createAction } from '$lib/server/actions';
```

**Load + mutation pattern** (lines 20-70):
```ts
export const load = async () => {
  return { channels: await getChannels(), csrf: ... };
};

export const actions = {
  default: createAction(async ({ request }) => {
    const form = await request.formData();
    await updateNotificationChannels(form);
  }),
};
```

### `src/trpc/routers/notifications.ts` (route, request-response)

**Analog:** `src/trpc/routers/webhooks.ts`

**Imports pattern** (lines 1-16):
```ts
import { z } from 'zod';
import { protectedProcedure, createRouter } from '../procedures';
import { listNotificationsSchema } from '../schemas/notifications';
```

**Procedure pattern** (lines 20-120):
```ts
export const notificationsRouter = createRouter({
  list: protectedProcedure.input(listNotificationsSchema).query(async ({ ctx, input }) => {
    return listNotificationsForUser(ctx.user.id, input);
  }),
  markRead: protectedProcedure.input(markReadSchema).mutation(async ({ ctx, input }) => {
    return markNotificationsRead(ctx.user.id, input.ids);
  }),
});
```

### `src/trpc/routers/artifacts.ts` (route, request-response)

**Analog:** `src/trpc/routers/notifications.ts`

**Imports pattern** (lines 1-18):
```ts
import { z } from 'zod';
import { protectedProcedure, createRouter } from '../procedures';
import { listArtifactsSchema, harvestArtifactSchema } from '../schemas/artifacts';
```

**CRUD pattern** (lines 20-110):
```ts
export const artifactsRouter = createRouter({
  list: protectedProcedure.input(listArtifactsSchema).query(async ({ ctx, input }) => {
    return listArtifacts(ctx.user.id, input);
  }),
  harvest: protectedProcedure.input(harvestArtifactSchema).mutation(async ({ ctx, input }) => {
    return queueHarvest(input.repoId, input.artifactPath, ctx.user.id);
  }),
});
```

### `src/api/routes/repos.ts` (route, request-response)

**Analog:** `src/api/routes/artifacts.ts`

**Imports pattern** (lines 1-12):
```ts
import { Hono } from 'hono';
import { zodValidator } from '@hono/zod-validator';
import { withAuth } from '../../middleware/auth';
```

**Mounting/stub pattern** (lines 1-38):
```ts
const app = new Hono();
app.get('/', withAuth, zodValidator('json', repoListSchema), async (c) => {...});
export const reposApi = app;
```

## Shared Patterns

### Worker + Queue pattern
**Sources:** `src/repos/workers/sync-remote.ts`, `src/artifacts/worker.ts`
**Apply to:** repos sync workers, artifact workers, notification fanout
```ts
export const task = defineTask({ name: 'x', schema: z.object({...}), async handler(input) { ... } });
defineQueue('x', task);
```

### Feature gating + error surfacing
**Source:** `src/trpc/routers/webhooks.ts`
**Apply to:** API/TUI/CLI routes touching repos/artifacts/notifications
```ts
if (!isFeatureEnabled(ctx, 'feature-name')) {
  throw new ForbiddenError('Feature disabled');
}
```

### Quiet-hours / deferred notification pattern
**Source:** `src/notifications/fanout-worker.ts`
**Apply to:** notification delivery paths
```ts
if (isQuietHours(channel, userId)) {
  await markDelayedAndRetry(channel, userId);
  return;
}
```

### CLI caller + output pattern
**Source:** `src/cli/commands/repos.ts`, `src/cli/artifacts.ts`
**Apply to:** notify/webhook/repo/artifact command families
```ts
const caller = await createCaller(session);
const result = await caller.<domain>.<op>(input);
opts.json ? outputJson(result) : outputText(formatResult(result));
```

### Route/controller validation pattern
**Source:** `src/trpc/routers/notifications.ts`, `src/trpc/schemas/notifications.ts`
**Apply to:** tRPC and Hono routers across phase
```ts
protectedProcedure.input(z.object({ ... })).query|mutation(async ({ input, ctx }) => { ... });
```

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/notifications/release-retention.ts` | service | batch | No dedicated retention worker/service with same semantics exists outside notifications area; use `notifications/fanout-worker.ts` + release-related stubs as template only. |
| `src/web/src/routes/settings/integrations/webhooks/+page.svelte` | component | request-response | Current webhooks settings page is effectively stub/in-memory only; no full parity page for implementation path. |

## Metadata

**Pattern search scope:** `src/repos`, `src/artifacts`, `src/notifications`, `src/webhooks`, `src/trpc`, `src/api`, `src/cli`, `src/tui`, `src/web/src/routes/settings`
**Files scanned:** 30 target files + reference analog set
**Pattern extraction date:** 2026-05-05
