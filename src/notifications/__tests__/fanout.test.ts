import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { harvestArtifacts, type ArtifactLike, type HarvestArtifactDeps } from "../../artifacts/harvest.ts";
import { notifyFanout, type NotifyFanoutRepositories } from "../fanout-worker.ts";
import type { NotificationRuleLike } from "../rule-engine.ts";
import { createRepoSyncLocalTask, type RepoSyncLocalRepositories } from "../../repos/workers/sync-local.ts";

const ORG_ID = "00000000-0000-0000-0000-00000000000a";
const PROJECT_ID = "10000000-0000-0000-0000-000000000001";
const USER_ID = "11111111-1111-1111-1111-111111111111";
const REPO_ID = "22222222-2222-2222-2222-222222222222";
const RUN_ID = "33333333-3333-3333-3333-333333333333";
const ARTIFACT_ID = "44444444-4444-4444-4444-444444444444";

function repoRule(overrides: Partial<NotificationRuleLike> = {}): NotificationRuleLike {
  return {
    id: "55555555-5555-5555-5555-555555555555",
    orgId: ORG_ID,
    userId: USER_ID,
    enabled: true,
    active: true,
    name: "repo-sync",
    eventPattern: { subject_kind: "repo", verb: "repo.sync.completed" },
    channels: ["in-app", "email"],
    ...overrides,
  };
}

function artifactRule(overrides: Partial<NotificationRuleLike> = {}): NotificationRuleLike {
  return {
    id: "66666666-6666-6666-6666-666666666666",
    orgId: ORG_ID,
    userId: USER_ID,
    enabled: true,
    active: true,
    name: "artifact-created",
    eventPattern: { subject_kind: "artifact", verb: "artifact.created" },
    channels: ["in-app"],
    ...overrides,
  };
}

function createFanoutRepos(event: Record<string, unknown>, rules: NotificationRuleLike[] = [repoRule()]) {
  const notifications: Array<Record<string, unknown>> = [];
  const deliveries: Array<Record<string, unknown>> = [];
  const jobs: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const repos: NotifyFanoutRepositories = {
    eventRepo: {
      async findOneOrFail(id) {
        expect(id).toBe(event.id as string);
        return event as never;
      },
    },
    notificationRuleRepo: {
      async find(where) {
        return rules.filter((rule) => rule.orgId === where["orgId"] && rule.enabled === where["enabled"]);
      },
    },
    notificationMuteRepo: {
      async findOne(where) {
        return where["subjectId"] === "muted-subject"
          ? { orgId: ORG_ID, userId: USER_ID, subjectKind: where["subjectKind"] as string, subjectId: "muted-subject" }
          : null;
      },
    },
    notificationQuietHoursRepo: {
      async findOne() {
        return null;
      },
    },
    notificationRepo: {
      async upsertFromMatch(match, matchedEvent) {
        const key = `${match.userId}:${matchedEvent.id}:${match.rule.id}`;
        const existing = notifications.find((row) => row["idempotencyKey"] === key);
        if (existing) return existing;
        const row = { id: crypto.randomUUID(), idempotencyKey: key, userId: match.userId, eventId: matchedEvent.id, ruleId: match.rule.id };
        notifications.push(row);
        return row;
      },
    },
    notificationDeliveryRepo: {
      async upsertFromMatch(match, matchedEvent, channel, notification, status) {
        const key = `${matchedEvent.id}:${match.rule.id}:${match.userId}:${channel}`;
        const existing = deliveries.find((row) => row["idempotencyKey"] === key);
        if (existing) return existing;
        const row = {
          id: crypto.randomUUID(),
          idempotencyKey: key,
          orgId: ORG_ID,
          ruleId: match.rule.id,
          notificationId: notification && typeof notification === "object" && "id" in notification ? notification.id : null,
          userId: match.userId,
          channel,
          status,
          attemptCount: 0,
          payload: { eventId: matchedEvent.id, eventType: matchedEvent.verb },
        };
        deliveries.push(row);
        return row;
      },
      async create(data) {
        const row = { id: crypto.randomUUID(), ...data };
        deliveries.push(row);
        return row;
      },
    },
    queue: {
      async addJob(name, payload) {
        jobs.push({ name, payload });
      },
    },
    featureFlags: {
      async isEnabled() {
        return true;
      },
    },
  };
  return { repos, notifications, deliveries, jobs };
}

describe("notification fanout coverage", () => {
  test("repo sync completed event is canonical, enqueued once, and fans out once", async () => {
    const events: Array<Record<string, unknown>> = [];
    const fanoutJobs: Array<{ name: string; payload: Record<string, unknown> }> = [];
    const repos = createRepoSyncRepos(events, fanoutJobs);

    await createRepoSyncLocalTask(repos)({ repoId: REPO_ID });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: expect.any(String),
      eventType: "repo.sync.completed",
      orgId: ORG_ID,
      projectId: PROJECT_ID,
      subjectKind: "repo",
      subjectId: REPO_ID,
      actorUserId: null,
      payload: {
        branch: "main",
        ahead: 2,
        behind: 1,
        dirty: true,
        commitCount: 2,
        syncLatencyMs: expect.any(Number),
      },
    });
    expect(fanoutJobs).toEqual([{ name: "notify-fan-out", payload: { eventId: events[0]!.id } }]);

    const fanout = createFanoutRepos(events[0]!);
    await notifyFanout({ eventId: events[0]!.id as string }, fanout.repos);
    await notifyFanout({ eventId: events[0]!.id as string }, fanout.repos);

    expect(fanout.notifications).toHaveLength(1);
    expect(fanout.deliveries.map((row) => row["channel"]).sort()).toEqual(["email", "in-app"]);
  });

  test("artifact.created event is enqueued even when harvest deduplicates path copies", async () => {
    const root = await mkdtemp(join(tmpdir(), "fulcrum-fanout-artifact-"));
    try {
      await writeFile(join(root, "report.txt"), "same content\n");
      const events: Array<Record<string, unknown>> = [];
      const fanoutJobs: Array<{ name: string; payload: Record<string, unknown> }> = [];
      const deps = createHarvestDeps(events, fanoutJobs);

      await harvestArtifacts({ runId: RUN_ID, extractedDir: root, orgSlug: "acme", projectSlug: "proj", deps });
      await harvestArtifacts({ runId: RUN_ID, extractedDir: root, orgSlug: "acme", projectSlug: "proj", deps });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: "artifact.created",
        orgId: ORG_ID,
        projectId: PROJECT_ID,
        subjectKind: "artifact",
        subjectId: ARTIFACT_ID,
        payload: {
          artifactId: ARTIFACT_ID,
          runId: RUN_ID,
          kind: "artifact",
          mime: "text/plain",
          sizeBytes: 13,
          sha256: expect.any(String),
          previewKind: "text",
        },
      });
      expect(fanoutJobs).toEqual([{ name: "notify-fan-out", payload: { eventId: events[0]!.id } }]);

      const fanout = createFanoutRepos(events[0]!, [artifactRule()]);
      await notifyFanout({ eventId: events[0]!.id as string }, fanout.repos);

      expect(fanout.notifications).toHaveLength(1);
      expect(fanout.deliveries).toHaveLength(1);
      expect(fanout.deliveries[0]).toMatchObject({ channel: "in-app", status: "pending" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("disabled rule does not emit notification or delivery rows", async () => {
    const fanout = createFanoutRepos(repoSyncEvent({ id: "event-disabled" }), [repoRule({ enabled: false })]);

    await notifyFanout({ eventId: "event-disabled" }, fanout.repos);

    expect(fanout.notifications).toHaveLength(0);
    expect(fanout.deliveries).toHaveLength(0);
  });

  test("mute configuration suppresses matching event channels", async () => {
    const fanout = createFanoutRepos(repoSyncEvent({ id: "event-muted", subjectId: "muted-subject" }), [repoRule()]);

    await notifyFanout({ eventId: "event-muted" }, fanout.repos);

    expect(fanout.notifications).toHaveLength(0);
    expect(fanout.deliveries).toHaveLength(0);
    expect(fanout.jobs).toHaveLength(0);
  });
});

function repoSyncEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-repo-sync",
    eventType: "repo.sync.completed",
    orgId: ORG_ID,
    projectId: PROJECT_ID,
    subjectKind: "repo",
    subjectId: REPO_ID,
    actorUserId: null,
    verb: "repo.sync.completed",
    payload: {
      branch: "main",
      ahead: 2,
      behind: 1,
      dirty: true,
      commitCount: 2,
      syncLatencyMs: 12,
    },
    ...overrides,
  };
}

function createRepoSyncRepos(
  events: Array<Record<string, unknown>>,
  fanoutJobs: Array<{ name: string; payload: Record<string, unknown> }>,
): RepoSyncLocalRepositories {
  return {
    repoRepo: {
      async findLocalById() {
        return { id: REPO_ID, orgId: ORG_ID, projectId: PROJECT_ID, kind: "local", localPath: "/tmp/repo", syncStatus: "idle" };
      },
      async updateSyncState() {},
    },
    branches: { async upsertBulk() {} },
    commits: { async upsertBulk() {} },
    files: { async upsertBulk() {} },
    searchDocuments: { async upsertRepoFiles() {} },
    events: {
      async insert(input) {
        const event = { id: crypto.randomUUID(), eventType: input.verb, ...input };
        events.push(event);
        return event;
      },
    },
    fanoutQueue: {
      async addJob(name: string, payload: Record<string, unknown>) {
        fanoutJobs.push({ name, payload });
      },
    },
    git: {
      async getStatus() {
        return { branch: "main", dirty: true, ahead: 2, behind: 1, staged: ["a"], unstaged: ["b"] };
      },
      async listBranches() {
        return [{ name: "main", headSha: "a".repeat(40), isDefault: true, isCurrent: true }];
      },
      async getCommitLog() {
        return [
          { sha: "a".repeat(40), authorName: "A", authorEmail: "a@example.com", committedAt: new Date(), subject: "a", body: "", parents: [] },
          { sha: "b".repeat(40), authorName: "B", authorEmail: "b@example.com", committedAt: new Date(), subject: "b", body: "", parents: [] },
        ];
      },
      async getFileTree() {
        return [];
      },
    },
  } as RepoSyncLocalRepositories;
}

function createHarvestDeps(
  events: Array<Record<string, unknown>>,
  fanoutJobs: Array<{ name: string; payload: Record<string, unknown> }>,
): HarvestArtifactDeps {
  let stored: ArtifactLike | undefined;
  return {
    storageBackend: {
      async put() {
        return { relativePath: "runs/report.txt", absolutePath: "/tmp/runs/report.txt" };
      },
      async get() {
        return new Uint8Array();
      },
      async delete() {},
      async exists() {
        return true;
      },
    },
    artifactRepository: {
      async findDuplicate() {
        return stored;
      },
      async create(input: Record<string, unknown>) {
        stored = {
          id: ARTIFACT_ID,
          filename: input["filename"] as string,
          mime: input["mime"] as string,
          sizeBytes: input["sizeBytes"] as bigint,
          path: input["path"] as string,
          checksumSha256: input["checksumSha256"] as string,
          metadataJson: input["metadataJson"] as Record<string, unknown>,
        };
        return stored;
      },
    },
    edgeRepository: { async createMany() {} },
    searchDocumentRepository: { async upsertArtifactPreview() {} },
    eventRepository: {
      async recordArtifactHarvested({ artifact }: { artifact: ArtifactLike }) {
        const event = {
          id: crypto.randomUUID(),
          eventType: "artifact.created",
          orgId: ORG_ID,
          projectId: PROJECT_ID,
          subjectKind: "artifact",
          subjectId: artifact.id,
          verb: "artifact.created",
          payload: {
            artifactId: artifact.id,
            runId: RUN_ID,
            kind: "artifact",
            mime: artifact.mime,
            sizeBytes: Number(artifact.sizeBytes),
            sha256: artifact.checksumSha256,
            previewKind: artifact.metadataJson?.["previewKind"],
          },
        };
        events.push(event);
        return event;
      },
    },
    notificationQueue: {
      async addJob(name: string, payload: Record<string, unknown>) {
        fanoutJobs.push({ name, payload });
      },
    },
    agentRunRepository: {
      async findOneOrFail() {
        return { id: RUN_ID, org: { id: ORG_ID }, project: { id: PROJECT_ID } };
      },
    },
  } as unknown as HarvestArtifactDeps;
}
