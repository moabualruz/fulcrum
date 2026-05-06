export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface DocDto {
  id: string;
  orgId: string;
  projectId: string | null;
  title: string;
  bodyMd: string;
  archived: boolean;
  updatedAt: Date;
}

export interface CreateDocInput {
  title: string;
  bodyMd?: string;
  projectId?: string | null;
}
