// Types
export type {
  Task, TaskStatus, AgentRun, AgentRunStatus, RunStatus, RunArtifacts, AgentRole,
  Memory, AgentProfile, WorkspaceStatus, WorkspaceStatusResult, PolicyConfig,
  StatusCategory, ProjectStatus, ProjectType, WriteMode,
  TaskRelationType, MemoryScope, MemoryKind, ArtifactType, EventType,
  FulcrumEvent, TaskRelation,
  EmbeddingProviderConfig, FulcrumConfig, PolicyCheckResult,
  HandoffPacket, CreateHandoffInput, HandoffPriority, HandoffScope, HandoffMode,
  TaskPacket, SpawnableRun, StartAgentRunInput,
  Workspace, ArtifactContract,
  TelemetrySpan,
  AgentProfileRow, CreateAgentProfileInput, UpdateAgentProfileInput,
} from './types.js'
export { FulcrumError } from './types.js'

// Config
export { loadConfig, defaultConfig } from './config.js'

// DB
export { getDb, setDb, closeDb, _configureDb, globalDataDir } from './db/client.js'
export { runMigrations } from './db/migrations.js'

// Tasks
export { listTasks, createTask, updateTask } from './tasks.js'

// Workspaces
export { createWorkspace, getWorkspace, listWorkspaces, updateWorkspace } from './workspaces.js'
export type { CreateWorkspaceInput, UpdateWorkspaceInput } from './workspaces.js'

// Projects
export { createProject, getProject, listProjects, updateProject } from './projects.js'
export type { Project, CreateProjectInput, UpdateProjectInput, ListProjectsInput } from './projects.js'

// Runs
export {
  startAgentRun,
  heartbeatAgentRun,
  getAgentRunStatus,
  completeAgentRun,
  blockAgentRun,
  escalateRun,
  buildSpawnableRun,
} from './runs.js'

// Policy
export { checkPolicy } from './policy.js'

// Janitor
export { runJanitorCycle, startJanitor } from './janitor.js'

// Memory (internal implementations — use @fulcrum/memory for external callers)
// writeMemory and recallMemory are intentionally NOT re-exported here.
// External packages should import from '@fulcrum/memory' to get the full
// hybrid-search + RRF + Kuzu implementation instead of the core-only version.

// Embedding
export { initEmbedding, getTextEmbedder, getCodeEmbedder, getReranker, resetProviders } from './embedding/registry.js'

// Status
export { getWorkspaceStatus, buildCosContext, listAgentProfiles } from './status.js'

// Agent Definitions (MIGRATION_031)
export {
  createAgentDefinition, getAgentDefinition, updateAgentDefinition, listAgentDefinitions,
} from './agent-definitions.js'
export type { AgentDefinition, CreateAgentDefinitionInput, UpdateAgentDefinitionInput } from './types.js'

// IDs
export { newId, nextDisplayId } from './ids.js'

// Status Category
export { statusCategory } from './status-category.js'

// Handoffs
export { createHandoff, getHandoff, listHandoffs, claimHandoff, completeHandoff } from './handoffs.js'

// Events
export { emitEvent } from './events.js'
export type { EmitEventInput } from './events.js'

// CoS Context Builder
export { buildWorldState } from './cos-context.js'
export type { CoSWorldState, BuildWorldStateInput } from './cos-context.js'

// CoS Response Parser
export { parseCoSResponse, applyCoSResponse } from './cos-parser.js'
export type { CoSResponse } from './cos-parser.js'

// Locks
export { acquireLock, releaseLock, listLocks, cleanupExpiredLocks } from './locks.js'
export type { Lock, AcquireLockInput, AcquireLockResult } from './locks.js'

// Telemetry
export { startSpan, endSpan, getTrace } from './telemetry/spans.js'
export type { StartSpanInput, EndSpanInput } from './telemetry/spans.js'
export { initOtel, shutdownOtel, getOtelTracer } from './telemetry/otel.js'

// Constants
export * from './constants.js'

// Roles
export {
  L1_ROLES,
  isL1,
  roleCapabilities,
  canInvokeTeams,
  canMerge,
  canWriteCode,
  canEditFiles,
} from './roles.js'
export type { RoleCapabilities } from './roles.js'

// Agent profiles (dynamic, DB-backed — L-3)
export {
  createAgentProfile,
  getAgentProfile,
  listAgentProfileRows,
  updateAgentProfile,
  deleteAgentProfile,
} from './agent-profiles.js'

// Team management (L-4) — re-exported via a lazy getter to avoid a static
// circular dependency. @fulcrum/teams imports from @fulcrum/core, so core
// cannot statically import from teams. MCP tool handlers and other async
// callers should use `const teams = await getTeamOps()` to access:
//   createTeamTemplate, invokeTeam, heartbeatTeam, completeTeam,
//   listTeamInstances, getTeamStatus, canStartTeam.
// The return type is `Record<string, unknown>` because @fulcrum/teams is a
// workspace sibling that depends on core and therefore isn't statically
// visible to core's tsconfig (same pattern as janitor.ts → @fulcrum/worktrees).
// Callers should import types from '@fulcrum/teams' directly when needed.
export async function getTeamOps(): Promise<Record<string, unknown>> {
  // @ts-ignore — dynamic sibling import; resolves at runtime via pnpm workspace
  const mod = await import('@fulcrum/teams')
  return mod as unknown as Record<string, unknown>
}
