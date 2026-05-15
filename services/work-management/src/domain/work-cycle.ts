export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface SprintOutput {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  goal: string | null;
  startDate: Date;
  endDate: Date;
  status: "planned" | "active" | "completed";
  capacityPoints: number | null;
  createdAt: Date;
}

export interface MetricsSnapshot {
  id: string;
  projectId: string;
  sprintId: string;
  completedCount: number;
  pointsCompleted: number;
  pointsRemaining: number;
  wipCount: number;
}

export interface CloseSprintResult {
  closed: true;
  sprint: SprintOutput;
  metricsSnapshot: MetricsSnapshot;
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
