import "reflect-metadata";

import { describe, expect, it } from "bun:test";
import { UnprocessableEntityException } from "@nestjs/common";

import { exportGenericCsv } from "../../services/integration-hub/src/application/external-connectors/csv.ts";
import { createTaskCsvApplication } from "@work-management/application/tasks/csv.ts";
import {
  TaskPublicApiController,
  TaskPublicApiService,
} from "@work-management/interface/http/task-public-api.controller.ts";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function controller(): TaskPublicApiController {
  return new TaskPublicApiController(
    new TaskPublicApiService({
      featuresEnv: "public-api,import-csv,export-csv",
      csvApplication: createTaskCsvApplication(),
    }),
  );
}

describe("P13#14 CSV import/export for tasks", () => {
  it("exports tasks to CSV with download headers", async () => {
    const api = controller();
    const headers = new Map<string, string>();

    await api.importTasksCsv({
      entity: "tasks",
      projectId: PROJECT_ID,
      csv: "external_id,title,status\nEXT-0,CSV export task,in_progress",
    });
    const csv = await api.exportTasksCsv(
      { entity: "tasks", projectId: PROJECT_ID },
      { setHeader: (name, value) => headers.set(name, value) },
    );

    expect(headers.get("content-type")).toContain("text/csv");
    expect(headers.get("content-disposition")).toContain('attachment; filename="tasks.csv"');
    expect(csv.split("\n")[0]).toBe("id,external_id,title,status,created_at");
    expect(csv).toContain("CSV export task");
    expect(csv).toContain("in_progress");
  });

  it("imports tasks from CSV and skips duplicate external IDs", async () => {
    const api = controller();
    const csv = [
      "external_id,title,status",
      "EXT-1,Imported one,todo",
      "EXT-2,Imported two,done",
    ].join("\n");

    const first = await api.importTasksCsv({ entity: "tasks", projectId: PROJECT_ID, csv });
    const second = await api.importTasksCsv({ entity: "tasks", projectId: PROJECT_ID, csv });

    expect(first).toEqual({ created: 2, skipped: 0, errors: [] });
    expect(second).toEqual({ created: 0, skipped: 2, errors: [] });

    const exported = await api.exportTasksCsv({ entity: "tasks", projectId: PROJECT_ID });
    expect(exported).toContain("EXT-1");
    expect(exported).toContain("Imported one");
    expect(exported).toContain("EXT-2");
    expect(exported).toContain("Imported two");
  });

  it("returns validation errors for malformed CSV", async () => {
    const api = controller();

    try {
      await api.importTasksCsv({
        entity: "tasks",
        projectId: PROJECT_ID,
        csv: "external_id,status\nEXT-1,todo",
      });
      throw new Error("Expected malformed CSV to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual({
        error: {
          code: "VALIDATION_ERROR",
          columns: ["title"],
        },
      });
    }
  });

  it("redacts credential-like CSV columns with the shared export policy", () => {
    const csv = exportGenericCsv(
      [
        {
          id: "cred-1",
          name: "openai",
          encrypted_value: "ciphertext",
          token: "tok-secret",
          secret: "raw-secret",
          password: "pw-secret",
        },
      ],
      ["id", "name", "encrypted_value", "token", "secret", "password"],
    );

    expect(csv.split("\n")[0]).toBe("id,name");
    expect(csv).toContain("openai");
    expect(csv).not.toContain("ciphertext");
    expect(csv).not.toContain("tok-secret");
    expect(csv).not.toContain("raw-secret");
    expect(csv).not.toContain("pw-secret");
  });
});
