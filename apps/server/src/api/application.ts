export interface ApiKeyPrincipal {
  org_id: string;
  user_id: string;
}

export interface ApiKeyLookup {
  findApiKeyByHash(hash: string): Promise<ApiKeyPrincipal | null>;
}

export interface KernelAuditApplication {
  queryAuditEvents(input: {
    orgId: string;
    kind?: string;
    verb?: string;
    since?: string;
    until?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: unknown[]; total: number }>;
}

export interface KernelNotificationApplication {
  listNotifications(input: { orgId: string; userId: string }): Promise<{ data: unknown[] }>;
  markRead?(input: { orgId: string; userId: string; id: string }): Promise<unknown>;
}

export interface KernelSprintApplication {
  listSprints(input: { orgId: string; projectId: string }): Promise<{ data: unknown[] }>;
}

export interface KernelReportApplication {
  burndown(input: { orgId: string; projectId: string; sprintId?: string }): Promise<{ data: unknown[] }>;
  velocity(input: { orgId: string; projectId: string }): Promise<{ data: unknown[] }>;
}

export interface PublicApiApplication {
  audit?: KernelAuditApplication;
  notifications?: KernelNotificationApplication;
  sprints?: KernelSprintApplication;
  reports?: KernelReportApplication;
}

export const emptyPublicApiApplication: PublicApiApplication = {};
