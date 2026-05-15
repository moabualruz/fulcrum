import type { EntityManager } from "typeorm";

import type {
  BurndownPoint,
  CfdPoint,
  CycleTimeStats,
  NarrationDeps,
  NarrationInput,
  NarrationResult,
  ReportsData,
  Sprint,
  ThroughputPoint,
  VelocityBar,
  WipPoint,
} from "@work-management/application/report-dashboard.ts";

export type {
  BurndownPoint,
  CfdPoint,
  CycleTimeStats,
  NarrationDeps,
  NarrationInput,
  NarrationResult,
  ReportsData,
  Sprint,
  ThroughputPoint,
  VelocityBar,
  WipPoint,
};

export async function listSprints(em: EntityManager, projectId: string): Promise<Sprint[]> {
  const service = await import("@work-management/application/report-dashboard.ts");
  return service.listSprints(em, projectId);
}

export async function loadBurndown(
  em: EntityManager,
  projectId: string,
  sprintId: string,
): Promise<BurndownPoint[]> {
  const service = await import("@work-management/application/report-dashboard.ts");
  return service.loadBurndown(em, projectId, sprintId);
}

export async function loadVelocity(
  em: EntityManager,
  projectId: string,
  windowSize?: number,
): Promise<VelocityBar[]> {
  const service = await import("@work-management/application/report-dashboard.ts");
  return service.loadVelocity(em, projectId, windowSize);
}

export async function loadCycleTime(em: EntityManager, projectId: string): Promise<CycleTimeStats> {
  const service = await import("@work-management/application/report-dashboard.ts");
  return service.loadCycleTime(em, projectId);
}

export async function loadThroughput(em: EntityManager, projectId: string): Promise<ThroughputPoint[]> {
  const service = await import("@work-management/application/report-dashboard.ts");
  return service.loadThroughput(em, projectId);
}

export async function loadWip(em: EntityManager, projectId: string): Promise<WipPoint[]> {
  const service = await import("@work-management/application/report-dashboard.ts");
  return service.loadWip(em, projectId);
}

export async function loadCfd(em: EntityManager, projectId: string): Promise<CfdPoint[]> {
  const service = await import("@work-management/application/report-dashboard.ts");
  return service.loadCfd(em, projectId);
}

export async function loadReports(
  em: EntityManager,
  projectId: string,
  sprintId?: string,
): Promise<ReportsData> {
  const service = await import("@work-management/application/report-dashboard.ts");
  return service.loadReports(em, projectId, sprintId);
}

export async function generateNarration(
  input: NarrationInput,
  deps: NarrationDeps = {},
): Promise<NarrationResult> {
  const service = await import("@work-management/application/report-dashboard.ts");
  return service.generateNarration(input, deps);
}
