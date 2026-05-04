import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createPublicApiRouter } from "../../src/api/hono.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function req(method: string, path: string, body?: unknown): Request {
  const headers: Record<string, string> = {
    Authorization: `Bearer test-jwt:${ORG_ID}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("P13#14 CSV import/export for tasks", () => {
  let originalFeatures: string | undefined;

  beforeEach(() => {
    originalFeatures = process.env["FULCRUM_FEATURES"];
    process.env["FULCRUM_FEATURES"] = "public-api,import-csv,export-csv";
  });

  afterEach(() => {
    if (originalFeatures === undefined) {
      delete process.env["FULCRUM_FEATURES"];
    } else {
      process.env["FULCRUM_FEATURES"] = originalFeatures;
    }
  });

  it("exports tasks to CSV with download headers", async () => {
    const app = createPublicApiRouter();

    await app.fetch(req("POST", "/api/v1/tasks", {
      orgId: ORG_ID,
      title: "CSV export task",
      status: "in_progress",
    }));

    const res = await app.fetch(req("GET", `/api/v1/connectors/export-csv?entity=tasks&projectId=${ORG_ID}`));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment; filename=\"tasks.csv\"");

    const csv = await res.text();
    expect(csv.split("\n")[0]).toBe("id,external_id,title,status,created_at");
    expect(csv).toContain("CSV export task");
    expect(csv).toContain("in_progress");
  });

  it("imports tasks from CSV and skips duplicate external IDs", async () => {
    const app = createPublicApiRouter();
    const csv = [
      "external_id,title,status",
      "EXT-1,Imported one,todo",
      "EXT-2,Imported two,done",
    ].join("\n");

    const first = await app.fetch(req("POST", "/api/v1/connectors/import-csv", {
      entity: "tasks",
      projectId: ORG_ID,
      csv,
    }));
    const second = await app.fetch(req("POST", "/api/v1/connectors/import-csv", {
      entity: "tasks",
      projectId: ORG_ID,
      csv,
    }));

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ created: 2, skipped: 0, errors: [] });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ created: 0, skipped: 2, errors: [] });

    const exported = await app.fetch(req("GET", `/api/v1/connectors/export-csv?entity=tasks&projectId=${ORG_ID}`));
    const text = await exported.text();
    expect(text).toContain("EXT-1");
    expect(text).toContain("Imported one");
    expect(text).toContain("EXT-2");
    expect(text).toContain("Imported two");
  });

  it("returns validation errors for malformed CSV", async () => {
    const app = createPublicApiRouter();

    const res = await app.fetch(req("POST", "/api/v1/connectors/import-csv", {
      entity: "tasks",
      projectId: ORG_ID,
      csv: "external_id,status\nEXT-1,todo",
    }));

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        columns: ["title"],
      },
    });
  });
});
