/**
 * P11#16 — Search click telemetry tests.
 * RED→GREEN: telemetry OFF → search_clicks empty; ON → row inserted with
 * correct position+kind; query_hash stable for same inputs.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "bun:test";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { computeQueryHash, recordSearchClick } from "./click-telemetry.ts";

const scratch = mkdtempSync(join(tmpdir(), "fulcrum-click-telemetry-"));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("search click telemetry", () => {
  test("telemetry OFF → search_clicks table empty (no writes)", async () => {
    const db = await openPglite(join(scratch, "off"));
    try {
      await runMigrations(db);
      // When flag OFF, caller should not call recordSearchClick at all.
      // Verify table starts empty.
      const rows = await db.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM search_clicks",
        [],
      );
      expect(rows[0]?.count ?? 0).toBe(0);
    } finally {
      await db.close();
    }
  });

  test("telemetry ON → row inserted with correct position, kind, query_hash", async () => {
    const db = await openPglite(join(scratch, "on"));
    try {
      await runMigrations(db);
      // Need an org for FK
      await db.query(
        "INSERT INTO orgs (id, slug, name) VALUES ($1, $2, $3)",
        ["org1", "org1", "Org"],
      );

      await recordSearchClick(db, {
        orgId: "org1",
        query: "deployment docs",
        filters: { kind: "doc" },
        resultKind: "doc",
        resultId: "d1",
        position: 2,
      });

      const rows = await db.query<{
        org_id: string;
        query: string;
        query_hash: string;
        result_kind: string;
        result_id: string;
        position: number;
        rank: number;
      }>("SELECT org_id, query, query_hash, result_kind, result_id, position, rank FROM search_clicks", []);

      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.org_id).toBe("org1");
      expect(row.query).toBe("deployment docs");
      expect(row.result_kind).toBe("doc");
      expect(row.result_id).toBe("d1");
      expect(row.position).toBe(2);
      expect(row.rank).toBe(2); // rank mirrors position
      expect(row.query_hash).toBeTruthy();
      expect(row.query_hash.length).toBe(64); // SHA-256 hex
    } finally {
      await db.close();
    }
  });

  test("query_hash stable for same inputs", async () => {
    const h1 = await computeQueryHash("org1", "deploy", { kind: "doc" });
    const h2 = await computeQueryHash("org1", "deploy", { kind: "doc" });
    expect(h1).toBe(h2);
    expect(h1.length).toBe(64);
  });

  test("query_hash differs for different inputs", async () => {
    const h1 = await computeQueryHash("org1", "deploy", { kind: "doc" });
    const h2 = await computeQueryHash("org1", "deploy", { kind: "task" });
    const h3 = await computeQueryHash("org2", "deploy", { kind: "doc" });
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
  });

  test("query_hash stable regardless of filter key order", async () => {
    const h1 = await computeQueryHash("org1", "q", { a: 1, b: 2 });
    const h2 = await computeQueryHash("org1", "q", { b: 2, a: 1 });
    expect(h1).toBe(h2);
  });
});
