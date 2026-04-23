import type {
  ActionDefinition,
  AdditionalActionDefinitionInput,
  McpExposureDecision,
  McpExposureMode,
  McpExposurePlan,
  McpExposureRequest,
  RegistryEntry,
} from './tool-registry.js'

type ActionPlatformOverrides = Record<string, Partial<Pick<ActionDefinition, 'hooks' | 'availability'>>>

export function normalizeActionName(name: string): string {
  return name.replace(/^mcp__fulcrum__/, '')
}

export function buildActionDefinition(
  name: string,
  entry: RegistryEntry,
  actionPlatformOverrides: ActionPlatformOverrides,
): ActionDefinition {
  const actionName = normalizeActionName(name)
  const hookCoverage = entry.capabilities.hookEquivalent ? 'full' : 'none'
  const overrides = actionPlatformOverrides[actionName]
  return {
    action_name: actionName,
    cli: {
      primaryCommand: ['action', 'exec', actionName],
      compatibilityCommand: ['tool', 'exec', entry.schema?.name ?? actionName],
      stdinJson: true,
    },
    mcp: {
      toolName: entry.schema?.name,
      compatibilityOnly: entry.schema !== undefined,
    },
    hooks: {
      coverage: overrides?.hooks?.coverage ?? hookCoverage,
      nativePoints: overrides?.hooks?.nativePoints ?? (entry.capabilities.hookEquivalent ? ['fulcrum-hook'] : []),
      nativePlatforms: overrides?.hooks?.nativePlatforms ?? (entry.capabilities.hookEquivalent ? ['any'] : []),
      cliSubstitutable: true,
    },
    availability: {
      platforms: overrides?.availability?.platforms ?? ['any'],
      agentTypes: overrides?.availability?.agentTypes ?? (entry.capabilities.minRole ? [entry.capabilities.minRole] : undefined),
      runtimeCapabilities: overrides?.availability?.runtimeCapabilities ?? [],
    },
    fallbackOrder: entry.capabilities.hookEquivalent ? ['hook', 'cli', 'mcp'] : ['cli', 'mcp'],
    observability: {
      traceName: `action.${actionName}`,
      eventName: `${actionName}.executed`,
    },
  }
}

export function buildAdditionalActionDefinition(action: AdditionalActionDefinitionInput): ActionDefinition {
  const actionName = normalizeActionName(action.action_name)
  return {
    action_name: actionName,
    cli: {
      primaryCommand: ['action', 'exec', actionName],
      compatibilityCommand: ['tool', 'exec', action.mcp.name],
      stdinJson: true,
    },
    mcp: {
      toolName: action.mcp.name,
      compatibilityOnly: true,
    },
    hooks: {
      coverage: 'none',
      nativePoints: [],
      nativePlatforms: [],
      cliSubstitutable: true,
    },
    availability: {
      platforms: ['any'],
      runtimeCapabilities: [],
    },
    fallbackOrder: ['cli', 'mcp'],
    observability: {
      traceName: `action.${actionName}`,
      eventName: `${actionName}.executed`,
    },
  }
}

function matchesPlatform(action: ActionDefinition, platform?: string): boolean {
  if (!platform) return true
  return action.availability.platforms.includes('any') || action.availability.platforms.includes(platform)
}

function matchesAgentType(action: ActionDefinition, agentType?: string): boolean {
  if (!agentType) return true
  if (!action.availability.agentTypes || action.availability.agentTypes.length === 0) return true
  return action.availability.agentTypes.includes(agentType)
}

function matchesRuntimeCapabilities(
  action: ActionDefinition,
  platform: string | undefined,
  mode: McpExposureMode,
  runtimeCapabilities: Set<string>,
): boolean {
  if (mode === 'full') return true
  if (runtimeCapabilities.has('hooks') && action.hooks.coverage === 'full') {
    if (!platform) return false
    if (
      action.hooks.nativePlatforms.includes('any') ||
      action.hooks.nativePlatforms.includes(platform)
    ) {
      return false
    }
  }
  if (action.availability.runtimeCapabilities.length === 0) return true
  return action.availability.runtimeCapabilities.every(cap => runtimeCapabilities.has(cap))
}

function matchesExplicitSets(actionName: string, includeActions: Set<string>, excludeActions: Set<string>): boolean {
  if (excludeActions.has(actionName)) return false
  if (includeActions.size === 0) return true
  return includeActions.has(actionName)
}

async function resolveRolePolicy(profile?: string): Promise<{ allow: string[] | null; deny: Set<string>; warning?: string }> {
  if (!profile) return { allow: null, deny: new Set<string>() }

  const { getAgentDefinition } = await import('fulcrum-agent-core')
  const def = getAgentDefinition(profile)
  if (!def) {
    return {
      allow: null,
      deny: new Set<string>(),
      warning:
        `[fulcrum/mcp] WARNING: --profile '${profile}' — no agent definition found for this role.\n` +
        `  Role-based tool filtering is DISABLED; all tools matching other filters will be served.\n` +
        `  Run: fulcrum agent definition list\n`,
    }
  }

  return {
    allow: def.tools_allow === null ? null : def.tools_allow.map(name => normalizeActionName(name)),
    deny: new Set((def.tools_deny ?? []).map(name => normalizeActionName(name))),
  }
}

export function buildActionDefinitions(
  toolRegistry: Map<string, RegistryEntry>,
  additionalActions: AdditionalActionDefinitionInput[],
  actionPlatformOverrides: ActionPlatformOverrides,
): ActionDefinition[] {
  const builtIns = Array.from(toolRegistry.entries())
    .map(([name, entry]) => buildActionDefinition(name, entry, actionPlatformOverrides))
    .filter(action => action.mcp.toolName !== undefined)
  const additional = additionalActions.map(action => buildAdditionalActionDefinition(action))
  return [...builtIns, ...additional]
}

export async function buildMcpExposurePlanFromDefinitions(
  actionDefinitions: ActionDefinition[],
  request: McpExposureRequest = {},
): Promise<McpExposurePlan> {
  const mode = request.mode ?? 'filtered'
  const runtimeCapabilities = new Set(request.runtimeCapabilities ?? [])
  const includeActions = new Set((request.includeActions ?? []).map(name => normalizeActionName(name)))
  const excludeActions = new Set((request.excludeActions ?? []).map(name => normalizeActionName(name)))
  const rolePolicy = await resolveRolePolicy(request.profile ?? request.agentType)
  if (rolePolicy.warning) process.stderr.write(rolePolicy.warning)

  const decisions = actionDefinitions.map((action): McpExposureDecision => {
    const reasons: string[] = []
    let exposed = true

    if (!matchesExplicitSets(action.action_name, includeActions, excludeActions)) {
      exposed = false
      reasons.push(includeActions.size > 0 ? 'not_in_explicit_include_set' : 'explicitly_excluded')
    }

    if (exposed && !matchesPlatform(action, request.platform)) {
      exposed = false
      reasons.push(`platform_filtered:${request.platform}`)
    }

    if (exposed && !matchesAgentType(action, request.agentType)) {
      exposed = false
      reasons.push(`agent_type_filtered:${request.agentType}`)
    }

    if (exposed && !matchesRuntimeCapabilities(action, request.platform, mode, runtimeCapabilities)) {
      exposed = false
      reasons.push(runtimeCapabilities.has('hooks') && action.hooks.coverage === 'full'
        ? 'hook_covered'
        : 'runtime_capability_filtered')
    }

    if (exposed && rolePolicy.deny.has(action.action_name)) {
      exposed = false
      reasons.push('policy_deny')
    }

    if (exposed && rolePolicy.allow !== null && !rolePolicy.allow.includes(action.action_name)) {
      exposed = false
      reasons.push('policy_not_allowed')
    }

    if (exposed && mode === 'minimal' && includeActions.size === 0 && action.hooks.coverage === 'full') {
      exposed = false
      reasons.push('minimal_prefers_hook_or_cli')
    }

    if (exposed && mode === 'minimal' && includeActions.size === 0 && action.mcp.compatibilityOnly && action.hooks.coverage === 'none') {
      exposed = false
      reasons.push('minimal_prefers_cli')
    }

    return {
      toolName: action.mcp.toolName ?? action.action_name,
      actionName: action.action_name,
      exposed,
      reasons,
    }
  })

  const allowedToolNames = new Set(decisions.filter(decision => decision.exposed).map(decision => decision.toolName))
  return {
    mode,
    decisions,
    filter: (schema) => allowedToolNames.has(schema.name),
  }
}
