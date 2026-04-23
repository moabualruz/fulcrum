import {
  canEditFiles,
  canWriteCode,
  emitEvent,
  getDb,
  isL1,
  projectIdsFromPath,
} from 'fulcrum-agent-core'
import type { AgentRole, Db } from 'fulcrum-agent-core'
import { runRagLifecycleEvalSuite } from 'fulcrum-memory'
import type { RagLifecycleEvalRunResult } from 'fulcrum-memory'

export const RAG_EVAL_GATE_PATH_PATTERNS = [
  'specs/001-rag-lifecycle-hardening/**',
  'packages/memory/package.json',
  'packages/memory/src/**',
  'packages/core/src/db/**',
  'packages/core/src/types.ts',
  'packages/core/src/ids.ts',
  'packages/cli/src/index.ts',
  'packages/cli/src/commands/memory-rag-*.ts',
  'packages/cli/src/tool-registry.ts',
  'packages/cli/src/mcp-tools.ts',
  '.github/workflows/memory-eval.yml',
] as const

export interface RagEvalActor {
  kind: 'human' | 'agent'
  role: AgentRole
  id: string
}

export interface RagEvalAuthorization {
  authorized: boolean
  reason: string
}

export interface RagEvalCommandInput {
  workspace_id?: string
  project_id?: string
  suite: string
  actor?: Partial<RagEvalActor>
  include_model_heavy?: boolean
  include_accelerator_heavy?: boolean
  trigger_source?: 'local' | 'ci'
  trigger_scope?: 'rag_related' | 'non_rag' | 'manual'
  gate_required?: boolean
}

function normalizeActor(actor: Partial<RagEvalActor> | undefined, fallbackRole: AgentRole = 'software_engineer'): RagEvalActor {
  return {
    kind: actor?.kind ?? 'human',
    role: actor?.role ?? fallbackRole,
    id: actor?.id ?? 'local-operator',
  }
}

export function authorizeRagEvalOperation(actor: RagEvalActor): RagEvalAuthorization {
  if (actor.kind === 'human') return { authorized: true, reason: 'human_operator' }
  if (isL1(actor.role)) return { authorized: true, reason: 'l1_role' }
  if (canWriteCode(actor.role) || canEditFiles(actor.role)) return { authorized: true, reason: 'write_capable_role' }
  return { authorized: false, reason: 'actor_lacks_rag_maintenance_capability' }
}

function auditRagEval(
  input: {
    workspace_id: string
    project_id: string
    actor: RagEvalActor
    suite: string
    authorized: RagEvalAuthorization
    eval_run_id?: string
  },
  db: Db,
): void {
  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'rag_maintenance_audit',
    object_type: 'rag_eval_run',
    object_id: input.eval_run_id,
    actor_type: input.actor.kind,
    actor_id: input.actor.id,
    severity: input.authorized.authorized ? 'info' : 'warn',
    payload: {
      operation: 'eval',
      suite: input.suite,
      actor_role: input.actor.role,
      authorized: input.authorized.authorized,
      authorization_reason: input.authorized.reason,
      eval_run_id: input.eval_run_id,
    },
  }, db)
}

function resolveIds(input: RagEvalCommandInput): { workspace_id: string; project_id: string } {
  const ids = projectIdsFromPath(process.cwd())
  return {
    workspace_id: input.workspace_id ?? ids.workspace_id,
    project_id: input.project_id ?? ids.project_id,
  }
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*')
  return new RegExp(`^${escaped}$`)
}

export function isRagEvalGateRequiredForPaths(paths: string[]): boolean {
  const regexes = RAG_EVAL_GATE_PATH_PATTERNS.map(globToRegExp)
  return paths.some(path => regexes.some(regex => regex.test(path)))
}

export async function executeRagEvalCommand(input: RagEvalCommandInput, db: Db = getDb()): Promise<RagLifecycleEvalRunResult> {
  if (input.suite !== 'rag-lifecycle') {
    throw new Error(`unsupported eval suite: ${input.suite}`)
  }

  const ids = resolveIds(input)
  const actor = normalizeActor(input.actor)
  const auth = authorizeRagEvalOperation(actor)
  if (!auth.authorized) {
    auditRagEval({ ...ids, actor, suite: input.suite, authorized: auth }, db)
    throw new Error(`not authorized to run RAG eval: ${auth.reason}`)
  }

  const result = await runRagLifecycleEvalSuite({
    workspace_id: ids.workspace_id,
    project_id: ids.project_id,
    db,
    include_model_heavy: input.include_model_heavy,
    include_accelerator_heavy: input.include_accelerator_heavy,
    trigger_source: input.trigger_source,
    trigger_scope: input.trigger_scope,
    gate_required: input.gate_required,
  })

  auditRagEval({
    ...ids,
    actor,
    suite: input.suite,
    authorized: auth,
    eval_run_id: result.eval_run_id,
  }, db)
  return result
}
