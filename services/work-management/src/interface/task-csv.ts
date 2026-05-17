import type { EntityManager } from "typeorm";

import type {
  WebCsvExportResult,
  WebCsvImportResult,
} from "@work-management/application/work-item-csv.ts";
import type { AppContext } from "@work-management/domain/work-item.ts";

export type {
  WebCsvExportResult,
  WebCsvImportResult,
};

export async function exportTasksCsvForContext(
  em: EntityManager,
  ctx: AppContext,
): Promise<WebCsvExportResult> {
  const service = await import("@work-management/application/work-item-csv.ts");
  return service.exportTasksCsvForContext(em, ctx);
}

export async function importTasksFromCsvUpload(
  em: EntityManager,
  ctx: AppContext,
  input: { bytes: ArrayBuffer | Uint8Array; columnMap: Record<string, string> },
): Promise<WebCsvImportResult> {
  const service = await import("@work-management/application/work-item-csv.ts");
  return service.importTasksFromCsvUpload(em, ctx, input);
}
