export class AgentRunRouteParamsDto {
  identifier!: string;
}

export class AgentRunListQueryDto {
  orgId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export class AgentRunIssueListQueryDto {
  orgId?: string;
  states?: string;
  limit?: number;
}

export class AgentRunRefreshResponseDto {
  runs!: unknown[];
  count!: number;
}

export class AgentRunDispatchBodyDto {
  projectId?: string;
  taskId?: string;
  agent?: string;
  traceId?: string;
  dependencyTree?: string[];
}
