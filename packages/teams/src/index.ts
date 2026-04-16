// packages/teams/src/index.ts
// Explicit named exports — avoids wildcard `export *` so tree-shaking works
// and internal symbols don't accidentally become public API surface.

// Types
export type { AgentRole } from '@moabualruz/fulcrum-core'
export { L1_ROLES } from '@moabualruz/fulcrum-core'
export type {
  TeamSlot,
  CommunicationMode,
  WorktreePolicy,
  BudgetClass,
  LatencyClass,
  QualityClass,
  TeamPolicy,
  TeamTemplate,
  TeamInstance,
  TeamMember,
  TeamStatus,
  CreateTeamTemplateInput,
  InvokeTeamInput,
  HeartbeatTeamInput,
  CompleteTeamInput,
  ListTeamInstancesInput,
  GetTeamStatusInput,
  ScheduleCounts,
  ScheduleDecision,
  SchedulerConfig,
} from './types.js'

// Schema migrations (used by CLI startup to ensure DB is up to date)
export { runMigration006Teams, runMigration006TeamsHeartbeat } from './schema.js'

// Team operations
export {
  createTeamTemplate,
  invokeTeam,
  heartbeatTeam,
  completeTeam,
  listTeamTemplates,
  listTeamInstances,
  getTeamStatus,
  TeamInstanceHeartbeat,
} from './teams.js'
export type { ListTeamTemplatesInput } from './teams.js'

// Scheduler
export { canStartTeam } from './scheduler.js'

// Factory (IoC wiring for core)
export { createTeamOps } from './factory.js'
