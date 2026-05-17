import { describe, expect, test } from "bun:test";

import {
  DEFAULT_ARTIFACT_RETENTION_POLICIES,
  ARTIFACT_PRUNE_CRON,
  ARTIFACT_PRUNE_TASK,
  pruneArtifacts,
  registerPrunerCron,
  type ArtifactPruneRepository,
  type ArtifactRetentionPolicyInput,
  type PrunableArtifact,
} from "../pruner.ts";

const NOW = new Date("2026-05-07T12:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function artifact(overrides: Partial<PrunableArtifact>): PrunableArtifact {
  return {
    id: "artifact-1",
    orgId: "org-1",
    projectId: "project-1",
    artifactKind: "scratch",
    ref: "main",
    path: "org/project/run/artifact.txt",
    sizeBytes: 10n,
    createdAt: daysAgo(120),
    ...overrides,
  };
}

function policy(overrides: Partial<ArtifactRetentionPolicyInput>): ArtifactRetentionPolicyInput {
  return {
    orgId: "org-1",
    projectId: "project-1",
    scopeKind: "project",
    artifactKind: "scratch",
    retentionDays: 90,
    keepLatestPerRef: true,
    keepPinned: true,
    enabled: true,
    ...overrides,
  };
}

function createRepo(artifacts: PrunableArtifact[]): {
  repo: ArtifactPruneRepository;
  calls: string[];
  archived: Set<string>;
} {
  const calls: string[] = [];
  const archived = new Set<string>();
  const repo: ArtifactPruneRepository = {
    findRetentionPolicies: () => [policy({ artifactKind: "scratch" })],
    findArtifactsForRetention: () => artifacts.filter((candidate) => !archived.has(candidate.id)),
    findArchivedForHardDelete: () => [],
    markPruneStarted: ({ id }) => {
      calls.push(`started:${id}`);
      return true;
    },
    markArchived: ({ id }) => {
      calls.push(`archived:${id}`);
      archived.add(id);
    },
    hardDelete: ({ id }) => {
      calls.push(`hard-delete:${id}`);
    },
  };
  return { repo, calls, archived };
}

describe("artifact retention defaults", () => {
  test("defaults project artifacts to forever and scratch artifacts to 90 days", () => {
    expect(DEFAULT_ARTIFACT_RETENTION_POLICIES.project).toMatchObject({
      artifactKind: "project",
      retentionDays: null,
      enabled: true,
      keepPinned: true,
      keepLatestPerRef: true,
    });
    expect(DEFAULT_ARTIFACT_RETENTION_POLICIES.scratch).toMatchObject({
      artifactKind: "scratch",
      retentionDays: 90,
      enabled: true,
      keepPinned: true,
      keepLatestPerRef: true,
    });
  });
});

describe("pruneArtifacts", () => {
  test("deletes only expired artifacts and marks prune status before storage delete", async () => {
    const expired = artifact({ id: "expired", createdAt: daysAgo(120) });
    const fresh = artifact({ id: "fresh", createdAt: daysAgo(20), path: "fresh.txt" });
    const { repo, calls } = createRepo([expired, fresh]);
    const storageCalls: string[] = [];

    const result = await pruneArtifacts({
      now: NOW,
      confirm: true,
      deps: {
        artifactRepository: repo,
        storageBackend: {
          put: async () => ({ relativePath: "", absolutePath: "" }),
          get: async () => {
            throw new Error("unused");
          },
          exists: async () => true,
          delete: async (path) => {
            storageCalls.push(path);
            calls.push(`delete:${path}`);
          },
        },
      },
    });

    expect(result.softDeleted).toBe(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({ id: "fresh", reason: "not-expired" }),
    ]);
    expect(calls).toEqual([
      "started:expired",
      "delete:org/project/run/artifact.txt",
      "archived:expired",
    ]);
    expect(storageCalls).toEqual(["org/project/run/artifact.txt"]);
  });

  test("second run is idempotent and does not re-delete archived artifacts", async () => {
    const expired = artifact({ id: "expired", createdAt: daysAgo(120) });
    const { repo, calls } = createRepo([expired]);

    const deps = {
      artifactRepository: repo,
      storageBackend: {
        put: async () => ({ relativePath: "", absolutePath: "" }),
        get: async () => {
          throw new Error("unused");
        },
        exists: async () => true,
          delete: async (path: string) => {
            calls.push(`delete:${path}`);
          },
      },
    };

    const first = await pruneArtifacts({ now: NOW, confirm: true, deps });
    const second = await pruneArtifacts({ now: NOW, confirm: true, deps });

    expect(first.softDeleted).toBe(1);
    expect(second.softDeleted).toBe(0);
    expect(calls.filter((call) => call.startsWith("delete:"))).toHaveLength(1);
  });

  test("skips pinned, latest-per-ref, disabled policy, not-expired, and org mismatch artifacts", async () => {
    const artifacts = [
      artifact({ id: "pinned", pinned: true }),
      artifact({ id: "latest", latestForRef: true, path: "latest.txt" }),
      artifact({ id: "fresh", createdAt: daysAgo(2), path: "fresh.txt" }),
      artifact({ id: "wrong-org", orgId: "org-2", path: "wrong-org.txt" }),
      artifact({ id: "disabled", artifactKind: "disabled", path: "disabled.txt" }),
    ];
    const { repo } = createRepo(artifacts);
    repo.findRetentionPolicies = () => [
      policy({ artifactKind: "scratch" }),
      policy({ artifactKind: "disabled", enabled: false }),
    ];

    const result = await pruneArtifacts({
      now: NOW,
      confirm: true,
      deps: {
        artifactRepository: repo,
        storageBackend: {
          put: async () => ({ relativePath: "", absolutePath: "" }),
          get: async () => {
            throw new Error("unused");
          },
          exists: async () => true,
          delete: async () => {
            throw new Error("skip-only case should not delete");
          },
        },
      },
    });

    expect(result.softDeleted).toBe(0);
    expect(result.skipped.map((skip) => `${skip.id}:${skip.reason}`).sort()).toEqual([
      "disabled:policy-disabled",
      "fresh:not-expired",
      "latest:latest-per-ref",
      "pinned:pinned",
      "wrong-org:org-mismatch",
    ]);
  });

  test("registerPrunerCron wires task and cron schedule", async () => {
    const tasks: string[] = [];
    const crons: string[] = [];

    registerPrunerCron({
      addTask: (name, handler) => {
        tasks.push(name);
        expect(handler).toBeFunction();
      },
      addCronTask: (name, cron) => {
        crons.push(`${name}:${cron}`);
      },
    });

    expect(tasks).toEqual([ARTIFACT_PRUNE_TASK]);
    expect(crons).toEqual([`${ARTIFACT_PRUNE_TASK}:${ARTIFACT_PRUNE_CRON}`]);
  });
});
