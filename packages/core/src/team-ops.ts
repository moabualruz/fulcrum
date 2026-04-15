// packages/core/src/team-ops.ts
// Type-only interface for the @fulcrum/teams sibling package operations.
// Zero imports from other workspace packages — safe to import from any package.

export interface TeamOps {
  /** Create a new team template */
  createTeamTemplate(input: {
    name: string
    description?: string
    slots: Record<string, unknown>[]
    policy?: Record<string, unknown>
  }): Promise<Record<string, unknown>>

  /** Invoke (instantiate) a team from a template */
  invokeTeam(input: {
    template_id: string
    workspace_id: string
    project_id?: string
    purpose: string
    task_id?: string
    caller_agent_id: string
    caller_role: string
    initial_slots?: Record<string, string[]>
  }): Promise<Record<string, unknown>>

  /** Send a heartbeat / status update to a running team instance */
  heartbeatTeam(input: {
    instance_id: string
    status: string
    resolved_slots?: Record<string, string[]>
  }): Promise<Record<string, unknown>>

  /** Complete (or fail/cancel) a team instance */
  completeTeam(input: {
    instance_id: string
    final_status: 'completed' | 'failed' | 'cancelled'
  }): Promise<Record<string, unknown>>

  /** List team instances for a workspace (with optional filters) */
  listTeamInstances(input: {
    workspace_id: string
    project_id?: string
    status_category?: string
    limit?: number
    offset?: number
  }): Promise<Record<string, unknown>[]>

  /** Get detailed status for a team instance */
  getTeamStatus(input: {
    instance_id: string
    workspace_id: string
  }): Promise<Record<string, unknown>>

  /** Check whether a new team instance can start given concurrency caps */
  canStartTeam(db: unknown, input: {
    workspace_id: string
    project_id?: string
    template_id: string
  }): { allowed: boolean; reason?: string; counts: Record<string, number> }

  /** List available team templates */
  listTeamTemplates(input?: {
    limit?: number
    offset?: number
  }): Promise<Record<string, unknown>[]>
}
