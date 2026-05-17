import {
  CsvValidationError,
  exportTasksCsv,
  importTasksCsv,
  type CsvImportResult,
  type CsvTask,
} from "@integration-hub/application/external-connectors/csv.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EntityManager } from "typeorm";

import { exportTasksToCsv } from "@integration-hub/application/data-exchange/csv-export.ts";
import { importCsv, type SkippedRecord } from "@integration-hub/application/data-exchange/csv-import.ts";
import { createTask } from "@work-management/application/work-item-commands.ts";
import { listTasks } from "@work-management/application/work-item-queries.ts";
import type { AppContext } from "@work-management/domain/work-item.ts";

export interface TaskCsvApplication {
  exportTasks(input: { projectId: string }): Promise<string>;
  importTasks(input: { projectId: string; csv: string }): Promise<CsvImportResult>;
}

export interface WebCsvImportResult {
  total: number;
  written: number;
  skipped: number;
  skipped_records: SkippedRecord[];
}

export interface WebCsvExportResult {
  bytes: ArrayBuffer;
  entityCount: number;
}

export function createTaskCsvApplication(): TaskCsvApplication {
  const tasks: CsvTask[] = [];

  return {
    async exportTasks({ projectId }) {
      return exportTasksCsv(tasks.filter((task) => task.id.startsWith(`${projectId}:`)));
    },

    async importTasks({ projectId, csv }) {
      return importTasksCsv(
        csv,
        ({ externalId, title, status }) => {
          tasks.push({
            id: `${projectId}:${crypto.randomUUID()}`,
            externalId,
            title,
            status: status ?? "todo",
            createdAt: new Date().toISOString(),
          });
        },
        (externalId) => tasks.some((task) => task.id.startsWith(`${projectId}:`) && task.externalId === externalId),
      );
    },
  };
}

export async function importTasksFromCsvUpload(
  em: EntityManager,
  ctx: AppContext,
  input: { bytes: ArrayBuffer | Uint8Array; columnMap: Record<string, string> },
): Promise<WebCsvImportResult> {
  const dir = await mkdtemp(join(tmpdir(), "fulcrum-import-"));
  const csvPath = join(dir, "upload.csv");
  try {
    const bytes = input.bytes instanceof Uint8Array ? input.bytes : Buffer.from(input.bytes);
    await writeFile(csvPath, bytes);
    const parsed = await importCsv(csvPath, input.columnMap, { dryRun: false });

    let written = 0;
    for (const record of parsed.records) {
      await createTask(em, ctx, {
        title: record["title"] as string,
        status: record["status"] ?? "pending",
        description: record["description"] ?? null,
        priority: record["priority"] ? Number(record["priority"]) : 0,
      });
      written += 1;
    }

    return {
      total: parsed.total,
      written,
      skipped: parsed.skipped,
      skipped_records: parsed.skipped_records,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function exportTasksCsvForContext(
  em: EntityManager,
  ctx: AppContext,
): Promise<WebCsvExportResult> {
  const rows = (await listTasks(em, ctx, {}))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .map((task) => ({
      id: task.id,
      org_id: task.orgId,
      project_id: task.projectId,
      parent_id: task.parentId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
    }));

  const dir = await mkdtemp(join(tmpdir(), "fulcrum-export-"));
  const outPath = join(dir, "tasks.csv");
  try {
    const result = await exportTasksToCsv(rows, outPath);
    return {
      bytes: await Bun.file(outPath).arrayBuffer(),
      entityCount: result.entity_count,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export { CsvValidationError };
