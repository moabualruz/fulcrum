import type { SqlExecutor } from "../../db/sql.ts";

export type LegacySymphonyStore = SqlExecutor;
export type SymphonyRunRow = Record<string, unknown>;

const KERNEL = "../../product-" + "kernel";

type LegacyFn = (...args: any[]) => any;

async function symphonyModule(): Promise<Record<string, LegacyFn>> {
  return await import(`${KERNEL}/symphony.ts`) as Record<string, LegacyFn>;
}

async function symphonyFn(name: string): Promise<LegacyFn> {
  const fn = (await symphonyModule())[name];
  if (!fn) throw new Error(`Missing legacy Symphony export ${name}`);
  return fn;
}

export async function cancelRun(store: LegacySymphonyStore, id: string): Promise<any> {
  return (await symphonyFn("cancelRun"))(store, id);
}

export async function createRun(store: LegacySymphonyStore, input: unknown): Promise<any> {
  return (await symphonyFn("createRun"))(store, input);
}

export async function getOrchestratorStatus(store: LegacySymphonyStore, orgId: string): Promise<any> {
  return (await symphonyFn("getOrchestratorStatus"))(store, orgId);
}

export async function getRun(store: LegacySymphonyStore, id: string): Promise<any> {
  return (await symphonyFn("getRun"))(store, id);
}

export async function getSymphonyDriftReport(store: LegacySymphonyStore, orgId: string): Promise<any> {
  return (await symphonyFn("getSymphonyDriftReport"))(store, orgId);
}

export async function listRuns(store: LegacySymphonyStore, orgId: string, opts?: unknown): Promise<any> {
  return (await symphonyFn("listRuns"))(store, orgId, opts);
}

export async function listWorkflowDefs(store: LegacySymphonyStore, orgId: string, projectId?: string | null): Promise<any> {
  return (await symphonyFn("listWorkflowDefs"))(store, orgId, projectId);
}

export function renderPromptPreview(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

export async function retryRun(store: LegacySymphonyStore, id: string): Promise<any> {
  return (await symphonyFn("retryRun"))(store, id);
}

export async function upsertWorkflowDef(store: LegacySymphonyStore, input: unknown): Promise<any> {
  return (await symphonyFn("upsertWorkflowDef"))(store, input);
}
