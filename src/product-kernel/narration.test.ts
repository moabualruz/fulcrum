import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { openIsolatedStore } from "../test-support/product-fixtures.ts";
import { migrateIsolatedStore } from "../test-support/product-fixtures.ts";
import { createLocalOrg } from "../test-support/product-fixtures.ts";
import { createArtifact, getArtifact, listArtifacts } from "../test-support/product-fixtures.ts";
import {
  buildNarrationPrompt,
  isNarrationEnabled,
  narrateArtifact,
  type SidecarClient,
} from "./narration.ts";
import type { TestStore } from "../test-support/product-fixtures.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-narration-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

let dbCounter = 0;
async function freshDb(): Promise<TestStore> {
  const db = await openIsolatedStore(join(scratch, `db-${dbCounter++}`));
  await migrateIsolatedStore(db);
  // Create org for FK
  await createLocalOrg(db, { slug: "test-org", name: "Test Org" });
  return db;
}

async function getOrgId(db: TestStore): Promise<string> {
  const rows = await db.query<{ id: string }>("SELECT id FROM orgs LIMIT 1", []);
  return rows[0]!.id;
}

function mockSidecar(response: string): SidecarClient {
  return {
    async infer(_prompt: string, _timeoutMs: number): Promise<string> {
      return response;
    },
  };
}

function timeoutSidecar(): SidecarClient {
  return {
    async infer(_prompt: string, _timeoutMs: number): Promise<string> {
      throw new Error("sidecar timeout: request timed out after 5000ms");
    },
  };
}

function errorSidecar(msg: string): SidecarClient {
  return {
    async infer(): Promise<string> {
      throw new Error(msg);
    },
  };
}

const savedEnv = process.env.FULCRUM_FEATURES;

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env.FULCRUM_FEATURES;
  } else {
    process.env.FULCRUM_FEATURES = savedEnv;
  }
});

describe("isNarrationEnabled", () => {
  test("returns false when FULCRUM_FEATURES not set", () => {
    delete process.env.FULCRUM_FEATURES;
    expect(isNarrationEnabled()).toBe(false);
  });

  test("returns false when flag not in FULCRUM_FEATURES", () => {
    process.env.FULCRUM_FEATURES = "other-feature,another";
    expect(isNarrationEnabled()).toBe(false);
  });

  test("returns true when report-llm-narration in FULCRUM_FEATURES", () => {
    process.env.FULCRUM_FEATURES = "report-llm-narration";
    expect(isNarrationEnabled()).toBe(true);
  });

  test("returns true when report-llm-narration is among multiple flags", () => {
    process.env.FULCRUM_FEATURES = "foo,report-llm-narration,bar";
    expect(isNarrationEnabled()).toBe(true);
  });
});

describe("buildNarrationPrompt", () => {
  test("includes filename and truncated content", () => {
    const prompt = buildNarrationPrompt("README.md", "Hello world");
    expect(prompt).toContain("README.md");
    expect(prompt).toContain("Hello world");
    expect(prompt).toContain("1-2 sentences");
  });

  test("truncates content to 2000 chars", () => {
    const long = "x".repeat(5000);
    const prompt = buildNarrationPrompt("big.dat", long);
    // The prompt should contain at most 2000 x's (from content truncation)
    // plus any x's in the template text itself
    expect(prompt).toContain("x".repeat(2000));
    expect(prompt).not.toContain("x".repeat(2001));
  });
});

describe("narrateArtifact", () => {
  test("flag OFF: zero sidecar calls, narration absent", async () => {
    delete process.env.FULCRUM_FEATURES;
    const db = await freshDb();
    try {
      const orgId = await getOrgId(db);
      const artifact = await createArtifact(db, {
        orgId,
        kind: "report",
        title: "test.md",
      });

      let sidecarCalled = false;
      const sidecar: SidecarClient = {
        async infer(): Promise<string> {
          sidecarCalled = true;
          return "should not be called";
        },
      };

      const result = await narrateArtifact(
        db,
        { artifactId: artifact.id, orgId },
        sidecar,
      );

      expect(result.narrated).toBe(false);
      expect(result.skipped).toBe("flag-off");
      expect(sidecarCalled).toBe(false);

      const fetched = await getArtifact(db, artifact.id);
      expect(fetched?.metadata_json.narration).toBeUndefined();
    } finally {
      await db.close();
    }
  });

  test("flag ON + sidecar mock: metadata_json.narration populated", async () => {
    process.env.FULCRUM_FEATURES = "report-llm-narration";
    const db = await freshDb();
    try {
      const orgId = await getOrgId(db);
      const artifact = await createArtifact(db, {
        orgId,
        kind: "report",
        title: "analysis.md",
        metadataJson: { content: "This is a detailed security analysis of the codebase." },
      });

      const sidecar = mockSidecar("A security analysis report covering codebase vulnerabilities.");
      const result = await narrateArtifact(
        db,
        { artifactId: artifact.id, orgId },
        sidecar,
      );

      expect(result.narrated).toBe(true);

      const fetched = await getArtifact(db, artifact.id);
      expect(fetched?.metadata_json.narration).toBe(
        "A security analysis report covering codebase vulnerabilities.",
      );
    } finally {
      await db.close();
    }
  });

  test("sidecar timeout: graceful skip, no narration, no job failure", async () => {
    process.env.FULCRUM_FEATURES = "report-llm-narration";
    const db = await freshDb();
    try {
      const orgId = await getOrgId(db);
      const artifact = await createArtifact(db, {
        orgId,
        kind: "report",
        title: "timeout.md",
      });

      const sidecar = timeoutSidecar();
      const result = await narrateArtifact(
        db,
        { artifactId: artifact.id, orgId },
        sidecar,
      );

      // Job succeeds (no throw), but narration not written
      expect(result.narrated).toBe(false);
      expect(result.skipped).toBe("sidecar-timeout");

      const fetched = await getArtifact(db, artifact.id);
      expect(fetched?.metadata_json.narration).toBeUndefined();

      // Event emitted
      const events = await db.query<{ verb: string; payload: string }>(
        `SELECT verb, payload FROM events WHERE subject_kind = 'artifact' AND subject_id = $1`,
        [artifact.id],
      );
      expect(events.length).toBeGreaterThanOrEqual(1);
      const skipEvent = events.find((e) => e.verb === "artifact.narration.skipped");
      expect(skipEvent).toBeDefined();
      const payload =
        typeof skipEvent!.payload === "string"
          ? JSON.parse(skipEvent!.payload)
          : skipEvent!.payload;
      expect(payload.reason).toBe("sidecar-timeout");
    } finally {
      await db.close();
    }
  });

  test("sidecar non-timeout error: graceful skip with sidecar-error reason", async () => {
    process.env.FULCRUM_FEATURES = "report-llm-narration";
    const db = await freshDb();
    try {
      const orgId = await getOrgId(db);
      const artifact = await createArtifact(db, {
        orgId,
        kind: "report",
        title: "error.md",
      });

      const sidecar = errorSidecar("connection refused");
      const result = await narrateArtifact(
        db,
        { artifactId: artifact.id, orgId },
        sidecar,
      );

      expect(result.narrated).toBe(false);
      expect(result.skipped).toBe("sidecar-error");
    } finally {
      await db.close();
    }
  });
});

describe("artifacts store", () => {
  test("getArtifact includes metadata_json", async () => {
    const db = await freshDb();
    try {
      const orgId = await getOrgId(db);
      const artifact = await createArtifact(db, {
        orgId,
        kind: "log",
        title: "run.log",
        metadataJson: { narration: "A build log", tags: ["ci"] },
      });

      const fetched = await getArtifact(db, artifact.id);
      expect(fetched?.metadata_json.narration).toBe("A build log");
      expect(fetched?.metadata_json.tags).toEqual(["ci"]);
    } finally {
      await db.close();
    }
  });

  test("listArtifacts omits metadata_json (narration not in list)", async () => {
    const db = await freshDb();
    try {
      const orgId = await getOrgId(db);
      await createArtifact(db, {
        orgId,
        kind: "report",
        title: "a.md",
        metadataJson: { narration: "should not appear in list" },
      });

      const list = await listArtifacts(db, orgId);
      expect(list.length).toBe(1);
      // metadata_json should not be in the result
      expect((list[0] as Record<string, unknown>).metadata_json).toBeUndefined();
    } finally {
      await db.close();
    }
  });
});
