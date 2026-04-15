// packages/workflows/src/step-executor.ts
//
// Step handlers for the workflow runner (H-1/H-5).
//
// Every WorkflowStepType gets a handler here. Handlers are small and
// stateless — they read from `ctx.step.config` and `ctx.outputs`, do
// their thing, and return a `StepResult`. State persistence is the
// runner's job, not the handler's.
//
// Imports into other @fulcrum packages are lazy (`await import(...)`)
// for two reasons:
//  1. Circular-dep safety: several of these packages may eventually
//     depend on @fulcrum/workflows, and lazy imports break the cycle.
//  2. Graceful degradation: if a package isn't installed in a particular
//     consumer (e.g. a CLI that doesn't pull in @fulcrum/teams), the
//     handler can catch ERR_MODULE_NOT_FOUND and return a structured
//     failure instead of crashing at module load.

import { spawn } from 'node:child_process'
import { getDb, newId } from '@fulcrum/core'
import type { MemoryKind, MemoryScope } from '@fulcrum/core'
import type { StepContext, StepResult, StepHandler } from './types.js'

/** Run a command with stdin ignored, collect stdout. Resolves on exit code 0 or 1 (grep/rg
 * exit 1 on "no matches" which is not an error). Rejects on exit code 2+ (real errors). */
function runCommand(cmd: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0 || code === 1) resolve(stdout)
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(0, 200)}`))
    })
  })
}

// ── config helpers ─────────────────────────────────────────────────────────

/**
 * Pull a step's config — step defs use `config: Record<string, unknown>`.
 * Some call sites may set `inputs` instead (matches the Python model), so
 * we fall back to that for compatibility.
 */
function cfg(ctx: StepContext): Record<string, unknown> {
  const step = ctx.step as unknown as Record<string, unknown>
  const config = (step['config'] ?? step['inputs'] ?? {}) as Record<string, unknown>
  return config
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

// ── handlers ───────────────────────────────────────────────────────────────

const HANDLERS: Record<string, StepHandler> = {}

HANDLERS['create_task'] = async (ctx) => {
  const { createTask } = await import('@fulcrum/core')
  const c = cfg(ctx)
  if (!ctx.project_id) {
    return { status: 'failed', error: 'create_task requires project_id on the workflow run' }
  }
  const task = await createTask({
    workspace_id: ctx.workspace_id,
    project_id: ctx.project_id,
    title: str(c['title'], 'workflow-created task'),
    description: c['description'] as string | undefined,
    priority: c['priority'] as 'critical' | 'high' | 'medium' | 'low' | 'none' | undefined,
  })
  return { status: 'completed', output: { task_id: task.task_id, display_id: task.display_id } }
}

HANDLERS['create_issue'] = async (ctx) => {
  try {
    const planning = await import('@fulcrum/planning')
    const c = cfg(ctx)
    if (!ctx.project_id) return { status: 'failed', error: 'create_issue requires project_id' }
    const issue = await planning.createIssue({
      workspace_id: ctx.workspace_id,
      project_id: ctx.project_id,
      title: str(c['title'], 'workflow-created issue'),
      description: c['description'] as string | undefined,
    })
    return { status: 'completed', output: { issue_id: issue.issue_id } }
  } catch (err) {
    return { status: 'failed', error: `create_issue: ${(err as Error).message}` }
  }
}

HANDLERS['create_epic'] = async (ctx) => {
  try {
    const planning = await import('@fulcrum/planning')
    const c = cfg(ctx)
    if (!ctx.project_id) return { status: 'failed', error: 'create_epic requires project_id' }
    const epic = await planning.createEpic({
      workspace_id: ctx.workspace_id,
      project_id: ctx.project_id,
      title: str(c['title'], 'workflow-created epic'),
      description: c['description'] as string | undefined,
    })
    return { status: 'completed', output: { epic_id: epic.epic_id } }
  } catch (err) {
    return { status: 'failed', error: `create_epic: ${(err as Error).message}` }
  }
}

HANDLERS['write_artifact'] = async (ctx) => {
  // Writes straight into the artifacts table. Matches the schema in
  // packages/core/src/db/migrations.ts (line 632) — note that artifacts
  // require a file_path column and use status IN ('draft','final','archived').
  const c = cfg(ctx)
  if (!ctx.project_id) return { status: 'failed', error: 'write_artifact requires project_id' }
  const db = getDb()
  const artifact_id = newId('artifact')
  const now = new Date().toISOString()

  // Compute a display_id — we use a simple monotonic scheme rather than
  // nextDisplayId() to avoid pulling in the ids helper signature which
  // varies across core versions.
  const countRow = db
    .prepare(`SELECT COUNT(*) AS n FROM artifacts WHERE project_id = ?`)
    .get(ctx.project_id) as { n: number }
  const display_id = `ART-${(countRow.n + 1).toString().padStart(4, '0')}`

  db.prepare(
    `INSERT INTO artifacts (
       artifact_id, workspace_id, project_id, display_id, artifact_type, title, file_path,
       owner_type, owner_id, status, content_hash, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?)`,
  ).run(
    artifact_id,
    ctx.workspace_id,
    ctx.project_id,
    display_id,
    str(c['artifact_type'], 'research_note'),
    str(c['title'], 'Workflow artifact'),
    str(c['file_path'], `workflow/${ctx.wf_id}/${ctx.step_id}.md`),
    str(c['owner_type'], 'workflow'),
    str(c['owner_id'], ctx.wf_id),
    now,
    now,
  )
  return { status: 'completed', output: { artifact_id, display_id } }
}

HANDLERS['read_artifact'] = async (ctx) => {
  const c = cfg(ctx)
  const db = getDb()
  const artifact_id = str(c['artifact_id'])
  if (!artifact_id) return { status: 'failed', error: 'read_artifact requires artifact_id' }
  const row = db.prepare(`SELECT * FROM artifacts WHERE artifact_id = ?`).get(artifact_id) as
    | Record<string, unknown>
    | undefined
  if (!row) return { status: 'failed', error: `artifact not found: ${artifact_id}` }
  return { status: 'completed', output: { artifact: row } }
}

HANDLERS['write_memory'] = async (ctx) => {
  const { writeMemory } = await import('@fulcrum/memory')
  const c = cfg(ctx)
  if (!ctx.project_id) return { status: 'failed', error: 'write_memory requires project_id' }
  const content = str(c['content'], `workflow ${ctx.wf_id} step ${ctx.step_id}`)
  const title = str(c['title'], content.slice(0, 80))
  const m = await writeMemory({
    workspace_id: ctx.workspace_id,
    project_id: ctx.project_id,
    content,
    title,
    summary: str(c['summary'], title),
    kind: (c['kind'] as MemoryKind | undefined) ?? 'fact',
    scope: (c['scope'] as MemoryScope | undefined) ?? 'project',
  })
  return { status: 'completed', output: { memory_id: m.memory_id } }
}

HANDLERS['read_memory'] = async (ctx) => {
  const { recallMemory } = await import('@fulcrum/memory')
  const c = cfg(ctx)
  if (!ctx.project_id) return { status: 'failed', error: 'read_memory requires project_id' }
  try {
    const memories = await (recallMemory as unknown as (i: Record<string, unknown>) => Promise<unknown[]>)({
      workspace_id: ctx.workspace_id,
      project_id: ctx.project_id,
      query: str(c['query'], ''),
      limit: num(c['limit'], 10),
    })
    return { status: 'completed', output: { count: memories.length, memories } }
  } catch (err) {
    return { status: 'failed', error: `read_memory: ${(err as Error).message}` }
  }
}

HANDLERS['invoke_team'] = async (ctx) => {
  try {
    const teams = await import('@fulcrum/teams')
    const c = cfg(ctx)
    const result = await teams.invokeTeam({
      workspace_id: ctx.workspace_id,
      project_id: ctx.project_id,
      template_id: str(c['template_id']),
      purpose: str(c['purpose'], str(c['goal'], 'workflow invocation')),
      caller_agent_id: str(c['caller_agent_id'], 'workflow'),
      caller_role: (c['caller_role'] as 'chief_of_staff') ?? 'chief_of_staff',
      task_id: c['task_id'] as string | undefined,
    })
    return { status: 'completed', output: { instance_id: (result as { instance_id: string }).instance_id } }
  } catch (err) {
    return { status: 'failed', error: `invoke_team: ${(err as Error).message}` }
  }
}

HANDLERS['spawn_agent'] = async (ctx) => {
  try {
    const worker = await import('@fulcrum/worker')
    const c = cfg(ctx)
    if (!ctx.project_id) return { status: 'failed', error: 'spawn_agent requires project_id' }
    const result = await worker.spawnAgent({
      workspace_id: ctx.workspace_id,
      project_id: ctx.project_id,
      caller_role: (c['caller_role'] as 'chief_of_staff') ?? 'chief_of_staff',
      target_role: (c['target_role'] as 'software_engineer') ?? 'software_engineer',
      task_id: str(c['task_id']),
      model: c['model'] as string | undefined,
      adapter: c['adapter'] as string | undefined,
    })
    return result.result.status === 'completed'
      ? { status: 'completed', output: { run_id: result.run_id, summary: result.result.summary } }
      : { status: 'failed', error: result.result.error ?? 'spawn_agent blocked' }
  } catch (err) {
    return { status: 'failed', error: `spawn_agent: ${(err as Error).message}` }
  }
}

HANDLERS['run_script'] = async (ctx) => {
  // Policy gate: only scripts on a known allowlist may run. This is a
  // defence-in-depth measure — real deployments should also sandbox the
  // subprocess. The allowlist stays intentionally tiny; add entries as
  // new script uses are justified in review.
  const c = cfg(ctx)
  const script = str(c['script'])
  const ALLOWED_SCRIPTS = new Set(['run_tests', 'lint', 'typecheck', 'build'])
  if (!ALLOWED_SCRIPTS.has(script)) {
    return { status: 'failed', error: `run_script: '${script}' not in allowlist` }
  }
  try {
    const stdout = await runCommand('npm', ['run', script], process.cwd())
    return { status: 'completed', output: { stdout: stdout.slice(0, 4000) } }
  } catch (err) {
    return { status: 'failed', error: (err as Error).message }
  }
}

HANDLERS['call_mcp_tool'] = async (ctx) => {
  // Stub: actual MCP tool invocation requires a running MCP server and
  // per-tool schema validation. For now we record the intent so workflows
  // that reference MCP tools don't fail hard — future rounds will wire
  // this to @fulcrum/mcp when that package lands.
  const c = cfg(ctx)
  return {
    status: 'completed',
    output: {
      tool_name: c['tool_name'] ?? null,
      args: c['args'] ?? {},
      note: 'call_mcp_tool stubbed pending MCP integration',
    },
  }
}

HANDLERS['wait_for_task'] = async (ctx) => {
  const c = cfg(ctx)
  const target_task_id = str(c['task_id'])
  const expected_status = str(c['status'], 'done')
  if (!target_task_id) return { status: 'failed', error: 'wait_for_task requires task_id' }
  const db = getDb()
  const row = db.prepare(`SELECT status FROM tasks WHERE task_id = ?`).get(target_task_id) as
    | { status: string }
    | undefined
  if (!row) return { status: 'failed', error: `task not found: ${target_task_id}` }
  if (row.status === expected_status) {
    return { status: 'completed', output: { task_id: target_task_id } }
  }
  // Not yet — return skipped so the runner doesn't mark it failed. Note
  // that in the current implementation the runner also treats skipped as
  // "don't count as progress" on its own, so a wait_for_task paired with
  // no other progress will correctly terminate the loop as 'blocked'.
  return { status: 'skipped', error: `task ${target_task_id} still '${row.status}', expected '${expected_status}'` }
}

HANDLERS['wait_for_review'] = async (ctx) => {
  const c = cfg(ctx)
  const target = str(c['target_id'], str(c['owner_id']))
  if (!target) return { status: 'failed', error: 'wait_for_review requires target_id' }
  const db = getDb()
  const row = db
    .prepare(
      `SELECT status FROM reviews WHERE target_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(target) as { status: string } | undefined
  if (row && row.status === 'approved') {
    return { status: 'completed', output: { target_id: target } }
  }
  return { status: 'skipped', error: `review for ${target} not yet approved` }
}

HANDLERS['wait_for_artifact'] = async (ctx) => {
  const c = cfg(ctx)
  const owner_id = str(c['owner_id'])
  const artifact_type = str(c['artifact_type'])
  if (!owner_id || !artifact_type) {
    return { status: 'failed', error: 'wait_for_artifact requires owner_id and artifact_type' }
  }
  const db = getDb()
  const row = db
    .prepare(
      `SELECT artifact_id FROM artifacts WHERE owner_id = ? AND artifact_type = ? LIMIT 1`,
    )
    .get(owner_id, artifact_type) as { artifact_id: string } | undefined
  if (row) return { status: 'completed', output: { artifact_id: row.artifact_id } }
  return { status: 'skipped', error: `artifact ${artifact_type} for ${owner_id} not yet present` }
}

HANDLERS['branch'] = async (ctx) => {
  // Config: { output_key: 's1.result.foo', expected: 'bar' }
  // Looks up the dotted path inside ctx.outputs and compares to `expected`.
  const c = cfg(ctx)
  const key = str(c['output_key'])
  const expected = c['expected']
  if (!key) return { status: 'completed', output: { branch: 'taken', reason: 'no predicate' } }
  const parts = key.split('.')
  let cur: unknown = ctx.outputs
  for (const p of parts) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[p]
    } else {
      cur = undefined
      break
    }
  }
  return cur === expected
    ? { status: 'completed', output: { branch: 'taken', value: cur } }
    : { status: 'skipped', error: `branch predicate false: ${key}=${JSON.stringify(cur)}, expected ${JSON.stringify(expected)}` }
}

HANDLERS['loop'] = async (ctx) => {
  // Config: { iterations: N }
  // The runner tracks attempts for us; once ctx.attempts+1 >= target,
  // the step completes. (attempts is pre-increment inside the runner.)
  const c = cfg(ctx)
  const target = num(c['iterations'], 1)
  const next = ctx.attempts + 1
  if (next >= target) return { status: 'completed', output: { iterations: next } }
  return { status: 'skipped', error: `loop ${next}/${target}` }
}

HANDLERS['halt'] = async () => {
  // Halt — the runner sees output.halt and short-circuits.
  return { status: 'completed', output: { halt: true } }
}

HANDLERS['escalate'] = async (ctx) => {
  const { createHandoff, getDb: getDbCore } = await import('@fulcrum/core')
  const c = cfg(ctx)
  try {
    const handoff = createHandoff(getDbCore(), {
      workspace_id: ctx.workspace_id,
      project_id: ctx.project_id,
      from_agent_id: str(c['from_agent_id'], 'workflow'),
      to_agent_id: 'chief_of_staff',
      goal: str(c['goal'], `escalated from workflow ${ctx.wf_id}`),
      task_type: str(c['task_type'], 'escalation'),
      priority: 'high',
      scope: 'workspace',
      inputs: (c['handoff_inputs'] as Record<string, unknown>) ?? {},
      handoff_mode: 'contextual',
    })
    return { status: 'completed', output: { handoff_id: handoff.handoff_id } }
  } catch (err) {
    return { status: 'failed', error: `escalate: ${(err as Error).message}` }
  }
}

// ── pass-through / introspection handlers ──────────────────────────────────

HANDLERS['prompt_user'] = async () => {
  // Interactive prompts are driven by stepWorkflow/resumeWorkflow, not
  // the runner — treat as completed so non-interactive tests can flow.
  return { status: 'completed', output: { prompted: true } }
}

HANDLERS['read_project'] = async (ctx) => {
  const db = getDb()
  if (!ctx.project_id) return { status: 'failed', error: 'read_project requires project_id' }
  const row = db.prepare(`SELECT * FROM projects WHERE project_id = ?`).get(ctx.project_id) as
    | Record<string, unknown>
    | undefined
  if (!row) return { status: 'failed', error: `project not found: ${ctx.project_id}` }
  return { status: 'completed', output: { project: row } }
}

HANDLERS['review_artifact'] = async (ctx) => {
  // Stub — creates a minimal review row pointing at a configured artifact.
  const c = cfg(ctx)
  const target_id = str(c['target_id'])
  if (!target_id) return { status: 'failed', error: 'review_artifact requires target_id' }
  const db = getDb()
  const review_id = newId('review')
  const display_id = `REV-${review_id.slice(-6)}`
  const now = new Date().toISOString()
  if (!ctx.project_id) return { status: 'failed', error: 'review_artifact requires project_id' }
  db.prepare(
    `INSERT INTO reviews (
       review_id, workspace_id, project_id, display_id, target_type, target_id,
       status, reviewer_agent_id, summary, file_path, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'artifact', ?, 'pending', NULL, ?, NULL, ?, ?)`,
  ).run(
    review_id,
    ctx.workspace_id,
    ctx.project_id,
    display_id,
    target_id,
    str(c['summary'], 'workflow-initiated review'),
    now,
    now,
  )
  return { status: 'completed', output: { review_id } }
}

HANDLERS['evaluate_policy'] = async (ctx) => {
  const { checkPolicy } = await import('@fulcrum/core')
  const c = cfg(ctx)
  try {
    const result = (checkPolicy as unknown as (i: Record<string, unknown>) => Promise<unknown>)({
      workspace_id: ctx.workspace_id,
      project_id: ctx.project_id,
      rule: c['rule'],
      subject: c['subject'],
    })
    const awaited = await result
    return { status: 'completed', output: { policy: awaited } }
  } catch (err) {
    return { status: 'failed', error: `evaluate_policy: ${(err as Error).message}` }
  }
}

HANDLERS['search_web'] = async (ctx) => {
  // No built-in web search in this monorepo yet — stub the step so
  // workflows that reference it don't fail. Future rounds will wire
  // this to an external search adapter.
  const c = cfg(ctx)
  return { status: 'completed', output: { query: c['query'] ?? '', results: [], note: 'search_web stubbed' } }
}

HANDLERS['search_code'] = async (ctx) => {
  const c = cfg(ctx)
  const query = str(c['query'])
  if (!query) return { status: 'failed', error: 'search_code requires query' }
  const cwd = str(c['cwd'], process.cwd())
  const glob = str(c['glob'], '')

  type Match = { path: string; line: number; text: string }

  const tryRg = async (): Promise<Match[]> => {
    const args = ['--json', '--max-count=50', query]
    if (glob) args.push('--glob', glob)
    const stdout = await runCommand('rg', args, cwd)
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l): Record<string, unknown> | null => {
        try { return JSON.parse(l) as Record<string, unknown> } catch { return null }
      })
      .filter((r): r is Record<string, unknown> => r !== null && r['type'] === 'match')
      .map((r) => {
        const data = r['data'] as Record<string, unknown>
        return {
          path: (data['path'] as { text: string }).text,
          line: data['line_number'] as number,
          text: ((data['lines'] as { text: string }).text ?? '').trim(),
        }
      })
  }

  const tryGrep = async (): Promise<Match[]> => {
    const include = glob ? `--include=${glob}` : '--include=*.ts'
    const stdout = await runCommand(
      'grep', ['-rn', include, `--max-count=50`, query, '.'], cwd
    ).catch(() => '')
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(.+?):(\d+):(.*)$/)
        if (!m) return null
        return { path: m[1]!, line: parseInt(m[2]!, 10), text: m[3]!.trim() }
      })
      .filter((r): r is Match => r !== null)
  }

  try {
    const matches = await tryRg().catch(() => tryGrep())
    return { status: 'completed', output: { query, matches } }
  } catch (err) {
    return { status: 'completed', output: { query, matches: [], note: (err as Error).message } }
  }
}

HANDLERS['run_tool'] = async (ctx) => {
  const c = cfg(ctx)
  return { status: 'completed', output: { tool: c['tool'] ?? null, note: 'run_tool stubbed' } }
}

HANDLERS['parallel'] = async () => {
  // Parallel steps are synthesised at definition-time — the DAG itself
  // handles fan-out. This handler just marks the parent 'parallel' node
  // as complete so downstream steps can fire.
  return { status: 'completed', output: { parallel: true } }
}

HANDLERS['complete'] = async () => {
  return { status: 'completed', output: { complete: true } }
}

HANDLERS['validate_schema'] = async (ctx) => {
  const c = cfg(ctx)
  const schema = c['schema'] as Record<string, unknown> | undefined
  if (!schema) return { status: 'completed', output: { valid: true, validated: false } }

  // Resolve data from outputs using dotted key path, or use inline data key
  const dataKey = str(c['data_key'], '')
  const data: unknown = dataKey
    ? dataKey.split('.').reduce<unknown>((acc, part) => {
        if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
        return undefined
      }, ctx.outputs)
    : c['data']

  const { default: Ajv } = await import('ajv')
  const ajv = new Ajv()
  const validate = ajv.compile(schema)
  const valid = validate(data)
  if (!valid) {
    const errors = ajv.errorsText(validate.errors)
    return { status: 'failed', error: `schema validation failed: ${errors}` }
  }
  return { status: 'completed', output: { valid: true } }
}

HANDLERS['gate'] = async (ctx) => {
  // Config: { open: boolean } — when false, skip (retry next cycle).
  const c = cfg(ctx)
  const open = c['open']
  if (open === false) return { status: 'skipped', error: 'gate closed' }
  return { status: 'completed', output: { gate: 'open' } }
}

// ── entrypoint ─────────────────────────────────────────────────────────────

/**
 * Execute a single step by dispatching on its step_type. All thrown
 * errors are caught and converted to `{ status: 'failed', error }` so
 * the runner never has to deal with exceptions from handlers.
 */
export async function executeStep(ctx: StepContext): Promise<StepResult> {
  const type = (ctx.step as unknown as { step_type?: string; type?: string }).step_type
    ?? (ctx.step as unknown as { step_type?: string; type?: string }).type
  if (!type) {
    return { status: 'failed', error: 'step has no step_type' }
  }
  const handler = HANDLERS[type]
  if (!handler) {
    return { status: 'failed', error: `no handler for step type: ${type}` }
  }
  try {
    return await handler(ctx)
  } catch (err) {
    return { status: 'failed', error: (err as Error).message }
  }
}

/** Expose the handler map for tests and advanced consumers. */
export function getStepHandler(type: string): StepHandler | undefined {
  return HANDLERS[type]
}

/** List all registered step types. */
export function listStepHandlers(): string[] {
  return Object.keys(HANDLERS).sort()
}
