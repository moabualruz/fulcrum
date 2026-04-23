import type { Db } from 'fulcrum-agent-core'
import type { ToolSchema } from './mcp-tools.js'

export interface HandlerDeps {
  db: Db
  workspace_id: string
  project_id: string
  trusted_caller_role?: string
  trusted_caller_run_id?: string
}

export interface ToolCapabilities {
  readOnly: boolean
  destructive: boolean
  hookEquivalent: boolean
  minRole?: string
}

export interface RegistryEntry {
  schema: ToolSchema | undefined
  capabilities: ToolCapabilities
  handler: (args: Record<string, unknown>, deps: HandlerDeps) => Promise<unknown>
}

export interface ActionCliContract {
  primaryCommand: string[]
  compatibilityCommand?: string[]
  stdinJson: boolean
}

export interface ActionMcpContract {
  toolName?: string
  compatibilityOnly: boolean
}

export interface ActionHookContract {
  coverage: 'none' | 'partial' | 'full'
  nativePoints: string[]
  nativePlatforms: string[]
  cliSubstitutable: boolean
}

export interface ActionAvailability {
  platforms: string[]
  agentTypes?: string[]
  runtimeCapabilities: string[]
}

export interface ActionObservability {
  traceName: string
  eventName: string
}

export interface ActionDefinition {
  action_name: string
  cli: ActionCliContract
  mcp: ActionMcpContract
  hooks: ActionHookContract
  availability: ActionAvailability
  fallbackOrder: Array<'hook' | 'cli' | 'mcp'>
  observability: ActionObservability
}

export type McpExposureMode = 'full' | 'filtered' | 'minimal'

export interface McpExposureRequest {
  mode?: McpExposureMode
  profile?: string
  agentType?: string
  platform?: string
  runtimeCapabilities?: string[]
  includeActions?: string[]
  excludeActions?: string[]
}

export interface McpExposureDecision {
  toolName: string
  actionName: string
  exposed: boolean
  reasons: string[]
}

export interface McpExposurePlan {
  mode: McpExposureMode
  decisions: McpExposureDecision[]
  filter: (schema: ToolSchema) => boolean
}

export interface AdditionalActionDefinitionInput {
  action_name: string
  mcp: ToolSchema
}
