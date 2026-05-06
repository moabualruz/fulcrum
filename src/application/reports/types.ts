export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface ReportSnapshotDto {
  id: string;
  orgId: string;
  projectId: string;
  scopeType: string;
  completedCount: number;
  pointsCompleted: number;
  date: Date;
}

export interface CreateReportSnapshotInput {
  projectId: string;
  scopeType: "sprint" | "project" | "epic" | "workspace";
  scopeId?: string;
  date: Date;
  completedCount?: number;
  pointsCompleted?: number;
}
