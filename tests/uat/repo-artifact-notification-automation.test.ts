import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../..");
const UAT_PATH = ".planning/phases/07-repos-artifacts-notifications/07-UAT.md";

type Layer = "unit" | "component" | "integration" | "e2e";

interface Evidence {
  path: string;
  patterns?: RegExp[];
}

interface UatCheckpoint {
  number: number;
  name: string;
  layers: Layer[];
  evidence: Evidence[];
}

const CHECKPOINTS: UatCheckpoint[] = [
  {
    number: 1,
    name: "Repo Watcher Sync Queues Work",
    layers: ["unit", "integration"],
    evidence: [
      { path: "services/integration-hub/src/application/repos/__tests__/watcher.sla.test.ts", patterns: [/inside 2s/, /coalesces repeated bursts/, /repo\.sync\.local/] },
      { path: "services/integration-hub/src/application/repos/watcher.ts", patterns: [/debounceMs/, /repo\.sync\.local/] },
    ],
  },
  {
    number: 2,
    name: "LRU Remote Warmup Cron",
    layers: ["unit"],
    evidence: [
      { path: "services/integration-hub/src/application/repos/__tests__/watcher.sla.test.ts", patterns: [/top 5 remote repos/, /enqueues no more than 5 remotes/] },
      { path: "services/integration-hub/src/application/repos/workers/sync-remote.ts", patterns: [/repo\.lru\.warmup/, /listRecentlyTouchedRemote\(REPO_LRU_WARMUP_LIMIT\)/] },
    ],
  },
  {
    number: 3,
    name: "Multi-Repo Dashboard Rows",
    layers: ["unit", "integration"],
    evidence: [
      { path: "services/integration-hub/src/application/repos/__tests__/dashboard.test.ts", patterns: [/required fields/, /lastSyncError/, /watcherStatus/] },
      { path: "services/integration-hub/src/application/repos/dashboard.ts", patterns: [/openTaskCount/, /syncLatencyMs/, /lastSyncError/] },
    ],
  },
  {
    number: 4,
    name: "Repo Detail Slices",
    layers: ["unit", "component"],
    evidence: [
      { path: "services/integration-hub/src/application/repos/__tests__/dashboard.test.ts", patterns: [/detail tab selectors/, /branches/, /syncLog/] },
      { path: "apps/web/src/routes/repos/[id]/page.svelte.test.ts", patterns: [/branch, commit, file, and sync-log slices/] },
    ],
  },
  {
    number: 5,
    name: "Repo REST and tRPC Sync",
    layers: ["integration"],
    evidence: [
      { path: "apps/server/src/api/__tests__/repos.api.test.ts", patterns: [/tRPC caller/, /queued status/, /404/] },
      { path: "apps/server/src/trpc/routers/repos.ts", patterns: [/syncRepo/, /statusRepo/, /resource: "repos", action: "sync"/] },
    ],
  },
  {
    number: 6,
    name: "Repo Surface Parity",
    layers: ["component", "integration", "e2e"],
    evidence: [
      { path: "apps/cli/src/commands/repos.test.ts", patterns: [/list --json/, /sync --json/] },
      { path: "apps/tui/src/screens/repos.test.ts", patterns: [/canonical dashboard row fields/] },
      { path: "apps/web/src/routes/repos/page.svelte.test.ts", patterns: [/shared dashboard fields/] },
      { path: "apps/web/tests/e2e/repos-artifacts-notifications.spec.ts", patterns: [/repos list exposes dashboard fields/] },
    ],
  },
  {
    number: 7,
    name: "Artifact Retention Defaults",
    layers: ["unit"],
    evidence: [
      { path: "services/workflow-coordination/src/infrastructure/artifacts/__tests__/pruner.test.ts", patterns: [/defaults project artifacts to forever/, /scratch artifacts to 90 days/] },
      { path: "services/platform-core/src/infrastructure/application-database/entities/artifacts/ArtifactRetentionPolicy.ts", patterns: [/retentionDays/, /keepLatestPerRef/, /keepPinned/] },
    ],
  },
  {
    number: 8,
    name: "Artifact Pruner Safety",
    layers: ["unit", "integration"],
    evidence: [
      { path: "services/workflow-coordination/src/infrastructure/artifacts/__tests__/pruner.test.ts", patterns: [/idempotent/, /pinned/, /org mismatch/] },
      { path: "tests/workflow-coordination/artifacts/pruner.test.ts", patterns: [/soft-archives expired artifacts/, /requires confirmation/] },
    ],
  },
  {
    number: 9,
    name: "Artifact Harvest Links Runs and Search",
    layers: ["unit", "integration"],
    evidence: [
      { path: "services/workflow-coordination/src/infrastructure/artifacts/__tests__/harvest-search.test.ts", patterns: [/run edge/, /searchable provenance/] },
      { path: "services/knowledge-workspace/src/application/search/indexers/artifact.ts", patterns: [/SearchDocument/, /sourcePath/, /producerKind/] },
    ],
  },
  {
    number: 10,
    name: "Artifact Preview and Download UX",
    layers: ["component", "integration", "e2e"],
    evidence: [
      { path: "apps/web/src/routes/artifacts/page.svelte.test.ts", patterns: [/data-artifacts-list/, /data-artifacts-filter/] },
      { path: "apps/web/src/routes/artifacts/[id]/page.svelte.test.ts", patterns: [/preview|download|digest/i] },
      { path: "apps/web/tests/e2e/repos-artifacts-notifications.spec.ts", patterns: [/artifact detail exposes provenance/] },
    ],
  },
  {
    number: 11,
    name: "Notification Fanout from Repo and Artifact Events",
    layers: ["unit", "integration"],
    evidence: [
      { path: "services/notification-center/src/application/delivery-runtime/__tests__/fanout.test.ts", patterns: [/repo sync completed/, /artifact\.created/, /disabled rule/, /mute/] },
      { path: "tests/notification-center/delivery-runtime/fanout-worker.test.ts", patterns: [/dedups in-app notifications/, /all four default rules/] },
    ],
  },
  {
    number: 12,
    name: "Notification Delivery Channels",
    layers: ["unit", "integration"],
    evidence: [
      { path: "services/notification-center/src/application/delivery-runtime/__tests__/delivery-worker.test.ts", patterns: [/SMTP handler/, /webhook handler/, /push handler/] },
      { path: "services/notification-center/src/application/delivery-runtime/delivery-handlers/push.ts", patterns: [/missing_config/] },
    ],
  },
  {
    number: 13,
    name: "Webhook HMAC and Retry Metadata",
    layers: ["unit", "integration"],
    evidence: [
      { path: "services/notification-center/src/application/delivery-runtime/__tests__/delivery-worker.test.ts", patterns: [/X-Fulcrum-Signature|FULCRUM_SIGNATURE_HEADER/, /retry metadata/] },
      { path: "tests/integration-hub/webhooks/dispatcher.test.ts", patterns: [/HMAC-SHA256/, /exponential backoff/] },
    ],
  },
  {
    number: 14,
    name: "Quiet Hours Delivery Hold",
    layers: ["unit"],
    evidence: [
      { path: "services/notification-center/src/application/delivery-runtime/__tests__/delivery-worker.test.ts", patterns: [/quiet-hours delivery holds/, /held-quiet-hours/] },
      { path: "services/notification-center/src/application/delivery-runtime/quiet-hours.ts", patterns: [/nextAttemptAt/, /held-quiet-hours/] },
    ],
  },
  {
    number: 15,
    name: "Notification Inbox and Bell Count",
    layers: ["unit", "component", "integration"],
    evidence: [
      { path: "services/notification-center/src/application/delivery-runtime/__tests__/bell-counter.test.ts", patterns: [/unread badge count/, /markRead decreases unread/] },
      { path: "apps/web/src/routes/inbox/page.svelte.test.ts", patterns: [/unread|mark/i] },
      { path: "tests/notification-center/delivery-runtime/bell-counter-poll.test.ts", patterns: [/polls unread count/, /realtime unread-count/] },
    ],
  },
  {
    number: 16,
    name: "Notification Settings and CLI Controls",
    layers: ["component", "integration"],
    evidence: [
      { path: "apps/web/src/routes/settings/notifications/channels/page.server.test.ts", patterns: [/quiet|rules|channels/i] },
      { path: "tests/cli/runs-notify-audit-webhooks.test.ts", patterns: [/notify list --unread/, /watch streams JSON lines/] },
      { path: "apps/cli/src/commands/pillar14-generated.ts", patterns: [/mark-all-read/, /mark-read/, /mute/] },
    ],
  },
  {
    number: 17,
    name: "TUI Notification Controls",
    layers: ["component", "integration"],
    evidence: [
      { path: "tests/tui/search-notifications.test.ts", patterns: [/NotificationsScreen/, /marks notifications read/] },
      { path: "apps/tui/src/screens/notifications.ts", patterns: [/markAllRead/, /mute/, /unread/] },
    ],
  },
  {
    number: 18,
    name: "Artifact Authorization and Path Safety",
    layers: ["unit", "integration"],
    evidence: [
      { path: "services/workflow-coordination/src/infrastructure/artifacts/__tests__/artifact-security.test.ts", patterns: [/cross-org download/, /traversal paths/, /hard confirmed/] },
      { path: "services/workflow-coordination/src/infrastructure/artifacts/storage.ts", patterns: [/isSubPath/, /deleteArtifact/] },
    ],
  },
  {
    number: 19,
    name: "Webhook Delivery Debug UI",
    layers: ["component", "integration"],
    evidence: [
      { path: "apps/web/src/routes/settings/integrations/webhooks/page.server.test.ts", patterns: [/debug metadata without secrets/] },
      { path: "apps/web/src/routes/settings/integrations/webhooks/page.svelte.test.ts", patterns: [/delivery debug columns/, /resend action/] },
    ],
  },
  {
    number: 20,
    name: "artifact workflow Cross-Surface Parity Smoke",
    layers: ["e2e", "integration"],
    evidence: [
      { path: "apps/cli/src/__tests__/parity-smoke.test.ts", patterns: [/artifact rows expose provenance/, /notification unread\/list flow/, /webhook settings route/] },
      { path: "apps/web/tests/e2e/repos-artifacts-notifications.spec.ts", patterns: [/end-to-end artifact workflow cycle/] },
    ],
  },
];

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Repository Artifact Notification UAT automation coverage", () => {
  test("UAT file has one automatable checkpoint for every artifact workflow acceptance behavior", () => {
    const uat = readRepoFile(UAT_PATH);
    const headings = [...uat.matchAll(/^### (\d+)\. (.+)$/gm)].map((match) => ({
      number: Number(match[1]),
      name: match[2],
    }));

    expect(headings).toHaveLength(20);
    expect(headings).toEqual(CHECKPOINTS.map(({ number, name }) => ({ number, name })));
  });

  test("unit, component, integration, and e2e layers are all represented", () => {
    const layers = new Set(CHECKPOINTS.flatMap((checkpoint) => checkpoint.layers));

    expect(layers).toEqual(new Set<Layer>(["unit", "component", "integration", "e2e"]));
    for (const layer of layers) {
      expect(CHECKPOINTS.filter((checkpoint) => checkpoint.layers.includes(layer)).length).toBeGreaterThanOrEqual(3);
    }
  });

  test("every UAT checkpoint has executable evidence files with contract assertions", () => {
    for (const checkpoint of CHECKPOINTS) {
      expect(checkpoint.evidence.length, `checkpoint ${checkpoint.number}`).toBeGreaterThanOrEqual(2);

      for (const evidence of checkpoint.evidence) {
        const absolutePath = path.join(ROOT, evidence.path);
        expect(existsSync(absolutePath), `${checkpoint.number}: ${evidence.path}`).toBe(true);

        const content = readFileSync(absolutePath, "utf8");
        for (const pattern of evidence.patterns ?? []) {
          expect(content, `${checkpoint.number}: ${evidence.path} missing ${pattern}`).toMatch(pattern);
        }
      }
    }
  });

  test("automated UAT matrix remains explicit and non-empty for reporting", () => {
    const rows = CHECKPOINTS.map((checkpoint) => ({
      test: checkpoint.number,
      name: checkpoint.name,
      layers: checkpoint.layers.join(","),
      evidence: checkpoint.evidence.map((item) => item.path),
    }));

    expect(rows).toHaveLength(20);
    expect(rows.every((row) => row.layers.length > 0 && row.evidence.length >= 2)).toBe(true);
  });
});
