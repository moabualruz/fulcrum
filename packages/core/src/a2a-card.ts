// packages/core/src/a2a-card.ts
// Build an A2A-protocol AgentCard from an AgentDefinition.
// Spec: https://google.github.io/A2A/specification/#agent-card

import type { AgentDefinition } from './types.js'

// ---------- A2A types ----------

export interface A2ASkill {
  id: string
  name: string
  description: string
  tags?: string[]
  examples?: string[]
  inputModes?: string[]
  outputModes?: string[]
}

export interface A2ACapabilities {
  streaming?: boolean
  pushNotifications?: boolean
  stateTransitionHistory?: boolean
}

export interface A2AProvider {
  organization: string
  url?: string
}

export interface A2AAuthentication {
  schemes: string[]
  credentials?: string | null
}

export interface A2AAgentCard {
  protocolVersion: string
  name: string
  description: string
  url: string
  version: string
  documentationUrl?: string
  capabilities: A2ACapabilities
  defaultInputModes: string[]
  defaultOutputModes: string[]
  skills: A2ASkill[]
  provider?: A2AProvider
  authentication?: A2AAuthentication
}

// ---------- Builder ----------

const DEFAULT_URL_BASE = 'https://fulcrum.local/agents'

/**
 * Build an A2A-protocol AgentCard from a Fulcrum AgentDefinition.
 *
 * The `executorUriOverride` parameter lets callers supply the real endpoint
 * URL for the agent, falling back to `def.executor_uri` then a default
 * placeholder derived from the agent role.
 */
export const A2A_PROTOCOL_VERSION = '0.3.0'

export function buildA2ACard(
  def: AgentDefinition,
  executorUriOverride?: string,
): A2AAgentCard {
  const url =
    executorUriOverride ??
    def.executor_uri ??
    `${DEFAULT_URL_BASE}/${def.role}`

  const canStream = def.capabilities.includes('streaming')
  const canPush = def.capabilities.includes('push_notifications')
  const hasHistory = def.capabilities.includes('state_transition_history')

  // Derive skills list from capabilities, falling back to one generic skill
  const skills: A2ASkill[] = deriveSkills(def)

  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: def.display_name,
    description: def.description,
    url,
    version: def.version,
    documentationUrl: `${DEFAULT_URL_BASE}/${def.role}/docs`,
    capabilities: {
      streaming: canStream || undefined,
      pushNotifications: canPush || undefined,
      stateTransitionHistory: hasHistory || undefined,
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills,
    authentication: { schemes: ['Bearer'] },
    provider: { organization: 'fulcrum', url: DEFAULT_URL_BASE },
  }
}

// ---------- Private helpers ----------

// Map well-known Fulcrum capability tags to A2A skill descriptors
const CAPABILITY_SKILL_MAP: Record<string, A2ASkill> = {
  task_management: {
    id: 'task_management',
    name: 'Task Management',
    description: 'Create, update, and track tasks within a workspace.',
    tags: ['tasks', 'planning'],
    inputModes: ['application/json'],
    outputModes: ['application/json'],
  },
  memory: {
    id: 'memory',
    name: 'Memory Operations',
    description: 'Store and recall semantic memories across sessions.',
    tags: ['memory', 'search'],
    inputModes: ['text/plain'],
    outputModes: ['application/json'],
  },
  code_review: {
    id: 'code_review',
    name: 'Code Review',
    description: 'Review code changes for correctness, style, and security.',
    tags: ['review', 'code'],
    inputModes: ['text/plain', 'application/json'],
    outputModes: ['text/plain', 'application/json'],
  },
  code_generation: {
    id: 'code_generation',
    name: 'Code Generation',
    description: 'Generate, refactor, and debug code.',
    tags: ['code', 'generation'],
    inputModes: ['text/plain'],
    outputModes: ['text/plain'],
  },
  planning: {
    id: 'planning',
    name: 'Planning',
    description: 'Decompose goals into actionable tasks and milestones.',
    tags: ['planning', 'decomposition'],
    inputModes: ['text/plain'],
    outputModes: ['application/json'],
  },
  research: {
    id: 'research',
    name: 'Research',
    description: 'Gather and synthesize information from available sources.',
    tags: ['research', 'synthesis'],
    inputModes: ['text/plain'],
    outputModes: ['text/plain', 'application/json'],
  },
  orchestration: {
    id: 'orchestration',
    name: 'Orchestration',
    description: 'Coordinate multiple agents across a workflow.',
    tags: ['orchestration', 'coordination'],
    inputModes: ['application/json'],
    outputModes: ['application/json'],
  },
}

function deriveSkills(def: AgentDefinition): A2ASkill[] {
  const skills: A2ASkill[] = []

  for (const cap of def.capabilities) {
    const mapped = CAPABILITY_SKILL_MAP[cap]
    if (mapped) skills.push(mapped)
  }

  // Always include a generic task-execution skill so the card is never empty
  if (skills.length === 0) {
    skills.push({
      id: `${def.role}_execution`,
      name: def.display_name,
      description: def.description,
      tags: [def.role],
      inputModes: ['text/plain', 'application/json'],
      outputModes: ['text/plain', 'application/json'],
    })
  }

  return skills
}
