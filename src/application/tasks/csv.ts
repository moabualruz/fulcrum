import {
  CsvValidationError,
  exportTasksCsv,
  importTasksCsv,
  type CsvImportResult,
  type CsvTask,
} from "../../connectors/csv.ts";

export interface TaskCsvApplication {
  exportTasks(input: { projectId: string }): Promise<string>;
  importTasks(input: { projectId: string; csv: string }): Promise<CsvImportResult>;
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

export { CsvValidationError };
