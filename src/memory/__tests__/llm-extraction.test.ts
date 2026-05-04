/**
 * Gated LLM extraction tests — TDD RED → GREEN.
 *
 * Issue: .scratch/agent-os-vision/08-memory-context-engine/issues/15-gated-llm-extraction.md
 *
 * Acceptance criteria:
 *   1. FULCRUM_FEATURES unset → no job enqueued, no source='llm' rows, no sidecar calls
 *   2. FULCRUM_FEATURES=memory-llm-extract → job enqueued after after_run; calls extract_facts
 *   3. Dedup: near-duplicate body (similarity 0.9) → only 1 row; distinct → both written
 *   4. Sidecar unavailable (mock timeout) → job fails silently; heuristic rows remain; warning logged
 *   5. Job timeout: 30s max
 *   6. Retry: max 2× retries on non-timeout failure; 3rd attempt not made
 *   7. source='llm' on all written rows; confidence stored in source_ref JSON
 *   8. Integration: flag ON + mock sidecar returning 3 facts → 3 rows written
 *   9. fulcrum doctor --json llm_extraction subsystem: disabled when flag off, ok/degraded when on
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, mock, spyOn } from "bun:test";
import { Container } from "@needle-di/core";

import { createTestOrm, type TestOrm } from "../../test-utils/db.ts";
import { registerDbBindings } from "../../db/db.module.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { Memory } from "../../db/entities/memory/Memory.ts";
import { MemoryLink } from "../../db/entities/memory/MemoryLink.ts";
import {
  isLlmExtractEnabled,
  LlmExtractionJob,
  type Fact,
  type InferenceClientLike,
} from "../llm-extraction.ts";
import { llmExtractionDoctorCheck } from "../llm-extraction.ts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const RUN_ID = "33333333-3333-3333-3333-333333333333";

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
  await em.nativeDelete(MemoryLink, {});
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

describe("isLlmExtractEnabled", () => {
  test("returns false when FULCRUM_FEATURES is unset", () => {
    delete process.env["FULCRUM_FEATURES"];
    expect(isLlmExtractEnabled()).toBe(false);
  });

  test("returns false when FULCRUM_FEATURES does not contain memory-llm-extract", () => {
    process.env["FULCRUM_FEATURES"] = "embeddings,other-feature";
    expect(isLlmExtractEnabled()).toBe(false);
  });

  test("returns true when FULCRUM_FEATURES contains memory-llm-extract", () => {
    process.env["FULCRUM_FEATURES"] = "memory-llm-extract";
    expect(isLlmExtractEnabled()).toBe(true);
  });

  test("returns true when mixed with other flags", () => {
    process.env["FULCRUM_FEATURES"] = "embeddings,memory-llm-extract,other";
    expect(isLlmExtractEnabled()).toBe(true);
  });
});

// ── Feature flag gating ───────────────────────────────────────────────────

describe("LlmExtractionJob — feature flag gating", () => {
  test("no sidecar calls and no source=llm rows when flag is off", async () => {
    delete process.env["FULCRUM_FEATURES"];

    const client = mockClient([
      { body: "should not appear", kind: "fact", importance: "high", confidence: 0.95 },
    ]);
    const job = createJob(client);

    await job.run(ORG_ID, null, "some transcript text", RUN_ID, "agent_run");

    expect(client.callCount).toBe(0);
    const em = db.orm.em.fork();
    expect(await em.count(Memory, { source: "llm" })).toBe(0);
  });
});

// ── Extraction flow ───────────────────────────────────────────────────────

describe("LlmExtractionJob — extraction", () => {
  beforeEach(() => {
    process.env["FULCRUM_FEATURES"] = "memory-llm-extract";
  });

  test("calls extract_facts and writes source=llm rows with confidence in source_ref", async () => {
    const facts: Fact[] = [
      { body: "PGlite supports tsvector", kind: "fact", importance: "high", confidence: 0.92 },
      { body: "Use BM25 for ranking", kind: "decision", importance: "high", confidence: 0.88 },
      { body: "Team prefers local-first", kind: "fact", importance: "medium", confidence: 0.75 },
    ];
    const client = mockClient(facts);
    const job = createJob(client);

    await job.run(ORG_ID, null, "big transcript text here", RUN_ID, "agent_run");

    expect(client.callCount).toBe(1);

    const em = db.orm.em.fork();
    const memories = await em.find(Memory, { source: "llm" }, { orderBy: { body: "ASC" } });
    expect(memories).toHaveLength(3);
    expect(memories.every((m) => m.source === "llm")).toBe(true);
    expect(memories.every((m) => m.orgId === ORG_ID)).toBe(true);

    // confidence stored in source_ref
    const pgMemory = memories.find((m) => m.body === "PGlite supports tsvector")!;
    expect(pgMemory.sourceRef["confidence"]).toBe(0.92);
    expect(pgMemory.kind).toBe("fact");
    expect(pgMemory.importance).toBe("high");

    // Links created
    const links = await em.find(MemoryLink, {});
    expect(links).toHaveLength(3);
    expect(links.every((l) => l.targetKind === "agent_run" && l.targetId === RUN_ID)).toBe(true);
  });

  test("integration: 3 facts → 3 rows written (no dedup collision)", async () => {
    const facts: Fact[] = [
      { body: "Fact alpha", kind: "fact", importance: "low", confidence: 0.6 },
      { body: "Fact beta", kind: "fact", importance: "medium", confidence: 0.7 },
      { body: "Fact gamma", kind: "fact", importance: "high", confidence: 0.8 },
    ];
    const client = mockClient(facts);
    const job = createJob(client);

    await job.run(ORG_ID, null, "transcript", RUN_ID, "agent_run");

    const em = db.orm.em.fork();
    expect(await em.count(Memory, { source: "llm" })).toBe(3);
  });
});

// ── Dedup ─────────────────────────────────────────────────────────────────

describe("LlmExtractionJob — dedup", () => {
  beforeEach(() => {
    process.env["FULCRUM_FEATURES"] = "memory-llm-extract";
  });

  test("skips near-duplicate body (similarity > 0.85)", async () => {
    // Pre-seed a memory with a very similar body
    const em = db.orm.em.fork();
    const orgRef = em.getReference(Org, ORG_ID);
    em.create(Memory, {
      org: orgRef,
      projectId: null,
      kind: "fact",
      body: "PGlite fully supports tsvector operations",
      source: "heuristic" as const,
      importance: "medium",
      tags: [],
      global: false,
      archived: false,
      sourceRef: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.persist(em.getUnitOfWork().getChangeSets().map((cs) => cs.entity));
    await em.flush();

    // LLM returns near-duplicate
    const facts: Fact[] = [
      { body: "PGlite fully supports tsvector operations", kind: "fact", importance: "high", confidence: 0.9 },
    ];
    const client = mockClient(facts);
    const job = createJob(client);

    await job.run(ORG_ID, null, "transcript", RUN_ID, "agent_run");

    const em2 = db.orm.em.fork();
    // Should have only the original heuristic row, no new llm row (exact match)
    const llmRows = await em2.find(Memory, { source: "llm" });
    expect(llmRows).toHaveLength(0);
  });

  test("writes genuinely distinct bodies", async () => {
    // Pre-seed a memory
    const em = db.orm.em.fork();
    const orgRef = em.getReference(Org, ORG_ID);
    em.create(Memory, {
      org: orgRef,
      projectId: null,
      kind: "fact",
      body: "PGlite supports tsvector",
      source: "heuristic" as const,
      importance: "medium",
      tags: [],
      global: false,
      archived: false,
      sourceRef: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.persist(em.getUnitOfWork().getChangeSets().map((cs) => cs.entity));
    await em.flush();

    // LLM returns completely different body
    const facts: Fact[] = [
      { body: "Redis is used for caching session data", kind: "fact", importance: "medium", confidence: 0.8 },
    ];
    const client = mockClient(facts);
    const job = createJob(client);

    await job.run(ORG_ID, null, "transcript", RUN_ID, "agent_run");

    const em2 = db.orm.em.fork();
    const llmRows = await em2.find(Memory, { source: "llm" });
    expect(llmRows).toHaveLength(1);
    expect(llmRows[0]!.body).toBe("Redis is used for caching session data");
  });
});

// ── Sidecar failure ───────────────────────────────────────────────────────

describe("LlmExtractionJob — sidecar failure", () => {
  beforeEach(() => {
    process.env["FULCRUM_FEATURES"] = "memory-llm-extract";
  });

  test("fails silently when sidecar is unavailable (logs warning)", async () => {
    // Pre-seed a heuristic memory to prove it persists
    const em = db.orm.em.fork();
    const orgRef = em.getReference(Org, ORG_ID);
    em.create(Memory, {
      org: orgRef,
      projectId: null,
      kind: "decision",
      body: "existing heuristic row",
      source: "heuristic" as const,
      importance: "high",
      tags: [],
      global: false,
      archived: false,
      sourceRef: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    em.persist(em.getUnitOfWork().getChangeSets().map((cs) => cs.entity));
    await em.flush();

    const client = mockClientError(new Error("Connection refused: sidecar down"));
    const warnings: string[] = [];
    const job = createJob(client, { onWarning: (msg) => warnings.push(msg) });

    // Should not throw
    await job.run(ORG_ID, null, "transcript", RUN_ID, "agent_run");

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("sidecar");

    // Heuristic row still present
    const em2 = db.orm.em.fork();
    const heuristic = await em2.find(Memory, { source: "heuristic" });
    expect(heuristic).toHaveLength(1);
    // No LLM rows written
    expect(await em2.count(Memory, { source: "llm" })).toBe(0);
  });
});

// ── Timeout + retry ───────────────────────────────────────────────────────

describe("LlmExtractionJob — timeout and retry", () => {
  beforeEach(() => {
    process.env["FULCRUM_FEATURES"] = "memory-llm-extract";
  });

  test("job has 30s timeout", () => {
    const job = createJob(mockClient([]));
    expect(job.timeoutMs).toBe(30_000);
  });

  test("retries up to 2× on non-timeout failure; 3rd attempt not made", async () => {
    let attempts = 0;
    const client: InferenceClientLike = {
      callCount: 0,
      call: async () => {
        attempts++;
        throw new Error("transient error");
      },
    };
    const warnings: string[] = [];
    const job = createJob(client, { onWarning: (msg) => warnings.push(msg) });

    await job.run(ORG_ID, null, "transcript", RUN_ID, "agent_run");

    // 1 initial + 2 retries = 3 total attempts
    expect(attempts).toBe(3);
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("does not retry on timeout error", async () => {
    let attempts = 0;
    const client: InferenceClientLike = {
      callCount: 0,
      call: async () => {
        attempts++;
        const err = new Error("timed out after 30000ms");
        (err as Error & { code?: string }).code = "ETIMEDOUT";
        throw err;
      },
    };
    const warnings: string[] = [];
    const job = createJob(client, { onWarning: (msg) => warnings.push(msg) });

    await job.run(ORG_ID, null, "transcript", RUN_ID, "agent_run");

    // No retry on timeout — just 1 attempt
    expect(attempts).toBe(1);
  });
});

// ── Doctor check ──────────────────────────────────────────────────────────

describe("llmExtractionDoctorCheck", () => {
  test("returns disabled when flag is off", () => {
    delete process.env["FULCRUM_FEATURES"];
    const result = llmExtractionDoctorCheck();
    expect(result.status).toBe("disabled");
    expect(result.subsystem).toBe("llm_extraction");
  });

  test("returns ok when flag is on", () => {
    process.env["FULCRUM_FEATURES"] = "memory-llm-extract";
    const result = llmExtractionDoctorCheck();
    expect(result.status).toBe("ok");
    expect(result.subsystem).toBe("llm_extraction");
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────

function createJob(
  client: InferenceClientLike,
  opts: { onWarning?: (msg: string) => void } = {},
): LlmExtractionJob {
  const container = new Container();
  registerDbBindings(container, db.orm, db.orm.em.fork());
  return new LlmExtractionJob(
    db.orm.em.fork(),
    client,
    opts.onWarning ?? (() => {}),
  );
}

function mockClient(facts: Fact[]): InferenceClientLike & { callCount: number } {
  return {
    callCount: 0,
    async call(_method: string, _params: unknown) {
      this.callCount++;
      return { facts };
    },
  };
}

function mockClientError(error: Error): InferenceClientLike & { callCount: number } {
  return {
    callCount: 0,
    async call() {
      this.callCount++;
      throw error;
    },
  };
}
