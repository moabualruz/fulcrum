import type { AgentRole, RuntimeDataProfile, RuntimeExperimentStatus } from 'fulcrum-agent-core'
import type { RagRebuildDomain } from 'fulcrum-memory'
import { TOOL_SCHEMA_MAP } from './mcp-tools.js'
import type { HandlerDeps, RegistryEntry } from './tool-registry.js'

function stripNullish<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => stripNullish(item)) as T
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (nested === null || nested === undefined) continue
    out[key] = stripNullish(nested)
  }
  return out as T
}

function ws(args: Record<string, unknown>, deps: HandlerDeps): string {
  return (args['workspace_id'] as string | undefined) ?? deps.workspace_id
}

function proj(args: Record<string, unknown>, deps: HandlerDeps): string {
  return (args['project_id'] as string | undefined) ?? deps.project_id
}

function actor(deps: HandlerDeps): { kind: 'agent'; role: AgentRole; id: string } {
  return {
    kind: 'agent',
    role: (deps.trusted_caller_role ?? 'software_engineer') as AgentRole,
    id: deps.trusted_caller_run_id ?? 'mcp',
  }
}

export function registerRagToolEntries(registry: Map<string, RegistryEntry>): void {
  registry.set('get_rag_rebuild_plan', {
    schema: TOOL_SCHEMA_MAP.get('get_rag_rebuild_plan'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { executeRagRebuildCommand } = await import('./commands/memory-rag-lifecycle.js')
      return executeRagRebuildCommand({
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
        mode: 'plan',
        runtime_profile: args['runtime_profile'] as RuntimeDataProfile | undefined,
        domains: args['domains'] as RagRebuildDomain[] | undefined,
        allow_empty: args['allow_empty'] as boolean | undefined,
        actor: actor(deps),
      })
    },
  })

  registry.set('get_rag_rebuild_dry_run', {
    schema: TOOL_SCHEMA_MAP.get('get_rag_rebuild_dry_run'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { executeRagRebuildCommand } = await import('./commands/memory-rag-lifecycle.js')
      return executeRagRebuildCommand({
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
        mode: 'dry_run',
        runtime_profile: args['runtime_profile'] as RuntimeDataProfile | undefined,
        domains: args['domains'] as RagRebuildDomain[] | undefined,
        allow_empty: args['allow_empty'] as boolean | undefined,
        actor: actor(deps),
      })
    },
  })

  registry.set('start_rag_rebuild', {
    schema: TOOL_SCHEMA_MAP.get('start_rag_rebuild'),
    capabilities: { readOnly: false, destructive: true, hookEquivalent: false },
    handler: async (args, deps) => {
      const { executeRagRebuildCommand } = await import('./commands/memory-rag-lifecycle.js')
      return executeRagRebuildCommand({
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
        mode: 'execute',
        runtime_profile: args['runtime_profile'] as RuntimeDataProfile | undefined,
        confirm_profile: args['confirm_profile'] as RuntimeDataProfile | undefined,
        verification_refs: args['verification_refs'] as string[] | undefined,
        domains: args['domains'] as RagRebuildDomain[] | undefined,
        allow_empty: args['allow_empty'] as boolean | undefined,
        actor: actor(deps),
      })
    },
  })

  registry.set('get_runtime_profile_paths', {
    schema: TOOL_SCHEMA_MAP.get('get_runtime_profile_paths'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args) => {
      const { inspectRuntimeProfilePaths } = await import('./commands/memory-rag-lifecycle.js')
      return inspectRuntimeProfilePaths({
        profile: args['runtime_profile'] as RuntimeDataProfile | undefined,
      })
    },
  })

  registry.set('get_rag_rebuild_report', {
    schema: TOOL_SCHEMA_MAP.get('get_rag_rebuild_report'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { getRagRebuildReport } = await import('./commands/memory-rag-lifecycle.js')
      return getRagRebuildReport({
        report_id: args['report_id'] as string,
        workspace_id: ws(args, deps),
        runtime_profile: args['runtime_profile'] as RuntimeDataProfile | undefined,
      }, args['runtime_profile'] ? undefined : deps.db)
    },
  })

  registry.set('get_rag_health', {
    schema: TOOL_SCHEMA_MAP.get('get_rag_health'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { executeRagHealthCommand } = await import('./commands/memory-rag-health.js')
      return executeRagHealthCommand({
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
        vault_path: args['vault_path'] as string | undefined,
        runtime_profile: args['runtime_profile'] as RuntimeDataProfile | undefined,
        out_of_scope_domains: args['out_of_scope_domains'] as string[] | undefined,
      }, args['runtime_profile'] ? undefined : deps.db)
    },
  })

  registry.set('get_rag_repair_plan', {
    schema: TOOL_SCHEMA_MAP.get('get_rag_repair_plan'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { executeRagRepairPlanCommand } = await import('./commands/memory-rag-health.js')
      return executeRagRepairPlanCommand({
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
        runtime_profile: args['runtime_profile'] as RuntimeDataProfile | undefined,
      }, args['runtime_profile'] ? undefined : deps.db)
    },
  })

  registry.set('search_context', {
    schema: TOOL_SCHEMA_MAP.get('search_context'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { searchContext } = await import('fulcrum-memory')
      return searchContext({
        query: args['query'] as string,
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
        limit: args['limit'] as number | undefined,
        context_budget_tokens: args['context_budget_tokens'] as number | undefined,
        explain: args['explain'] === undefined ? undefined : Boolean(args['explain']),
        persist: args['persist'] === undefined ? undefined : Boolean(args['persist']),
        include_graph: args['include_graph'] === undefined ? undefined : Boolean(args['include_graph']),
        graph_mode: args['graph_mode'] as 'local' | 'global_summary' | 'drift' | undefined,
        graph_depth: args['graph_depth'] as number | undefined,
      }, deps.db)
    },
  })

  registry.set('run_rag_eval', {
    schema: TOOL_SCHEMA_MAP.get('run_rag_eval'),
    capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { executeRagEvalCommand } = await import('./commands/memory-rag-eval.js')
      return executeRagEvalCommand({
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
        suite: args['suite'] as string,
        include_model_heavy: args['include_model_heavy'] as boolean | undefined,
        include_accelerator_heavy: args['include_accelerator_heavy'] as boolean | undefined,
        trigger_source: args['trigger_source'] as 'local' | 'ci' | undefined,
        trigger_scope: args['trigger_scope'] as 'rag_related' | 'non_rag' | 'manual' | undefined,
        gate_required: args['gate_required'] as boolean | undefined,
        actor: actor(deps),
      }, deps.db)
    },
  })

  registry.set('list_runtime_experiments', {
    schema: TOOL_SCHEMA_MAP.get('list_runtime_experiments'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { listRuntimeExperimentsCommand } = await import('./commands/memory-runtime-experiments.js')
      return listRuntimeExperimentsCommand({
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
        status: args['status'] as RuntimeExperimentStatus | undefined,
        limit: args['limit'] as number | undefined,
      }, deps.db)
    },
  })

  registry.set('get_runtime_experiment_report', {
    schema: TOOL_SCHEMA_MAP.get('get_runtime_experiment_report'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { getRuntimeExperimentReportCommand } = await import('./commands/memory-runtime-experiments.js')
      return getRuntimeExperimentReportCommand({
        runtime_experiment_id: args['runtime_experiment_id'] as string,
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
      }, deps.db)
    },
  })

  registry.set('adopt_runtime_experiment', {
    schema: TOOL_SCHEMA_MAP.get('adopt_runtime_experiment'),
    capabilities: { readOnly: false, destructive: true, hookEquivalent: false },
    handler: async (args, deps) => {
      const { adoptRuntimeExperimentCommand } = await import('./commands/memory-runtime-experiments.js')
      return adoptRuntimeExperimentCommand({
        runtime_experiment_id: args['runtime_experiment_id'] as string,
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
      }, deps.db)
    },
  })

  registry.set('rollback_runtime_experiment', {
    schema: TOOL_SCHEMA_MAP.get('rollback_runtime_experiment'),
    capabilities: { readOnly: false, destructive: true, hookEquivalent: false },
    handler: async (args, deps) => {
      const { rollbackRuntimeExperimentCommand } = await import('./commands/memory-runtime-experiments.js')
      return rollbackRuntimeExperimentCommand({
        runtime_experiment_id: args['runtime_experiment_id'] as string,
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
      }, deps.db)
    },
  })

  registry.set('get_rag_query_trace', {
    schema: TOOL_SCHEMA_MAP.get('get_rag_query_trace'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { readRagQueryTrace } = await import('fulcrum-memory')
      return readRagQueryTrace({
        query_trace_id: args['query_trace_id'] as string,
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
      }, deps.db)
    },
  })

  registry.set('search_code', {
    schema: TOOL_SCHEMA_MAP.get('search_code'),
    capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
    handler: async (args, deps) => {
      const { searchCode } = await import('fulcrum-memory')
      const envelope = await searchCode({
        workspace_id: ws(args, deps),
        project_id: proj(args, deps),
        text: args['text'] as string | undefined,
        symbol: args['symbol'] as string | undefined,
        lang: args['lang'] as string | undefined,
        path: args['path'] as string | undefined,
        package: args['package'] as string | undefined,
        module: args['module'] as string | undefined,
        dependency: args['dependency'] as string | undefined,
        changed_files: args['changed_files'] as string[] | undefined,
        scope: args['scope'] as 'session' | 'project' | 'workspace' | 'global' | undefined,
        min_score: args['min_score'] as number | undefined,
        limit: args['limit'] as number | undefined,
        caller_run_id: deps.trusted_caller_run_id,
        caller_role: deps.trusted_caller_role,
        explain: args['explain'] === undefined ? undefined : Boolean(args['explain']),
        persist: args['persist'] === undefined ? undefined : Boolean(args['persist']),
      })
      return stripNullish(envelope)
    },
  })
}
