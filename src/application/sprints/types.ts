import type { CloseSprintResult, SprintOutput } from "../../services/SprintService.ts";

export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export type SprintDto = SprintOutput;
export type CloseSprintDto = CloseSprintResult;

export interface CreateSprintInput {
  projectId: string;
  name: string;
  goal?: string | null;
  startDate: Date;
  endDate: Date;
  capacityPoints?: number | null;
}

export interface ListSprintsInput {
  projectId?: string;
  status?: string;
}

export interface UpdateSprintInput {
  id: string;
  name?: string;
  goal?: string | null;
  startDate?: Date;
  endDate?: Date;
  capacityPoints?: number | null;
}

export interface CloseSprintInput {
  id: string;
  unfinishedDisposition: "next-sprint" | "backlog";
  taskDispositions?: Array<{ taskId: string; disposition: "next-sprint" | "backlog" }>;
}
