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

export type ReportScopeType = "sprint" | "project" | "epic" | "workspace";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface BurndownPoint {
  date: string;
  pointsRemaining: number;
  ideal: number;
}

export interface ReportBurndownInput {
  projectId: string;
  sprintId: string;
}

export interface ScopedReportInput {
  scopeType: ReportScopeType;
  scopeId?: string;
  dateRange: DateRange;
}

export interface ReportExportCsvInput extends ScopedReportInput {
  reportType:
    | "burndown"
    | "burnup"
    | "velocity"
    | "cfd"
    | "cycleTime"
    | "leadTime"
    | "throughput"
    | "wipOverTime"
    | "workload"
    | "blockedItems"
    | "staleIssues"
    | "progressRollup";
  lastN: number;
  thresholdDays: number;
}
