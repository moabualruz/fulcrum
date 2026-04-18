// packages/cli/src/commands/memory-curate.ts
//
// Memory v3 PR 3 unit 3.6 — `fulcrum memory curate <l0_id>` CLI.
//
// Loads an L0 source by id, runs it through the curator runtime (unit 3.1
// via fulcrum-memory), and applies the parsed CuratorOutput through the
// apply-layer (unit 3.5). Registers the codex / pi / openai backends on
// every call so an embedded test can start from an empty registry — tests
// that register their own stub backends still work because
// `registerBackend` is idempotent.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getDb } from 'fulcrum-agent-core'
import {
  runCurator,
  applyCuratorOutput,
  appendCuratorLog,
  registerBackend,
  getBackend,
  codexBackend,
  piBackend,
  openaiBackend,
  getVaultPath,
  type CuratorInput,
  type CuratorBackendName,
  type CuratorTask,
  type ApplyResult,
  type L0SourceForCurator,
  type CuratorBackend,
  type CuratorOutput,
  type CuratorLogEntry,
} from 'fulcrum-memory'

export interface MemoryCurateInput {
  l0_id: string
  dry_run?: boolean
  backend?: CuratorBackendName
  task?: CuratorTask
  model?: string
  reasoning?: string
  timeout_ms?: number
}

export interface MemoryCurateResult {
  l0_id: string
  backend: CuratorBackendName
  model: string
  prompt_version: string
  duration_ms: number
  dry_run: boolean
  apply: ApplyResult
}

export interface L0LookupRow {
  source_id: string
  source_type: string
  workspace_id: string
  project_id: string | null
  vault_path: string
  created_at: string
}

function loadL0Source(l0_id: string): L0LookupRow {
  const row = getDb()
    .prepare(
      `SELECT source_id, source_type, workspace_id, project_id, vault_path, created_at
       FROM l0_sources
       WHERE source_id = ?`,
    )
    .get(l0_id) as L0LookupRow | undefined
  if (!row) {
    throw new Error(`memory curate: L0 source '${l0_id}' not found in l0_sources`)
  }
  return row
}

function stripFrontmatter(raw: string): string {
  // l0/ingest.ts writes `---\n<yaml>\n---\n\n<body>`. Strip through the
  // second `---\n` closer. Falls through to the whole file if the shape
  // differs — avoids silent truncation on unexpected formats.
  if (!raw.startsWith('---\n')) return raw
  const closeIdx = raw.indexOf('\n---\n', 4)
  if (closeIdx < 0) return raw
  return raw.slice(closeIdx + 5).replace(/^\n+/, '')
}

function readL0Body(row: L0LookupRow): L0SourceForCurator {
  const vaultRoot = getVaultPath()
  const filePath = join(vaultRoot, row.vault_path)
  if (!existsSync(filePath)) {
    throw new Error(
      `memory curate: L0 source '${row.source_id}' file missing at ${row.vault_path} (expected under vault ${vaultRoot})`,
    )
  }
  const raw = readFileSync(filePath, 'utf-8')
  return {
    source_id: row.source_id,
    source_type: row.source_type as L0SourceForCurator['source_type'],
    created_at: row.created_at,
    body: stripFrontmatter(raw),
  }
}

/**
 * Register the three PR 3 production backends IF they are not already
 * present in the registry. Tests that pre-register stubs keep them —
 * defaults only fill empty slots.
 */
export function registerDefaultCuratorBackends(): void {
  const defaults: CuratorBackend[] = [codexBackend, piBackend, openaiBackend]
  for (const backend of defaults) {
    if (!getBackend(backend.name)) registerBackend(backend)
  }
}

/**
 * End-to-end curation of one L0 source:
 *   1. Look up + read the L0 row.
 *   2. Register default backends (idempotent).
 *   3. Run the curator (LLM call via selected backend).
 *   4. Apply the parsed CuratorOutput atomically.
 */
export async function curateMemory(input: MemoryCurateInput): Promise<MemoryCurateResult> {
  const row = loadL0Source(input.l0_id)
  const source = readL0Body(row)

  registerDefaultCuratorBackends()

  const curatorInput: CuratorInput = {
    task: input.task ?? 'extraction',
    l0_sources: [source],
    workspace_id: row.workspace_id,
    project_id: row.project_id,
  }
  if (input.backend) curatorInput.backend_override = input.backend
  if (input.model) curatorInput.model_override = input.model
  if (input.reasoning) curatorInput.reasoning_override = input.reasoning
  if (input.timeout_ms) curatorInput.timeout_ms = input.timeout_ms

  const run = await runCurator(curatorInput)
  const apply = applyCuratorOutput(run.output, {
    workspace_id: row.workspace_id,
    project_id: row.project_id ?? row.workspace_id,
    curator_input_sources: [source.source_id],
    dry_run: input.dry_run ?? false,
  })

  writeCuratorTelemetry({
    task: curatorInput.task,
    l0_id: input.l0_id,
    backend: run.backend,
    model: run.model,
    prompt_version: run.prompt_version,
    duration_ms: run.duration_ms,
    dry_run: Boolean(input.dry_run),
    output: run.output,
    apply,
    usage: run.usage,
  })

  return {
    l0_id: input.l0_id,
    backend: run.backend,
    model: run.model,
    prompt_version: run.prompt_version,
    duration_ms: run.duration_ms,
    dry_run: Boolean(input.dry_run),
    apply,
  }
}

function writeCuratorTelemetry(
  args: {
    task: CuratorTask
    l0_id: string
    backend: CuratorBackendName
    model: string
    prompt_version: string
    duration_ms: number
    dry_run: boolean
    output: CuratorOutput
    apply: ApplyResult
    usage: Awaited<ReturnType<typeof runCurator>>['usage']
  },
): void {
  const entry: CuratorLogEntry = {
    ts: new Date().toISOString(),
    l0_id: args.l0_id,
    task: args.task,
    backend: args.backend,
    model: args.model,
    prompt_version: args.prompt_version,
    duration_ms: args.duration_ms,
    dry_run: args.dry_run,
    affected_pages: {
      created: args.apply.created_page_ids,
      updated: args.apply.updated_page_ids,
      superseded: args.apply.superseded_pairs,
    },
    new_edges: args.apply.created_edge_ids,
    confidence_deltas: {
      created: args.output.new_pages.map((p) => p.confidence),
      updated: args.output.updates
        .map((u) => u.confidence)
        .filter((x): x is number => typeof x === 'number'),
      superseded: args.output.supersessions.map((s) => s.new_page.confidence),
    },
  }
  if (args.usage) entry.usage = args.usage
  appendCuratorLog(getVaultPath(), entry)
}
