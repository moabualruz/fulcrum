export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface SprintDto {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  status: string;
  startDate: Date;
  endDate: Date;
}

export interface CreateSprintInput {
  projectId: string;
  name: string;
  startDate: Date;
  endDate: Date;
}
