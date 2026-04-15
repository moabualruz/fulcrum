// packages/monitor/src/types.ts

export interface DailyMetrics {
  workspace_id: string
  project_id: string | null
  date: string
  issues_created: number
  issues_closed: number
  tasks_created: number
  tasks_completed: number
  tasks_blocked: number
  runs_started: number
  runs_finished: number
  runs_failed: number
  memory_writes: number
  memory_recalls: number
}

export interface ProjectMetrics {
  workspace_id: string
  project_id: string
  date: string
  wip_count: number
  throughput: number
  lead_time_h: number | null
  blocked_h: number | null
}

export interface AgentMetrics {
  workspace_id: string
  agent_id: string
  date: string
  runs_started: number
  runs_completed: number
  runs_blocked: number
  runs_failed: number
  avg_duration_min: number | null
  handoff_count: number
}

export interface BurndownPoint {
  date: string
  total: number
  completed: number
  remaining: number
}

export interface BurndownData {
  project_id: string
  start_date: string
  end_date: string
  points: BurndownPoint[]
}

export interface Metrics {
  daily: DailyMetrics[]
  project: ProjectMetrics[]
}

export interface GetMetricsInput {
  workspace_id: string
  project_id?: string
  start_date?: string  // YYYY-MM-DD
  end_date?: string
}

export interface GetBurndownInput {
  workspace_id: string
  project_id: string
  start_date: string
  end_date: string
}

export interface GetAgentMetricsInput {
  workspace_id: string
  agent_id?: string
  start_date?: string
  end_date?: string
}

export interface MonitorServerConfig {
  port?: number  // default 7331
  host?: string  // default '127.0.0.1'
  workspace_id?: string
  bypass_auth?: boolean  // skip auth checks in tests
}

export interface MonitorServer {
  start(): Promise<void>
  stop(): Promise<void>
  port: number
  /** In-process fetch for unit testing without starting a real HTTP server */
  fetch(req: Request): Promise<Response> | Response
}

export interface RunReplay {
  run_id: string
  events: Array<{ event_id: string; event_type: string; payload: unknown; ts: string }>
}

export interface ReplayRunInput {
  run_id: string
}
