/**
 * Gated memory digest tests — TDD RED → GREEN.
 *
 * Issue: .scratch/agent-os-vision/08-memory-context-engine/issues/18-gated-report-llm-narration.md
 *
 * Acceptance criteria:
 *   1. FULCRUM_FEATURES unset → `fulcrum memory digest` returns "feature not enabled" error; no cron scheduled
 *   2. FULCRUM_FEATURES=report-llm-narration → calls summarize(memories); writes doc_type='note' row
 *   3. Written doc: non-empty body; source_ref.kind = 'memory_digest'; linked to project
 *   4. --since filters memories to created_at >= since; default: last 7 days
 *   5. Weekly cron: registered and fires; skips when < 10 memories in window
 *   6. Sidecar unavailable → job/command fails with error log; no partial doc written
 *   7. Integration: flag ON + mock sidecar returning summary string → doc row created; body matches mock
 *   8. --json returns { docId, body, projectId, since } on success
 *   9. fulcrum doctor --json report_narration subsystem: disabled when flag off; ok when on
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";

import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { registerDbBindings } from "../../db/db.module.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { Memory } from "../../db/entities/memory/Memory.ts";
import { Document } from "../../db/entities/docs/Document.ts";
import {
  isDigestEnabled,
  MemoryDigestJob,
  digestDoctorCheck,
  isCronRegisterable,
  type InferenceClientLike,
} from "../digest.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT_ID = "22222222-2222-2222-2222-222222222222";

let db: TestOrm;
let previousFeatures: string | undefined;

beforeAll(async () => {
  db = await createTestOrm();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  previousFeatures = process.env["FULCRUM_FEATURES"];
  const em = db.orm.em.fork();
  await em.nativeDelete(Document, {});
  await em.nativeDelete(Memory, {});
  await em.upsert(
    Org,
    { id: ORG_ID, name: "Test", slug: "test", updatedAt: new Date() },
    { onConflictFields: ["id"] },
  );
});

afterEach(() => {
  if (previousFeatures === undefined) {
    delete process.env["FULCRUM_FEATURES"];
  } else {
    process.env["FULCRUM_FEATURES"] = previousFeatures;
  }
});

// ── Feature flag ──────────────────────────────────────────────────────────

describe("isDigestEnabled", () => {
  test("returns false when FULCRUM_FEATURES is unset", () => {
    delete process.env["FULCRUM_FEATURES"];
    expect(isDigestEnabled()).toBe(false);
  });

  test("returns false when FULCRUM_FEATURES does not contain report-llm-narration", () => {
    process.env["FULCRUM_FEATURES"] = "embeddings,other-feature";
    expect(isDigestEnabled()).toBe(false);
  });

  test("returns true when FULCRUM_FEATURES contains report-llm-narration", () => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
    expect(isDigestEnabled()).toBe(true);
  });

  test("returns true with backend suffix", () => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration:embedded";
    expect(isDigestEnabled()).toBe(true);
  });
});

// ── Feature flag gating ─────────────────────────────────────────────────

describe("MemoryDigestJob — feature flag gating", () => {
  test("throws 'feature not enabled' when flag is off", async () => {
    delete process.env["FULCRUM_FEATURES"];

    const client = mockClient("should not be called");
    const job = createJob(client);

    await expect(
      job.run(ORG_ID, PROJECT_ID),
    ).rejects.toThrow("feature not enabled");
  });

  test("no cron registration when flag is off", () => {
    delete process.env["FULCRUM_FEATURES"];
    expect(isCronRegisterable()).toBe(false);
  });
});

// ── Digest flow ─────────────────────────────────────────────────────────

describe("MemoryDigestJob — digest", () => {
  beforeEach(() => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
  });

  test("calls summarize(memories) and writes doc_type='note' with source_ref", async () => {
    await seedMemories(5);

    const summaryText = "This project focused on local-first search with PGlite and BM25 ranking.";
    const client = mockClient(summaryText);
    const job = createJob(client);

    const result = await job.run(ORG_ID, PROJECT_ID);

    expect(result).not.toBeNull();
    expect(result!.body).toBe(summaryText);
    expect(result!.projectId).toBe(PROJECT_ID);
    expect(result!.docId).toBeTruthy();

    // Verify doc row
    const em = db.orm.em.fork();
    const doc = await em.findOne(Document, { id: result!.docId });
    expect(doc).not.toBeNull();
    expect(doc!.docType).toBe("note");
    expect(doc!.bodyMd).toBe(summaryText);
    expect(doc!.projectId).toBe(PROJECT_ID);

    // source_ref in frontmatter
    const sourceRef = (doc!.frontmatter as Record<string, unknown>).source_ref as Record<string, unknown>;
    expect(sourceRef.kind).toBe("memory_digest");
    expect(sourceRef.project_id).toBe(PROJECT_ID);
    expect(sourceRef.since).toBeTruthy();
  });

  test("--since filters memories to created_at >= since", async () => {
    const em = db.orm.em.fork();
    const orgRef = em.getReference(Org, ORG_ID);

    // Old memory (30 days ago)
    em.create(Memory, {
      org: orgRef,
      projectId: PROJECT_ID,
      kind: "fact",
      body: "old fact",
      source: "heuristic" as const,
      importance: "medium",
      tags: [],
      global: false,
      archived: false,
      sourceRef: {},
      createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
    // Recent memory (1 day ago)
    em.create(Memory, {
      org: orgRef,
      projectId: PROJECT_ID,
      kind: "fact",
      body: "recent fact",
      source: "heuristic" as const,
      importance: "medium",
      tags: [],
      global: false,
      archived: false,
      sourceRef: {},
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
    await em.flush();

    let capturedMemories: unknown[] = [];
    const client: InferenceClientLike = {
      async call(_method: string, params: unknown) {
        capturedMemories = (params as { memories: unknown[] }).memories;
        return { summary: "digest result" };
      },
    };
    const job = createJob(client);

    // Since 3 days ago — should only include the recent memory
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const result = await job.run(ORG_ID, PROJECT_ID, since);

    expect(result).not.toBeNull();
    expect(capturedMemories).toHaveLength(1);
    expect((capturedMemories[0] as { body: string }).body).toBe("recent fact");
  });

  test("default window is last 7 days", async () => {
    const em = db.orm.em.fork();
    const orgRef = em.getReference(Org, ORG_ID);

    // Memory 3 days ago (within window)
    em.create(Memory, {
      org: orgRef,
      projectId: PROJECT_ID,
      kind: "fact",
      body: "within window",
      source: "heuristic" as const,
      importance: "medium",
      tags: [],
      global: false,
      archived: false,
      sourceRef: {},
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
    // Memory 10 days ago (outside window)
    em.create(Memory, {
      org: orgRef,
      projectId: PROJECT_ID,
      kind: "fact",
      body: "outside window",
      source: "heuristic" as const,
      importance: "medium",
      tags: [],
      global: false,
      archived: false,
      sourceRef: {},
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    });
    await em.flush();

    let capturedMemories: unknown[] = [];
    const client: InferenceClientLike = {
      async call(_method: string, params: unknown) {
        capturedMemories = (params as { memories: unknown[] }).memories;
        return { summary: "digest" };
      },
    };
    const job = createJob(client);

    const result = await job.run(ORG_ID, PROJECT_ID);

    expect(result).not.toBeNull();
    expect(capturedMemories).toHaveLength(1);
    expect((capturedMemories[0] as { body: string }).body).toBe("within window");
  });
});

// ── Cron mode ───────────────────────────────────────────────────────────

describe("MemoryDigestJob — cron mode", () => {
  beforeEach(() => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
  });

  test("skips when < 10 memories in window (cron mode)", async () => {
    await seedMemories(5); // Only 5 memories

    const client = mockClient("should not be called");
    const job = createJob(client);

    const result = await job.run(ORG_ID, PROJECT_ID, undefined, true);
    expect(result).toBeNull();
  });

  test("runs when >= 10 memories in window (cron mode)", async () => {
    await seedMemories(12);

    const client = mockClient("weekly digest summary");
    const job = createJob(client);

    const result = await job.run(ORG_ID, PROJECT_ID, undefined, true);
    expect(result).not.toBeNull();
    expect(result!.body).toBe("weekly digest summary");
  });

  test("cron registerable when flag is on", () => {
    expect(isCronRegisterable()).toBe(true);
  });
});

// ── Sidecar failure ─────────────────────────────────────────────────────

describe("MemoryDigestJob — sidecar failure", () => {
  beforeEach(() => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
  });

  test("fails with error when sidecar unavailable; no partial doc written", async () => {
    await seedMemories(3);

    const client = mockClientError(new Error("Connection refused: sidecar down"));
    const warnings: string[] = [];
    const job = createJob(client, { onWarning: (msg) => warnings.push(msg) });

    await expect(
      job.run(ORG_ID, PROJECT_ID),
    ).rejects.toThrow("Connection refused");

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("sidecar");

    // No doc written
    const em = db.orm.em.fork();
    const docs = await em.find(Document, { projectId: PROJECT_ID });
    expect(docs).toHaveLength(0);
  });

  test("fails when sidecar returns empty summary; no doc written", async () => {
    await seedMemories(3);

    const client: InferenceClientLike = {
      async call() {
        return { summary: "" };
      },
    };
    const warnings: string[] = [];
    const job = createJob(client, { onWarning: (msg) => warnings.push(msg) });

    await expect(
      job.run(ORG_ID, PROJECT_ID),
    ).rejects.toThrow("empty summary");

    const em = db.orm.em.fork();
    const docs = await em.find(Document, { projectId: PROJECT_ID });
    expect(docs).toHaveLength(0);
  });
});

// ── Integration ─────────────────────────────────────────────────────────

describe("MemoryDigestJob — integration", () => {
  beforeEach(() => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
  });

  test("flag ON + mock sidecar → doc row created; body matches mock", async () => {
    await seedMemories(5);

    const summaryText = "The team decided on local-first architecture with PGlite.";
    const client = mockClient(summaryText);
    const job = createJob(client);

    const result = await job.run(ORG_ID, PROJECT_ID);

    expect(result).not.toBeNull();
    expect(result!.body).toBe(summaryText);

    const em = db.orm.em.fork();
    const doc = await em.findOne(Document, { id: result!.docId });
    expect(doc).not.toBeNull();
    expect(doc!.bodyMd).toBe(summaryText);
    expect(doc!.docType).toBe("note");
  });

  test("result contains { docId, body, projectId, since }", async () => {
    await seedMemories(3);

    const client = mockClient("summary");
    const job = createJob(client);

    const result = await job.run(ORG_ID, PROJECT_ID);

    expect(result).not.toBeNull();
    expect(typeof result!.docId).toBe("string");
    expect(typeof result!.body).toBe("string");
    expect(result!.projectId).toBe(PROJECT_ID);
    expect(typeof result!.since).toBe("string");
    // since is valid ISO date
    expect(new Date(result!.since).toISOString()).toBe(result!.since);
  });
});

// ── Doctor check ────────────────────────────────────────────────────────

describe("digestDoctorCheck", () => {
  test("returns disabled when flag is off", () => {
    delete process.env["FULCRUM_FEATURES"];
    const result = digestDoctorCheck();
    expect(result.status).toBe("disabled");
    expect(result.subsystem).toBe("report_narration");
  });

  test("returns ok when flag is on", () => {
    process.env["FULCRUM_FEATURES"] = "report-llm-narration";
    const result = digestDoctorCheck();
    expect(result.status).toBe("ok");
    expect(result.subsystem).toBe("report_narration");
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────

function createJob(
  client: InferenceClientLike,
  opts: { onWarning?: (msg: string) => void } = {},
): MemoryDigestJob {
  return new MemoryDigestJob(
    db.orm.em.fork(),
    client,
    opts.onWarning ?? (() => {}),
  );
}

function mockClient(summary: string): InferenceClientLike {
  return {
    async call(_method: string, _params: unknown) {
      return { summary };
    },
  };
}

function mockClientError(error: Error): InferenceClientLike {
  return {
    async call() {
      throw error;
    },
  };
}

async function seedMemories(count: number): Promise<void> {
  const em = db.orm.em.fork();
  const orgRef = em.getReference(Org, ORG_ID);
  const now = new Date();

  for (let i = 0; i < count; i++) {
    em.create(Memory, {
      org: orgRef,
      projectId: PROJECT_ID,
      kind: "fact",
      body: `Memory fact number ${i + 1}`,
      source: "heuristic" as const,
      importance: "medium",
      tags: [],
      global: false,
      archived: false,
      sourceRef: {},
      createdAt: new Date(now.getTime() - i * 60 * 60 * 1000), // stagger by hours
      updatedAt: now,
    });
  }
  await em.flush();
}
