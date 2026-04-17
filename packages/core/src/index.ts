// Types
export type {
  Task, TaskStatus, AgentRun, AgentRunStatus, RunStatus, RunArtifacts, AgentRole,
  Memory, AgentProfile, AgentRoleDescriptor, WorkspaceStatus, WorkspaceStatusResult, PolicyConfig,
  StatusCategory, ProjectStatus, ProjectType, WriteMode,
  TaskRelationType, MemoryScope, MemoryKind, ArtifactType, EventType,
  FulcrumEvent, TaskRelation, RunEvent,
  EmbeddingProviderConfig, FulcrumConfig, PolicyCheckResult,
  HandoffPacket, CreateHandoffInput, HandoffPriority, HandoffScope, HandoffMode,
  TaskPacket, SpawnableRun, StartAgentRunInput,
  Workspace, ArtifactContract,
  TelemetrySpan,
  AgentProfileRow, CreateAgentProfileInput, UpdateAgentProfileInput,
} from './types.js'
export { FulcrumError } from './types.js'

// Config
export { loadConfig, defaultConfig, validateFulcrumConfig, readRawConfig, writeRawConfig } from './config.js'
export type { ValidationResult } from './config.js'

// DB
export { getDb, setDb, closeDb, _configureDb, globalDataDir, withTransaction, checkDbHealth } from './db/client.js'
export type { Db } from './db/client.js'
export { runMigrations } from './db/migrations.js'

// Tasks
export { listTasks, createTask, updateTask, rowToTaskBase } from './tasks.js'

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
  sweepStaleRuns,
  buildSpawnableRun,
  getRunHistory,
} from './runs.js'

// Notifications
export { notifyBlocked } from './notify.js'
export type { BlockedNotification } from './notify.js'

// Policy
export { checkPolicy } from './policy.js'

// Janitor
export { runJanitorCycle, startJanitor, decayMemories, consolidateMemories, deleteOldHookEvents } from './janitor.js'

// Memory (internal implementations — use fulcrum-memory for external callers)
// writeMemory and recallMemory are intentionally NOT re-exported here.
// External packages should import from 'fulcrum-memory' to get the full
// hybrid-search + RRF + Kuzu implementation instead of the core-only version.

// Embedding
export { initEmbedding, getTextEmbedder, getCodeEmbedder, getReranker, resetProviders, registerEmbeddingProvider } from './embedding/registry.js'
export { QUERY_PREFIX, DOC_PREFIX, truncateDimensions } from './embedding/local.js'

// Status
export { getWorkspaceStatus, buildCosContext, listAgentProfiles } from './status.js'

// Agent Definitions (MIGRATION_031)
export {
  createAgentDefinition, getAgentDefinition, updateAgentDefinition, listAgentDefinitions,
  GLOBAL_WORKSPACE_ID,
} from './agent-definitions.js'
export type { AgentDefinition, CreateAgentDefinitionInput, UpdateAgentDefinitionInput } from './types.js'

// File-based agent definition loader (GAP-AGENTDEF-5)
export { loadAgentDefsFromDir } from './agent-def-loader.js'
export type { AgentDefFile } from './agent-def-loader.js'

// A2A Agent Card
export { buildA2ACard, A2A_PROTOCOL_VERSION } from './a2a-card.js'
export type { A2AAgentCard, A2ASkill, A2ACapabilities, A2AProvider, A2AAuthentication, A2ASecurityScheme } from './a2a-card.js'

// IDs
export { newId, nextDisplayId, projectIdsFromPath } from './ids.js'

// Status Category
export { statusCategory } from './status-category.js'

// Handoffs
export { createHandoff, getHandoff, listHandoffs, claimHandoff, completeHandoff } from './handoffs.js'

// Events
export { emitEvent } from './events.js'
export type { EmitEventInput } from './events.js'

// Event bus (GAP-ARCH-8): in-process pub-sub wired into emitEvent()
export { getEventBus, setEventBus, resetEventBus } from './event-bus.js'
export type { FulcrumEventBus, EventHandler } from './event-bus.js'

// v2a PR 4 Task 22a — content-change event contract.
export { getContentChangeBus, setContentChangeBus, resetContentChangeBus } from './events/content-change.js'
export type { ContentChangeBus, ContentChangeHandler, ContentChangeEvent, ContentChangeKind, ContentChangeType } from './events/content-change.js'

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
export {
  DEFAULT_HEARTBEAT_TIMEOUT_SEC,
  DEFAULT_ESCALATION_TIMEOUT_SEC,
  DEFAULT_WIP_LIMIT,
  DEFAULT_MONITOR_PORT,
  DEFAULT_EMBED_DIM,
  DEFAULT_LOCK_TTL_SEC,
  JANITOR_INTERVAL_SEC,
  MEMORY_RANK_WEIGHTS,
  MEMORY_DECAY_FACTOR,
  MEMORY_DECAY_THRESHOLD,
  MEMORY_DECAY_MIN_DAYS_SINCE_ACCESS,
  MEMORY_DECAY_FLOOR,
  MEMORY_CONSOLIDATION_THRESHOLD,
  MEMORY_CONSOLIDATION_BATCH_SIZE,
} from './constants.js'

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

// Hook types (GAP-ARCH-3): pure types extracted from fulcrum-agent-cli so other
// packages can depend on them without pulling in policy/memory.
export type { HookCli, NormalizedHookEvent, HookPhase, HookContext, HookOutput, HookIO } from './hooks.js'

// Team management — IoC registry.
// fulcrum-teams implements TeamOps and registers itself at startup via:
//   import { createTeamOps } from 'fulcrum-teams'
//   import { setTeamOps } from 'fulcrum-agent-core'
//   setTeamOps(createTeamOps())
// This breaks the static circular dependency (teams → core is fine;
// core must never import teams).
export type { TeamOps } from './team-ops.js'
export { setTeamOps, getTeamOps } from './team-ops.js'
