#!/usr/bin/env tsx
// packages/cli/src/index.ts — fulcrum CLI entry point

import { realpathSync } from 'fs'
import { fileURLToPath } from 'url'
import { runMemoryInit } from 'fulcrum-memory'
import { activateL2 } from 'fulcrum-memory'
import { runDoctor, printDoctorResults } from './doctor.js'
import { globalDataDir } from 'fulcrum-agent-core'
import { discoverPlugins, registerPlugins } from './plugin-discovery.js'
import { summarizeAdaptiveInstallPlan } from './integration-plan.js'

const [, , ...args] = process.argv
const [group, command] = args

function usage(): never {
  console.log(`
fulcrum — local-first agent control plane

USAGE
  fulcrum <group> <command> [options]

CONTROL PLANE
  memory init          Initialize L0 vault + L1 SQLite (+ optional L2)
  memory accelerate    Enable L2 (Kuzu graph + HNSW vector search)
  memory rebuild       Rebuild L1 from L0 vault files
  memory embed         Backfill vector embeddings for all memories missing them
  memory status        Show vault path and layer status

  serve mcp            Start MCP server (stdio JSON-RPC 2.0) + auto-starts monitor
  serve monitor        Start HTTP monitor + control API (default port 4721)
  serve all            Start both MCP and monitor servers

  hook auto            Auto-detect runtime hook (stdin → policy check)
  hook claude          PreToolUse hook for Claude Code (stdin → policy check)
  hook gemini          BeforeTool hook for Gemini CLI
  hook pi              BeforeTool hook for PI coding agent

DOMAIN
  workspaces list
  workspaces create --name <name> [--id <id>]

  projects list [--workspace-id <id>]
  projects create --name <name> --workspace-id <id> [--type <type>] [--id <id>]

  task list [--workspace-id <id>] [--project-id <id>] [--status <status>] [--limit <n>]
  task get --id <task_id>
  task create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>]
  task update --id <task_id> [--status <s>] [--note <n>] [--assigned-to <role>]

  issue list [--workspace-id <id>] [--project-id <id>]
  issue create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>]
  issue get --id <issue_id>
  issue update --id <issue_id> [--status <s>]

  epic list [--workspace-id <id>] [--project-id <id>]
  epic create --title <title> [--workspace-id <id>] [--project-id <id>]
  epic get --id <epic_id>

  board show [--workspace-id <id>] [--project-id <id>]
  queue merge list [--workspace-id <id>]
  queue merge process --workspace-id <id> --actor-role integration_worker
  queue review list [--workspace-id <id>]

  sync status [--workspace-id <id>]
  sync push [--workspace-id <id>]
  sync pull [--workspace-id <id>]

TEAMS + WORKFLOWS + AGENTS
  team list [--workspace-id <id>]
  team create --name <name> [--workspace-id <id>]
  team invoke --template-id <id> --workspace-id <id> --caller-role <role> --goal <g>
  team instances [--workspace-id <id>]

  workflow list [--workspace-id <id>]
  workflow start --workflow-name <n> [--workspace-id <id>] [--project-id <id>]
  workflow run --wf-id <id>
  workflow status --wf-id <id>
  workflow resume --wf-id <id> [--step-id <s>]

  agent list [--workspace-id <id>]
  agent status --run-id <id>
  agent spawn --target-role <role> --caller-role <role> --task-id <id> [--adapter <name>]

OPTIONS
  --version, -v        Print the fulcrum version and exit
  --help, -h           Show this help (or <group> --help for group help)
  --json               Output as JSON (for list/get subcommands)
  --vault <path>       Override vault path (default: $FULCRUM_DATA_DIR/vault)
  --port <n>           Override monitor port (default: 4721)

PLUGINS
  plugin list                         List discovered plugins (project + global)
  plugin install <package>            Install plugin from npm registry
  plugin link <path>                  Link a local plugin directory (dev mode)
  plugin remove <package>             Remove a globally-installed plugin

INSTALL
  install plan                        Show adaptive plugin/extension install plan
  install plan --json                 Same, as JSON
  init --adaptive                     Alias for install plan
  init --cursor | --windsurf          Write project-local rule/config scaffolding
  init --codex | --opencode           Write project-local config scaffolding

SKILLS
  skills install                      Install bundled skills to ~/.claude/skills/ (Claude Code auto-loads)
  skills install --project            Install to .claude/skills/ (project scope)
  skills list                         List available skills

TOOL REGISTRY
  tool list                           List all 23 MCP tools with names and descriptions
  tool list --json                    Same, as JSON array
  tool exec <name>                    Execute a tool using cwd workspace context
  tool exec <name> --json <payload>   Execute with JSON payload string
  cat payload.json | tool exec <name> Execute with JSON payload from stdin

ACTION REGISTRY
  action list                         List canonical actions with CLI/MCP mappings
  action list --json                  Same, as JSON array
  action exec <name>                  Execute canonical action with cwd context
  action exec <name> --json <payload> Execute with inline JSON payload string

MCP PLANNER
  mcp plan                            Show MCP exposure decisions for a runtime/agent
  mcp plan --json                     Same, as JSON array with reasons

DIAGNOSTICS
  doctor              Run environment + configuration health checks
  doctor --json       Output checks as JSON

COCKPIT
  tui                         Open live terminal dashboard (Ink v4 TUI)
                              Panes: task board, agent runs, event stream, blocked runs
                              Keys: tab=cycle panes, arrows=navigate, q=quit
                              Actions: u=unblock run, k=kill run, n=new task

ACTIVITY LOG
  log                         Show last 50 agent events (human-readable)
  log --follow                Tail live SSE stream from monitor
  log --run-id <id>           Filter to a single run
  log --since <duration>      Filter by time (e.g. 30m, 2h, 1d)
  log --limit <n>             Number of events to show (default 50)

EXAMPLES
  fulcrum memory init
  fulcrum doctor
  fulcrum serve all
  fulcrum task list --json
  fulcrum workflow start --workflow-name implement_feature --workspace-id ws_1
  fulcrum agent spawn --target-role software_engineer --caller-role chief_of_staff --task-id task_123
  fulcrum queue merge process --workspace-id ws_1 --actor-role integration_worker

AUTO-INITIALIZATION
  Every fulcrum command auto-initializes $CWD as a Fulcrum project on first run
  (opens the single global DB at $FULCRUM_DATA_DIR or ~/.local/share/fulcrum/,
  creates a workspace + project with deterministic IDs derived from $CWD).
  No explicit init step required. Nothing is written to your project directory.

GLOBAL INSTALL
  From the repo root: pnpm install && pnpm run setup
  Installs: ~/.local/bin/fulcrum symlink, Claude user-scope MCP server,
  Gemini extension, PI cockpit, and PreToolUse hooks.

DOCS
  README.md               Full user guide
  docs/guides/            Workflow authoring, worker adapters, telemetry
  AGENTS.md               Invariants for contributors (and AI agents)
`)
  process.exit(0)
}

// ── CLI output + arg helpers (J-6) ────────────────────────────────────────────

/**
 * Print rows either as JSON (when --json is in argv) or as a simple
 * tab-separated table. Works with arbitrary record shapes; caller may
 * optionally supply a fixed column order.
 */
export function outputRows<T extends Record<string, unknown>>(
  rows: T[],
  columns?: Array<keyof T>,
): void {
  if (args.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }
  if (rows.length === 0) {
    console.log('(no rows)')
    return
  }
  const first = rows[0]
  if (!first) {
    console.log('(no rows)')
    return
  }
  const cols = columns ?? (Object.keys(first) as Array<keyof T>)
  console.log(cols.map(c => String(c)).join('\t'))
  for (const row of rows) {
    console.log(
      cols.map(c => {
        const v = row[c]
        if (v === null || v === undefined) return ''
        if (typeof v === 'object') return JSON.stringify(v)
        return String(v)
      }).join('\t'),
    )
  }
}

export function outputObject(obj: Record<string, unknown>): void {
  if (args.includes('--json')) {
    console.log(JSON.stringify(obj, null, 2))
    return
  }
  for (const [k, v] of Object.entries(obj)) {
    const val =
      v === null || v === undefined ? '' :
      typeof v === 'object' ? JSON.stringify(v) :
      String(v)
    console.log(`${k}: ${val}`)
  }
}

export function requireArg(flag: string): string {
  const idx = args.indexOf(flag)
  if (idx < 0 || !args[idx + 1]) {
    console.error(`${flag} is required`)
    process.exit(1)
  }
  return args[idx + 1] as string
}

export function optArg(flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx >= 0 ? args[idx + 1] : undefined
}

function optIntArg(flag: string): number | undefined {
  const v = optArg(flag)
  if (v === undefined) return undefined
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : undefined
}

function optArgs(flag: string): string[] {
  const values: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && args[i + 1]) values.push(args[i + 1] as string)
  }
  return values
}

async function buildExposurePlanFromArgs(): Promise<import('./tool-registry.js').McpExposurePlan> {
  const { buildMcpExposurePlan } = await import('./tool-registry.js')
  const profile = optArg('--profile')
  return buildMcpExposurePlan({
    mode: (optArg('--mode') as 'full' | 'filtered' | 'minimal' | undefined) ?? 'filtered',
    profile,
    agentType: optArg('--agent-type') ?? profile,
    platform: optArg('--platform'),
    runtimeCapabilities: optArgs('--runtime-capability'),
    includeActions: optArgs('--include-action'),
    excludeActions: optArgs('--exclude-action'),
  })
}

function featureNotImplemented(feature: string): never {
  console.error(`feature not yet implemented: ${feature}`)
  process.exit(1)
}

// ── Memory commands ──────────────────────────────────────────────────────────

async function runMemory(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    console.log(`
fulcrum memory — memory vault commands

  init             Initialize vault (L0 + L1), optionally enable L2
  accelerate       Enable L2 graph + vector search on existing vault
  rebuild          Rebuild L1 SQLite from L0 vault files
  status           Show vault info
  page             L1 curated-page template scaffolding (v3 PR 2)
  curate           Run curator pipeline on a single L0 source (v3 PR 3)
  reindex-l2       Re-embed L1 pages and/or code chunks (v3 PR 4)
  recall           FTS5 + vec + graph fused recall (v3 PR 5)
  sources          Walk L1 page → L0 sources (v3 PR 5)
  inspect          Dump a full L1 page (v3 PR 5)
  read-raw         Print an L0 source body (v3 PR 5)
  trace            Reverse lookup: find pages containing a claim (v3 PR 5)
  mark-wrong       Write a correction L0 entry (v3 PR 5)
  lint             Verify migrated vault — orphans, missing sources, cycles (v3 PR 6)
  migrate          End-to-end v2a → v3 migration orchestrator (v3 PR 6)
  consolidate      Propose merge candidates across entity-set collisions (v3 PR 7)
  sweep-expired              Delete session-scope memories whose expires_at has passed
  graph-consistency-check    Sample SQLite ↔ Kuzu and report drift (requires L2)
  rollback                   Operator-only rollback (--since= + --yes-i-really-want-to-undo-N-writes)
`)
    process.exit(0)
  }

  if (command === 'init') {
    await runMemoryInit()
    return
  }

  if (command === 'accelerate') {
    console.log('Activating L2 (Kuzu graph + HNSW vector search)...')
    try {
      const result = await activateL2()
      console.log(`✓ L2 active — indexed ${result.l2Count} memories`)
      if (result.errors.length > 0) {
        console.log(`⚠ ${result.errors.length} errors during indexing:`)
        for (const e of result.errors.slice(0, 10)) {
          console.log(`  - ${e}`)
        }
      }
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (command === 'rebuild') {
    const { rebuildFromVault } = await import('fulcrum-memory')
    const { getVaultPath } = await import('fulcrum-memory')
    const vaultPath = process.env['FULCRUM_VAULT_PATH'] ?? getVaultPath()
    const targetArg = args.find(a => a === '--l1' || a === '--l2' || a === '--both')
    const target = targetArg === '--l2' ? 'l2' : targetArg === '--both' ? 'both' : 'l1'
    console.log(`Rebuilding ${target.toUpperCase()} from vault at ${vaultPath}...`)
    const result = await rebuildFromVault({ vaultPath, target })
    console.log(`✓ L1: ${result.l1Count} memories, L2: ${result.l2Count} memories`)
    if (result.errors.length > 0) {
      console.log(`⚠ ${result.errors.length} errors`)
      for (const e of result.errors.slice(0, 10)) console.log(`  - ${e}`)
    }
    return
  }

  if (command === 'embed') {
    // Backfill vec_memories for all memories that don't have embeddings yet
    await warmEmbedding()
    const { storeEmbeddingInVec } = await import('fulcrum-memory')
    const { getDb: _getDb, runMigrations: _rm, loadConfig: _lc2 } = await import('fulcrum-agent-core')
    _rm(_getDb())
    const db = _getDb()
    const rows = db.prepare(
      'SELECT memory_id, canonical_text, content FROM memories WHERE embedding IS NULL ORDER BY created_at'
    ).all() as { memory_id: string; canonical_text: string | null; content: string }[]
    console.log(`Embedding ${rows.length} memories without vectors...`)
    let ok = 0, fail = 0
    for (const row of rows) {
      try {
        await storeEmbeddingInVec(db, row.memory_id, row.canonical_text ?? row.content ?? '')
        ok++
      } catch {
        fail++
      }
    }
    console.log(`✓ Embedded ${ok} memories${fail > 0 ? `, ${fail} failed` : ''}`)
    return
  }

  if (command === 'status') {
    const { getVaultPath, vaultExists } = await import('fulcrum-memory')
    const { readState } = await import('fulcrum-memory')
    const vaultPath = process.env['FULCRUM_VAULT_PATH'] ?? getVaultPath()
    const exists = vaultExists(vaultPath)
    console.log(`\nFulcrum Memory Status`)
    console.log(`─────────────────────`)
    console.log(`Vault path : ${vaultPath}`)
    console.log(`L0 vault   : ${exists ? '✓ initialized' : '✗ not found — run: fulcrum memory init'}`)
    if (exists) {
      const state = readState(vaultPath)
      const count = Object.keys(state).length
      console.log(`L0 entries : ${count} memories tracked in .state.json`)
      console.log(`L1 SQLite  : ready (FTS5 full-text search)`)
      const kuzuPath = globalDataDir() + '/kuzu'
      const { existsSync } = await import('fs')
      console.log(`L2 Kuzu    : ${existsSync(kuzuPath) ? '✓ initialized' : '○ not enabled — run: fulcrum memory accelerate'}`)
    }
    console.log('')
    return
  }

  // Memory v3 PR 2 unit 2.7 — operator-facing template stub.
  if (command === 'page') {
    const sub = args[2]
    if (!sub || sub === '--help' || sub === '-h') {
      console.log(`
fulcrum memory page — L1 curated-page template scaffolding (memory v3 PR 2)

  create --template <entity|concept|page|synthesis>
      Print the rendered template to stdout. Operator debugging only;
      curator pipeline (PR 3) is the production writer.

  show <page_id>
      Load an existing L1 curated page and print the serialized
      frontmatter + body. Reads through readCuratedPage.
`)
      process.exit(0)
    }
    if (sub === 'create') {
      const templateFlagIdx = args.indexOf('--template')
      const templateName = templateFlagIdx >= 0 ? args[templateFlagIdx + 1] : undefined
      const allowed = ['entity', 'concept', 'page', 'synthesis'] as const
      if (!templateName || !(allowed as readonly string[]).includes(templateName)) {
        console.error(`fulcrum memory page create: --template <${allowed.join('|')}> required`)
        process.exit(1)
      }
      const { loadTemplate } = await import('fulcrum-memory')
      console.log(loadTemplate(templateName as (typeof allowed)[number]))
      return
    }
    if (sub === 'show') {
      const pageId = args[3]
      if (!pageId) {
        console.error('fulcrum memory page show <page_id>')
        process.exit(1)
      }
      const { readCuratedPage, serializeCuratedPage } = await import('fulcrum-memory')
      const page = readCuratedPage(pageId)
      if (!page) {
        console.error(`page '${pageId}' not found`)
        process.exit(1)
      }
      console.log(serializeCuratedPage(page))
      return
    }
    console.error(`Unknown subcommand: memory page ${sub}`)
    process.exit(1)
  }

  // Memory v3 PR 3 unit 3.6 — curator CLI.
  if (command === 'curate') {
    const l0_id = args[2]
    if (!l0_id || l0_id === '--help' || l0_id === '-h') {
      console.log(`
fulcrum memory curate <l0_id> [--dry-run] [--backend codex|pi|openai|anthropic]

Run the curator pipeline on a single L0 source. Reads the raw body,
runs it through the configured LLM backend with Structured Outputs
constrained to the CuratorOutput schema, and applies the parsed diff
via the deterministic apply-layer.

Flags:
  --dry-run         Print the resulting diff without writing.
  --backend <name>  Override backend selection (default order:
                    codex → pi → openai → anthropic).
  --task <name>     extraction (default) | consolidation | synthesis
  --model <id>      Override model for this run.
  --reasoning <e>   Override reasoning effort (minimal|medium|high|...).
`)
      process.exit(l0_id ? 0 : 1)
    }
    const dryRun = args.includes('--dry-run')
    const backendIdx = args.indexOf('--backend')
    const taskIdx = args.indexOf('--task')
    const modelIdx = args.indexOf('--model')
    const reasoningIdx = args.indexOf('--reasoning')
    const backend = backendIdx >= 0 ? (args[backendIdx + 1] as 'codex' | 'pi' | 'openai' | 'anthropic') : undefined
    const task = taskIdx >= 0 ? (args[taskIdx + 1] as 'extraction' | 'consolidation' | 'synthesis') : undefined
    const model = modelIdx >= 0 ? args[modelIdx + 1] : undefined
    const reasoning = reasoningIdx >= 0 ? args[reasoningIdx + 1] : undefined

    const { curateMemory } = await import('./commands/memory-curate.js')
    const params: Parameters<typeof curateMemory>[0] = { l0_id, dry_run: dryRun }
    if (backend) params.backend = backend
    if (task) params.task = task
    if (model) params.model = model
    if (reasoning) params.reasoning = reasoning
    const result = await curateMemory(params)
    console.log(JSON.stringify(result, null, 2))
    return
  }

  // Memory v3 PR 5 unit 5.4 — inspection + correction surface.
  if (command === 'sources') {
    const pageId = args[2]
    if (!pageId || pageId === '--help' || pageId === '-h') {
      console.log(`fulcrum memory sources <page_id>\n\nWalk L1 page → L0 sources (frontmatter + inline wikilinks).`)
      process.exit(pageId ? 0 : 1)
    }
    const { sources } = await import('./commands/memory-inspection.js')
    console.log(JSON.stringify(sources(pageId), null, 2))
    return
  }

  if (command === 'inspect') {
    const pageId = args[2]
    if (!pageId || pageId === '--help' || pageId === '-h') {
      console.log(`fulcrum memory inspect <page_id>\n\nDump the full L1 page (frontmatter + body + resolved wikilinks).`)
      process.exit(pageId ? 0 : 1)
    }
    const { inspect } = await import('./commands/memory-inspection.js')
    console.log(JSON.stringify(inspect(pageId), null, 2))
    return
  }

  if (command === 'read-raw') {
    const l0Id = args[2]
    if (!l0Id || l0Id === '--help' || l0Id === '-h') {
      console.log(`fulcrum memory read-raw <l0_id>\n\nPrint the full body of an L0 source.`)
      process.exit(l0Id ? 0 : 1)
    }
    const { readRaw } = await import('./commands/memory-inspection.js')
    console.log(JSON.stringify(readRaw(l0Id), null, 2))
    return
  }

  if (command === 'trace') {
    const claim = args[2]
    if (!claim || claim === '--help' || claim === '-h') {
      console.log(`fulcrum memory trace "<claim>"\n\nReverse lookup — L1 pages containing the claim substring.`)
      process.exit(claim ? 0 : 1)
    }
    const { projectIdsFromPath } = await import('fulcrum-agent-core')
    const ctx = projectIdsFromPath(process.cwd())
    const { trace } = await import('./commands/memory-inspection.js')
    const limitIdx = args.indexOf('--limit')
    const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : undefined
    const opts: Parameters<typeof trace>[1] = { workspace_id: ctx.workspace_id, project_id: ctx.project_id }
    if (limit !== undefined) opts.limit = limit
    console.log(JSON.stringify(trace(claim, opts), null, 2))
    return
  }

  if (command === 'mark-wrong') {
    const pageId = args[2]
    const reasonIdx = args.indexOf('--reason')
    const reason = reasonIdx >= 0 ? args[reasonIdx + 1] : undefined
    if (!pageId || !reason || pageId === '--help' || pageId === '-h') {
      console.log(`fulcrum memory mark-wrong <page_id> --reason "<why>" [--correction "<detail>"]\n\nWrite a correction L0 entry. Curator re-run must be triggered separately.`)
      process.exit(pageId && reason ? 0 : 1)
    }
    const { projectIdsFromPath } = await import('fulcrum-agent-core')
    const ctx = projectIdsFromPath(process.cwd())
    const { markWrong } = await import('./commands/memory-inspection.js')
    const correctionIdx = args.indexOf('--correction')
    const corrBody = correctionIdx >= 0 ? args[correctionIdx + 1] : undefined
    const input: Parameters<typeof markWrong>[0] = {
      page_id: pageId,
      reason,
      workspace_id: ctx.workspace_id,
      project_id: ctx.project_id,
    }
    if (corrBody !== undefined) input.correction_body = corrBody
    console.log(JSON.stringify(markWrong(input), null, 2))
    return
  }

  // Memory v3 PR 6 — end-to-end migrate orchestrator (plan §PR 6 Verify).
  if (command === 'migrate') {
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
fulcrum memory migrate [--dry-run] [--vault <root>] [--workspace <id>] [--skip-cutover]

Run the v2a → v3 migration end-to-end:
  classify → write vault/raw + vault/curated → backfill DB →
  runMigration103 cutover → lint verification.

Flags:
  --dry-run         Report what would change; do not write anything.
  --vault <root>    Vault root (default: $FULCRUM_VAULT_PATH or ~/.fulcrum/vault).
  --workspace <id>  Scope classifier + migrator to this workspace.
  --skip-cutover    Skip runMigration103 (leaves retention_tier nullable).

Exits 2 when the final lint reports any issue.
`)
      process.exit(0)
    }
    const { runMemoryMigrate } = await import('./commands/memory-migrate.js')
    const { getVaultPath } = await import('fulcrum-memory')
    const vaultIdx = args.indexOf('--vault')
    const wsIdx = args.indexOf('--workspace')
    const vault_root = vaultIdx >= 0 ? args[vaultIdx + 1]! : (process.env['FULCRUM_VAULT_PATH'] ?? getVaultPath())
    const input: Parameters<typeof runMemoryMigrate>[0] = {
      vault_root,
      dry_run: args.includes('--dry-run'),
      skip_cutover: args.includes('--skip-cutover'),
    }
    if (wsIdx >= 0 && args[wsIdx + 1]) input.workspace_id = args[wsIdx + 1]
    const result = runMemoryMigrate(input)
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exit(2)
    return
  }

  // Memory v3 PR 6 unit 6.5 — post-migration verification lint.
  if (command === 'lint') {
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
fulcrum memory lint

Verifies the migrated memory vault:
  * orphan pages (excluding legitimate migration stubs)
  * missing-source references (sources[] → l0_sources resolution)
  * supersession cycles

Output is JSON. Exits 2 if any issue is found.
`)
      process.exit(0)
    }
    const { lintMemory } = await import('./commands/memory-lint.js')
    const report = lintMemory()
    console.log(JSON.stringify(report, null, 2))
    if (!report.ok) process.exit(2)
    return
  }

  // Memory v3 PR 7 unit 7.4 — consolidate (dry-run proposals).
  if (command === 'consolidate') {
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
fulcrum memory consolidate [--min-confidence <F>] [--retention-tier <tier>] [--workspace <id>] [--project <id>]

Propose merge candidates — groups of L1 pages sharing the same entity set
and retention tier whose lowest-confidence member clears the floor. Output
is JSON; this is a dry-run only (plan §7.4). The apply mode (invoke the
curator with a synthesis task) lands after the consolidation prompt stabilises.

Flags:
  --min-confidence <F>    Floor on the lowest-confidence member (default 0.5)
  --retention-tier <tier> Only groups in this tier (working|episodic|semantic|procedural)
  --workspace <id>        Override workspace (default: current cwd workspace)
  --project <id>          Scope to a single project (default: every project in workspace)
`)
      process.exit(0)
    }
    const get = (flag: string): string | undefined => {
      const i = args.indexOf(flag)
      return i >= 0 ? args[i + 1] : undefined
    }
    const { consolidateMemory } = await import('./commands/memory-consolidate.js')
    const input: Parameters<typeof consolidateMemory>[0] = {}
    const workspaceFlag = get('--workspace')
    const projectFlag = get('--project')
    const tierFlag = get('--retention-tier')
    const floorFlag = get('--min-confidence')
    if (workspaceFlag) input.workspace_id = workspaceFlag
    if (projectFlag) input.project_id = projectFlag
    if (tierFlag) input.retention_tier = tierFlag as typeof input.retention_tier
    if (floorFlag !== undefined) input.min_confidence = Number(floorFlag)
    const result = consolidateMemory(input)
    console.log(JSON.stringify(result, null, 2))
    return
  }

  // Memory v3 PR 5 unit 5.3 — recall via the new pipeline.
  if (command === 'recall') {
    if (args.includes('--help') || args.includes('-h') || args.length < 3) {
      console.log(`
fulcrum memory recall "<query>" [flags]

Run a v3 recall — FTS5 + vec + graph fused via RRF, filtered by confidence
and supersession. Output is a JSON { results: [...] } envelope with L0
back-refs (sources[] + l0_wikilinks[]) on every hit.

Flags:
  --limit <N>             Max results (default 10)
  --offset <N>            Pagination offset (default 0)
  --max-chars <N>         Truncate content per hit (default 500)
  --confidence-floor <F>  Minimum confidence [0..1] (default 0.3)
  --graph-hops <N>        BFS depth from query entities (default 2)
  --include-superseded    Include pages whose superseded_by is non-null
  --explain               Include per-stage ranks in each hit
`)
      process.exit(args.length < 3 ? 1 : 0)
    }
    await warmEmbedding()
    const { recallKnowledge } = await import('./commands/memory-recall.js')
    const query = args[2]!
    const get = (flag: string): string | undefined => {
      const i = args.indexOf(flag)
      return i >= 0 ? args[i + 1] : undefined
    }
    const { projectIdsFromPath } = await import('fulcrum-agent-core')
    const { workspace_id, project_id } = projectIdsFromPath(process.cwd())
    const input: Parameters<typeof recallKnowledge>[0] = {
      workspace_id,
      project_id,
      query,
    }
    const limit = get('--limit')
    const offset = get('--offset')
    const maxChars = get('--max-chars')
    const floor = get('--confidence-floor')
    const hops = get('--graph-hops')
    if (limit) input.limit = Number(limit)
    if (offset) input.offset = Number(offset)
    if (maxChars) input.max_chars = Number(maxChars)
    if (floor) input.confidence_floor = Number(floor)
    if (hops) input.graph_hops = Number(hops)
    if (args.includes('--include-superseded')) input.include_superseded = true
    const out = await recallKnowledge(input)
    if (!args.includes('--explain')) {
      out.results = out.results.map((r) => ({ ...r, stage_ranks: undefined as unknown as typeof r.stage_ranks }))
    }
    console.log(JSON.stringify(out, null, 2))
    return
  }

  // Memory v3 PR 4 unit 4.3 — operator one-shot re-embedder.
  if (command === 'reindex-l2') {
    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
fulcrum memory reindex-l2 [--pages] [--code]

Unconditionally rewrite L2 vectors. Default (no flag) reindexes both scopes.

Flags:
  --pages    Walk memories (schema_version >= 3) and refill vec_memories.
  --code     Walk code_chunks and refill vec_chunks.

Exit 0 when every row embeds cleanly. Exit 2 if any row fails (see
'failed' counter in the JSON output).
`)
      process.exit(0)
    }
    await warmEmbedding()
    const { reindexL2 } = await import('./commands/memory-reindex-l2.js')
    const input: Parameters<typeof reindexL2>[0] = {}
    if (args.includes('--pages')) input.pages = true
    if (args.includes('--code')) input.code = true
    const result = await reindexL2(input)
    console.log(JSON.stringify(result, null, 2))
    if (result.pages.failed > 0 || result.code.failed > 0) process.exit(2)
    return
  }

  // v2a PR 9 Task 45 + v2b PR 9 follow-up — operator-invokable expiration sweep.
  // Idempotent. Also runs on a 24h timer inside the MCP server lifecycle and
  // opportunistically on every start_agent_run. --install writes a per-user
  // launchd plist (macOS) or systemd timer (Linux) so the sweep runs daily
  // without the MCP server being resident.
  if (command === 'sweep-expired') {
    if (args.includes('--install')) {
      const { runSweepInstall } = await import('./commands/sweep-cron-install.js')
      runSweepInstall()
      return
    }
    const moduleName = 'fulcrum-memory'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memoryPkg = (await import(/* @vite-ignore */ moduleName)) as any
    const r = memoryPkg.sweepExpiredMemories?.()
    console.log(`[sweep] removed ${r?.rowsDeleted ?? 0} expired memories at ${r?.ranAt ?? 'unknown'}`)
    return
  }

  // v2a PR 5 Task 28 + v2b PR 15 completion — operator-only rollback.
  // Intentionally NOT registered in TOOL_REGISTRY so a compromised agent
  // with action-exec access cannot call it.
  if (command === 'rollback') {
    const { runMemoryRollback } = await import('./commands/memory-rollback.js')
    await runMemoryRollback(args)
    return
  }

  // v2b PR 15 Task 6.3 — operator-only WAL replay. NOT in TOOL_REGISTRY.
  if (command === 'replay-wal') {
    const { runMemoryReplayWal } = await import('./commands/memory-replay-wal.js')
    await runMemoryReplayWal(args)
    return
  }

  // Fix #24 — SQLite ↔ Kuzu graph consistency check.
  if (command === 'graph-consistency-check') {
    const { buildDeps, TOOL_REGISTRY } = await import('./tool-registry.js')
    const { getDb, runMigrations, projectIdsFromPath } = await import('fulcrum-agent-core')
    const db = getDb()
    runMigrations(db)
    const { workspace_id, project_id } = projectIdsFromPath(process.cwd())
    const deps = buildDeps(workspace_id, project_id)
    const entry = TOOL_REGISTRY.get('graph_consistency_check')
    if (!entry) { console.error('graph_consistency_check not registered'); process.exit(1) }
    const sampleSize = args.find(a => a.startsWith('--sample-size='))?.split('=')[1]
    const alertThreshold = args.find(a => a.startsWith('--alert-threshold='))?.split('=')[1]
    const result = await entry.handler({
      ...(sampleSize ? { sample_size: Number(sampleSize) } : {}),
      ...(alertThreshold ? { alert_threshold: Number(alertThreshold) } : {}),
    }, deps) as { isDrifting: boolean; driftPct: number; totalChecked: number; missingInKuzu: number; missing?: Array<{ table: string; id: string }>; error?: string }
    if (result.error) {
      console.error(`[graph-consistency] ${result.error}`)
      process.exit(1)
    }
    const pct = (result.driftPct * 100).toFixed(2)
    const status = result.isDrifting ? '⚠ DRIFTING' : '✓ OK'
    console.log(`[graph-consistency] ${status} — ${result.missingInKuzu}/${result.totalChecked} missing in Kuzu (${pct}%)`)
    if (result.isDrifting && result.missing) {
      for (const m of result.missing.slice(0, 20)) {
        console.log(`  missing: ${m.table}/${m.id}`)
      }
    }
    process.exit(result.isDrifting ? 1 : 0)
  }

  console.error(`Unknown memory command: ${command}`)
  console.error('Run `fulcrum memory --help` for available commands.')
  process.exit(1)
}

// ── Hook commands ─────────────────────────────────────────────────────────────
// Types and pre/post handlers live in hooks.ts; re-exported here for backward
// compatibility (tests import these from index.ts via the public barrel).

export type { HookCli, NormalizedHookEvent, HookPhase, HookContext, HookOutput, HookIO } from './hooks.js'
export { normalizeHookEvent, runPreHook, runPostHook, detectHookCli } from './hooks.js'
// Also import into local scope so runHook() can call them as functions.
import { normalizeHookEvent, runPreHook, runPostHook, detectHookCli } from './hooks.js'
import type { HookCli, HookPhase, HookContext, HookIO } from './hooks.js'

// ── Session lifecycle hooks ───────────────────────────────────────────────────
// These are called by Claude Code's SessionStart / Stop hooks (not PreToolUse).
// They establish the run_id for the session and complete it on stop.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

// globalDataDir is imported from fulcrum-agent-core (single canonical implementation)

function getSessionFilePath(sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128)
  const dir = join(globalDataDir(), 'sessions')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${safeId}.json`)
}

/**
 * SessionStart hook: auto-start an agent run and stash the run_id.
 * Claude Code calls this once when a new session opens.
 * Stdin: JSON with { session_id, cwd, model? }
 */
export async function runSessionStartHook(): Promise<void> {
  const chunks: Buffer[] = []
  process.stdin.on('data', (c: Buffer) => chunks.push(c))
  await new Promise<void>(r => process.stdin.on('end', r))
  const raw = Buffer.concat(chunks).toString('utf-8').trim()

  let sessionId = process.env['CLAUDE_SESSION_ID'] ?? ''
  let model: string | undefined

  if (raw) {
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>
      sessionId = (evt['session_id'] as string) || sessionId || `sess_${Date.now()}`
      model = evt['model'] as string | undefined
    } catch { /* use env fallback */ }
  }

  if (!sessionId) sessionId = `sess_${Date.now()}`
  // CLI-002: sanitize session ID before use as filesystem path component
  sessionId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128)

  try {
    const { startAgentRun, getDb, runMigrations, loadConfig } = await import('fulcrum-agent-core')
    const config = loadConfig()
    const db = getDb()
    runMigrations(db)

    const wsId = config.workspace_id ?? 'default'
    const projId = config.project_id ?? wsId

    // Auto-ensure workspace + project exist
    const now = new Date().toISOString()
    db.prepare('INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES (?, ?, ?, ?)')
      .run(wsId, wsId, 'active', now)
    db.prepare('INSERT OR IGNORE INTO projects (project_id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)')
      .run(projId, wsId, projId, now)

    // CLI-012: read role from env var with software_engineer as fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agentRole = (process.env['FULCRUM_AGENT_ROLE'] ?? 'software_engineer') as any

    const run = await startAgentRun({
      role: agentRole,
      workspace_id: wsId,
      agent_id: `claude/${sessionId.slice(0, 12)}`,
      pi_profile: model ?? 'claude',
      context_type: 'primary',
    })

    // Pre-fetch workspace snapshot for injection in PreToolUse hooks (non-blocking).
    // Reduces redundant get_workspace_status + list_tasks calls at session start.
    let workspaceSnapshot: Record<string, unknown> | undefined
    let fetchedAt: string | undefined
    try {
      const { TOOL_REGISTRY, buildDeps } = await import('./tool-registry.js')
      const snapDeps = buildDeps(wsId, projId)
      const [statusResult, tasksResult] = await Promise.all([
        TOOL_REGISTRY.get('get_workspace_status')!.handler({ workspace_id: wsId }, snapDeps),
        TOOL_REGISTRY.get('list_tasks')!.handler({ workspace_id: wsId, project_id: projId, status: 'open', limit: 10 }, snapDeps),
      ])
      workspaceSnapshot = { status: statusResult, tasks: tasksResult }
      fetchedAt = new Date().toISOString()
    } catch { /* non-fatal — session file written without snapshot */ }

    const sessionFile = getSessionFilePath(sessionId)
    writeFileSync(sessionFile, JSON.stringify({
      session_id: sessionId,
      run_id: run.run_id,
      workspace_id: wsId,
      project_id: projId,
      started_at: now,
      ...(workspaceSnapshot ? { workspace_snapshot: workspaceSnapshot, fetched_at: fetchedAt } : {}),
    }, null, 2))

    process.stderr.write(`[fulcrum/session] run started: ${run.run_id}\n`)
  } catch (err) {
    process.stderr.write(`[fulcrum/session-start] error (non-fatal): ${(err as Error).message}\n`)
  }

  // Always exit 0 — never block the session from starting
  process.exit(0)
}

/**
 * Stop hook: mark the run as completed.
 * Claude Code calls this when the session is closing.
 * Stdin: JSON with { session_id }
 */
export async function runSessionStopHook(): Promise<void> {
  const chunks: Buffer[] = []
  process.stdin.on('data', (c: Buffer) => chunks.push(c))
  await new Promise<void>(r => process.stdin.on('end', r))
  const raw = Buffer.concat(chunks).toString('utf-8').trim()

  let sessionId = process.env['CLAUDE_SESSION_ID'] ?? ''
  if (raw) {
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>
      sessionId = (evt['session_id'] as string) || sessionId
    } catch { /* use env fallback */ }
  }

  if (!sessionId) {
    process.exit(0)
    return
  }

  try {
    const sessionFile = getSessionFilePath(sessionId)
    if (!existsSync(sessionFile)) {
      process.exit(0)
      return
    }
    const session = JSON.parse(readFileSync(sessionFile, 'utf-8')) as {
      run_id: string; workspace_id: string
    }

    const { completeAgentRun, getDb, runMigrations, loadConfig } = await import('fulcrum-agent-core')
    const config = loadConfig()
    const db = getDb()
    runMigrations(db)
    void config // loadConfig used for side effects (db path)

    await completeAgentRun({
      run_id: session.run_id,
      output_summary: 'Claude session ended',
    })
    process.stderr.write(`[fulcrum/session] run completed: ${session.run_id}\n`)
  } catch (err) {
    process.stderr.write(`[fulcrum/session-stop] error (non-fatal): ${(err as Error).message}\n`)
  }

  process.exit(0)
}

/**
 * PreCompact hook: write a memory entry from the compaction summary.
 * Claude Code calls this before context compaction.
 * Stdin: JSON with { session_id, summary }
 */
export async function runPreCompactHook(): Promise<void> {
  const chunks: Buffer[] = []
  process.stdin.on('data', (c: Buffer) => chunks.push(c))
  await new Promise<void>(r => process.stdin.on('end', r))
  const raw = Buffer.concat(chunks).toString('utf-8').trim()

  if (!raw) { process.exit(0); return }

  let sessionId = process.env['CLAUDE_SESSION_ID'] ?? 'unknown'
  let summary = ''

  try {
    const evt = JSON.parse(raw) as Record<string, unknown>
    sessionId = (evt['session_id'] as string) || sessionId
    summary = (evt['summary'] as string) || (evt['compaction_summary'] as string) || ''
  } catch { process.exit(0); return }

  if (!summary) { process.exit(0); return }

  try {
    const { getDb, runMigrations, loadConfig } = await import('fulcrum-agent-core')
    const { writeMemory } = await import('fulcrum-memory')
    const config = loadConfig()
    const db = getDb()
    runMigrations(db)
    void db

    const compactTitle = `Session compact — ${new Date().toISOString().slice(0, 10)}`
    await writeMemory({
      title: compactTitle,
      summary: compactTitle,
      content: summary,
      scope: 'project',
      kind: 'session_summary',
      workspace_id: config.workspace_id ?? 'default',
      project_id: config.project_id ?? config.workspace_id ?? 'default',
      tags: ['session-compact', `session:${sessionId.slice(0, 12)}`],
      importance: 0.7,
    } as Parameters<typeof writeMemory>[0])
    process.stderr.write(`[fulcrum/pre-compact] memory saved (${summary.length} chars)\n`)
  } catch (err) {
    process.stderr.write(`[fulcrum/pre-compact] error (non-fatal): ${(err as Error).message}\n`)
  }

  process.exit(0)
}

// ── Shared lifecycle helpers ──────────────────────────────────────────────────

/** Read all stdin, return trimmed string. */
async function readStdinFully(): Promise<string> {
  const chunks: Buffer[] = []
  process.stdin.on('data', (c: Buffer) => chunks.push(c))
  await new Promise<void>(r => process.stdin.on('end', r))
  return Buffer.concat(chunks).toString('utf-8').trim()
}

/**
 * Lifecycle phases referenced by shipped agent configs
 * (claude/settings-hooks-snippet.json, gemini/hooks/hooks.json,
 * codex/config.toml) but without bespoke handlers yet. Drain stdin so
 * the parent doesn't see EPIPE, log at DEBUG only, and exit 0 so the
 * invoking agent doesn't treat it as a failure.
 */
async function runStubHook(cli: string, phase: string): Promise<void> {
  await readStdinFully()
  if (process.env['FULCRUM_DEBUG'] === '1') {
    process.stderr.write(`[fulcrum hook ${cli} ${phase}] no-op (not yet implemented)\n`)
  }
}

/** Sanitize an arbitrary string for use as a filesystem path component. */
function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128)
}

/**
 * Common session initialization: ensure DB, start run, write session file.
 * Returns session metadata. Throws on unrecoverable errors.
 */
async function initFulcrumSession(opts: {
  sessionId: string
  cliName: string
  model?: string
}): Promise<{ run_id: string; workspace_id: string; project_id: string }> {
  const { startAgentRun, getDb, runMigrations, loadConfig } = await import('fulcrum-agent-core')
  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  const wsId = config.workspace_id ?? 'default'
  const projId = config.project_id ?? wsId
  const now = new Date().toISOString()

  db.prepare('INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES (?, ?, ?, ?)')
    .run(wsId, wsId, 'active', now)
  db.prepare('INSERT OR IGNORE INTO projects (project_id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)')
    .run(projId, wsId, projId, now)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agentRole = (process.env['FULCRUM_AGENT_ROLE'] ?? 'software_engineer') as any
  const run = await startAgentRun({
    role: agentRole,
    workspace_id: wsId,
    agent_id: `${opts.cliName}/${opts.sessionId.slice(0, 12)}`,
    pi_profile: opts.model ?? opts.cliName,
    context_type: 'primary',
  })

  // Pre-fetch workspace snapshot (non-blocking)
  let workspaceSnapshot: Record<string, unknown> | undefined
  let fetchedAt: string | undefined
  try {
    const { TOOL_REGISTRY, buildDeps } = await import('./tool-registry.js')
    const snapDeps = buildDeps(wsId, projId)
    const [statusResult, tasksResult] = await Promise.all([
      TOOL_REGISTRY.get('get_workspace_status')!.handler({ workspace_id: wsId }, snapDeps),
      TOOL_REGISTRY.get('list_tasks')!.handler({ workspace_id: wsId, project_id: projId, status: 'open', limit: 10 }, snapDeps),
    ])
    workspaceSnapshot = { status: statusResult, tasks: tasksResult }
    fetchedAt = new Date().toISOString()
  } catch { /* non-fatal */ }

  const sessionFile = getSessionFilePath(opts.sessionId)
  writeFileSync(sessionFile, JSON.stringify({
    session_id: opts.sessionId,
    run_id: run.run_id,
    workspace_id: wsId,
    project_id: projId,
    started_at: now,
    ...(workspaceSnapshot ? { workspace_snapshot: workspaceSnapshot, fetched_at: fetchedAt } : {}),
  }, null, 2))

  return { run_id: run.run_id, workspace_id: wsId, project_id: projId }
}

/**
 * Complete the run recorded in the session file and clean up.
 */
async function completeFulcrumSession(sessionId: string, summary = ''): Promise<void> {
  const sessionFile = getSessionFilePath(sessionId)
  if (!existsSync(sessionFile)) return

  const { completeAgentRun, getDb, runMigrations, loadConfig } = await import('fulcrum-agent-core')
  const config = loadConfig()
  const db = getDb()
  runMigrations(db)
  void config

  const session = JSON.parse(readFileSync(sessionFile, 'utf-8')) as { run_id: string }
  await completeAgentRun({ run_id: session.run_id, output_summary: summary || 'Session ended' })
  process.stderr.write(`[fulcrum/session] run completed: ${session.run_id}\n`)
}

// ── Gemini lifecycle hooks ────────────────────────────────────────────────────

/**
 * Gemini SessionStart hook.
 * Stdin: JSON with { conversationId?, model? } or empty.
 * Returns: Gemini hook response with { hookSpecificOutput: { additionalContext: "..." } }
 */
export async function runGeminiSessionStartHook(): Promise<void> {
  const raw = await readStdinFully()
  let sessionId = ''
  let model: string | undefined

  if (raw) {
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>
      sessionId = (evt['conversationId'] ?? evt['session_id'] ?? evt['sessionId']) as string ?? ''
      model = evt['model'] as string | undefined
    } catch { /* fallback */ }
  }

  if (!sessionId) sessionId = `gemini_${Date.now()}`
  sessionId = sanitizeId(sessionId)

  let additionalContext = ''
  try {
    const { run_id, workspace_id, project_id } = await initFulcrumSession({ sessionId, cliName: 'gemini', model })
    process.stderr.write(`[fulcrum/session] gemini run started: ${run_id}\n`)
    additionalContext = [
      `Fulcrum workspace: ${workspace_id}  project: ${project_id}`,
      `Run ID: ${run_id}  (use for heartbeat/complete/block calls)`,
      `Type /fulcrum-status for live workspace state.`,
    ].join('\n')
  } catch (err) {
    process.stderr.write(`[fulcrum/session-start] gemini error (non-fatal): ${(err as Error).message}\n`)
  }

  // Gemini hook response format
  if (additionalContext) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { additionalContext },
    }) + '\n')
  }

  process.exit(0)
}

/**
 * Gemini BeforeAgent hook.
 * Injects a fresh workspace snapshot as additionalContext before the LLM turn.
 */
export async function runGeminiBeforeAgentHook(): Promise<void> {
  const raw = await readStdinFully()
  let sessionId = ''

  if (raw) {
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>
      sessionId = (evt['conversationId'] ?? evt['session_id']) as string ?? ''
    } catch { /* fallback */ }
  }

  let additionalContext = ''
  if (sessionId) {
    const sid = sanitizeId(sessionId)
    try {
      const sessionFile = getSessionFilePath(sid)
      if (existsSync(sessionFile)) {
        const session = JSON.parse(readFileSync(sessionFile, 'utf-8')) as Record<string, unknown>
        const fetchedAt = session['fetched_at'] as string | undefined
        const snapshot = session['workspace_snapshot'] as Record<string, unknown> | undefined
        if (snapshot && fetchedAt) {
          const ageMs = Date.now() - new Date(fetchedAt).getTime()
          if (ageMs < 5 * 60 * 1000) {
            additionalContext = `[Fulcrum context — ${Math.round(ageMs / 1000)}s old]\n${JSON.stringify(snapshot).slice(0, 800)}`
          }
        }
      }
    } catch { /* best-effort */ }
  }

  if (additionalContext) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { additionalContext },
    }) + '\n')
  }

  process.exit(0)
}

/**
 * Gemini SessionEnd hook.
 * Completes the run started by SessionStart.
 */
export async function runGeminiSessionEndHook(): Promise<void> {
  const raw = await readStdinFully()
  let sessionId = ''

  if (raw) {
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>
      sessionId = (evt['conversationId'] ?? evt['session_id']) as string ?? ''
    } catch { /* fallback */ }
  }

  if (sessionId) {
    try {
      await completeFulcrumSession(sanitizeId(sessionId), 'Gemini session ended')
    } catch (err) {
      process.stderr.write(`[fulcrum/session-end] gemini error (non-fatal): ${(err as Error).message}\n`)
    }
  }

  process.exit(0)
}

// ── Codex lifecycle hooks ─────────────────────────────────────────────────────

/**
 * Codex SessionStart hook.
 * Stdin: JSON with { hook_event_name: "SessionStart", session_id?, ... }
 * Returns: { hook_specific_output: { hook_event_name: "SessionStart", additional_context: "..." } }
 */
export async function runCodexSessionStartHook(): Promise<void> {
  const raw = await readStdinFully()
  let sessionId = process.env['CODEX_SESSION_ID'] ?? ''
  let model: string | undefined

  if (raw) {
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>
      sessionId = (evt['session_id'] as string) || sessionId || `codex_${Date.now()}`
      model = evt['model'] as string | undefined
    } catch { /* fallback */ }
  }

  if (!sessionId) sessionId = `codex_${Date.now()}`
  sessionId = sanitizeId(sessionId)

  let additionalContext = ''
  try {
    const { run_id, workspace_id, project_id } = await initFulcrumSession({ sessionId, cliName: 'codex', model })
    process.stderr.write(`[fulcrum/session] codex run started: ${run_id}\n`)
    additionalContext = [
      `Fulcrum workspace: ${workspace_id}  project: ${project_id}`,
      `Run ID: ${run_id}`,
      `Use \`fulcrum action exec\` to interact with the control plane.`,
    ].join('\n')
  } catch (err) {
    process.stderr.write(`[fulcrum/session-start] codex error (non-fatal): ${(err as Error).message}\n`)
  }

  // Codex hook response format
  if (additionalContext) {
    process.stdout.write(JSON.stringify({
      hook_specific_output: {
        hook_event_name: 'SessionStart',
        additional_context: additionalContext,
      },
    }) + '\n')
  }

  process.exit(0)
}

/**
 * Codex Stop hook.
 * Completes the run started by SessionStart.
 */
export async function runCodexStopHook(): Promise<void> {
  const raw = await readStdinFully()
  let sessionId = process.env['CODEX_SESSION_ID'] ?? ''

  if (raw) {
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>
      sessionId = (evt['session_id'] as string) || sessionId
    } catch { /* fallback */ }
  }

  if (sessionId) {
    try {
      await completeFulcrumSession(sanitizeId(sessionId), 'Codex session ended')
    } catch (err) {
      process.stderr.write(`[fulcrum/session-end] codex error (non-fatal): ${(err as Error).message}\n`)
    }
  }

  process.exit(0)
}

async function runHook(cliName: string, phase: HookPhase = 'pre'): Promise<void> {
  if (cliName === '--help' || cliName === '-h' || !cliName) {
    console.log(`
fulcrum hook — tool-call policy hooks and session lifecycle for coding agents

  fulcrum hook auto   [pre|post]           Auto-detect runtime from stdin event shape
  fulcrum hook claude [pre|post]           Claude Code PreToolUse / PostToolUse hook
  fulcrum hook claude session-start        Claude Code SessionStart hook
  fulcrum hook claude session-stop         Claude Code Stop hook
  fulcrum hook claude pre-compact          Claude Code PreCompact hook
  fulcrum hook gemini [pre|post]           Gemini CLI BeforeTool / AfterTool hook
  fulcrum hook gemini session-start        Gemini CLI SessionStart hook (auto-starts run)
  fulcrum hook gemini before-agent         Gemini CLI BeforeAgent hook (injects context)
  fulcrum hook gemini session-end          Gemini CLI SessionEnd hook (completes run)
  fulcrum hook codex  [pre|post]           Codex CLI PreToolUse / PostToolUse hook
  fulcrum hook codex  session-start        Codex CLI SessionStart hook (auto-starts run)
  fulcrum hook codex  session-end          Codex CLI Stop hook (completes run)
  fulcrum hook pi     [pre|post]           PI coding agent BeforeTool / AfterTool hook

Phase defaults to 'pre' when omitted (legacy). The pre hook normalises
the event, scans for secrets, enforces the team-invoke policy, and
recalls relevant task memories (surfaced via stderr). The post hook
writes a tool_trace operational memory for the call.

Use 'auto' as a single hook entry point for any supported runtime —
the event shape is inspected at runtime to determine the correct handler.
`)
    process.exit(0)
  }

  // Migrations and workspace/project already set up by ensureProjectInitialized()
  // in main(). We just need the IDs for event logging.
  const { workspace_id } = currentProjectIds()

  // Read stdin
  const chunks: Buffer[] = []
  process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
  await new Promise<void>(resolve => process.stdin.on('end', resolve))
  const raw = Buffer.concat(chunks).toString('utf-8').trim()

  if (!raw) process.exit(0)

  let event: Record<string, unknown>
  try {
    event = JSON.parse(raw) as Record<string, unknown>
  } catch {
    // Can't parse hook event — fail open (allow)
    process.exit(0)
  }

  // If caller used 'auto', detect the runtime from the event shape now that
  // stdin has been read.  Gracefully allow (continue: true) on unknown shapes.
  if (cliName === 'auto') {
    const detected = detectHookCli(event)
    if (!detected) {
      process.stdout.write(JSON.stringify({ continue: true }) + '\n')
      process.exit(0)
      return
    }
    cliName = detected
  }

  // Normalise to canonical shape based on CLI type
  const { toolName, toolInput, sessionId, agentRole, runId } = normalizeHookEvent(cliName as HookCli, event)

  // Log the tool call (best-effort) — attached to the auto-initialized workspace
  try {
    const { emitEvent } = await import('fulcrum-agent-core')
    emitEvent({
      workspace_id,
      evt_type: 'hook_executed',
      object_type: 'tool_call',
      object_id: runId || undefined,
      actor_type: 'agent',
      actor_id: `${cliName}/${sessionId.slice(0, 8)}${runId ? ':' + runId.slice(-8) : ''}`,
      payload: {
        tool_name: toolName,
        tool_input_keys: Object.keys(toolInput),
        session_id: sessionId,
        run_id: runId || undefined,
        phase,
      },
    })
  } catch { /* logging best-effort */ }

  const ctx: HookContext = {
    cliName: cliName as HookCli,
    phase,
    toolName,
    toolInput,
    sessionId,
    agentRole,
    runId,
    workspace_id,
  }
  const io: HookIO = {
    stdout: (msg: string) => process.stdout.write(msg + '\n'),
    stderr: (msg: string) => process.stderr.write(msg),
    exit: (code: number) => process.exit(code),
  }

  if (phase === 'pre') {
    await runPreHook(ctx, io)
  } else {
    await runPostHook(ctx, io)
  }
}

// ── Plugin additional tools ───────────────────────────────────────────────────
// Populated in main() after registerPlugins(); consumed by runServeMcp().
import type { ToolSchema } from './mcp-tools.js'
let _pluginAdditionalTools: ToolSchema[] = []
let _pluginAdditionalActions: Array<{ action_name: string; mcp: ToolSchema }> = []

// ── Monitor auto-start state ──────────────────────────────────────────────────
// Tracks whether the in-process monitor was already started so runServeMcp()
// and runServeAll() don't race to start it twice.
let _monitorStarted = false
// Stored so the SIGTERM/SIGINT handler can call stop() to close the HTTP socket.
let _monitorServer: { stop(): void } | null = null

// ── Monitor probe cache ───────────────────────────────────────────────────────
// Monitor probe — moved to tool-registry.ts (lives with get_current_context handler).
// Re-exported here for backward-compat with existing tests.
import { probeMonitor, resetMonitorProbeCache } from './tool-registry.js'

async function probeMonitor_local(url: string): Promise<boolean> {
  return probeMonitor(url)
}

// ── Test helpers (not part of the public CLI surface) ────────────────────────
export async function probeMonitorForTest(url: string): Promise<boolean> {
  return probeMonitor_local(url)
}
export function _resetMonitorProbeCache(): void {
  resetMonitorProbeCache()
}
export function _setMonitorStarted(val: boolean): void {
  _monitorStarted = val
}
export async function _buildCurrentContextResponseForTest(): ReturnType<typeof buildCurrentContextResponse> {
  return buildCurrentContextResponse()
}
export function _setProjectIdsForTest(ids: { workspace_id: string; project_id: string } | null): void {
  _projectIds = ids
}

// ── Shared get_current_context response builder ───────────────────────────────
// Both the stdio MCP handler (runServeMcp) and the HTTP MCP handler
// (runServeMcpHttp) use identical logic. A single canonical builder avoids
// divergence: the stdio handler uses currentProjectIds() (path-derived IDs)
// which is the correct source of truth; the HTTP handler previously used
// config.workspace_id (file-derived) and could return different values.
async function buildCurrentContextResponse(): Promise<{
  workspace_id: string; project_id: string; cwd: string
  readiness: { tools_available: number; monitor_url: string; monitor_running: boolean; suggested_next_call: string }
}> {
  // Delegate to the unified registry handler so stdio and HTTP paths stay in sync.
  const { TOOL_REGISTRY, buildDeps } = await import('./tool-registry.js')
  const ids = currentProjectIds()
  const deps = buildDeps(ids.workspace_id, ids.project_id)
  return TOOL_REGISTRY.get('get_current_context')!.handler({}, deps) as Promise<{
    workspace_id: string; project_id: string; cwd: string
    readiness: { tools_available: number; monitor_url: string; monitor_running: boolean; suggested_next_call: string }
  }>
}

// ── Tool commands ─────────────────────────────────────────────────────────────

async function runTool(): Promise<void> {
  const sub = command  // 'exec' | 'list' | '--help' | undefined

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum tool — invoke MCP tools directly without a live MCP server

  fulcrum tool list [--json]           List all available tools
  fulcrum tool exec <name>             Execute tool with cwd context (reads stdin for payload)
  fulcrum tool exec <name> --json <p>  Execute with inline JSON payload string
`)
    return
  }

  const { buildDeps, getRegistryEntry, listActionDefinitions } = await import('./tool-registry.js')
  const ids = currentProjectIds()
  const deps = buildDeps(ids.workspace_id, ids.project_id)

  if (sub === 'list') {
    const json = args.includes('--json')
    const actions = listActionDefinitions()
    if (json) {
      const rows = actions.map(action => ({
        name: action.action_name,
        mcpTool: action.mcp.toolName ?? null,
        primaryCommand: action.cli.primaryCommand.join(' '),
        compatibilityCommand: action.cli.compatibilityCommand?.join(' ') ?? null,
        hookCoverage: action.hooks.coverage,
      }))
      console.log(JSON.stringify(rows, null, 2))
    } else {
      const padded = actions.map(action =>
        `  ${action.action_name.padEnd(30)} ${action.cli.primaryCommand.join(' ')}`,
      )
      console.log('Available tools:\n' + padded.join('\n'))
    }
    return
  }

  if (sub === 'exec') {
    const toolName = args[2]
    if (!toolName || toolName.startsWith('--')) {
      console.error('Usage: fulcrum tool exec <tool-name> [--json <payload>]')
      process.exit(1)
    }

    const entry = getRegistryEntry(toolName)
    if (!entry) {
      console.error(`Unknown tool: ${toolName}`)
      console.error('Run `fulcrum tool list` to see available tools.')
      process.exit(1)
    }

    // Parse payload: --json <string> or stdin
    let toolArgs: Record<string, unknown> = {}
    const jsonFlagIdx = args.indexOf('--json')
    if (jsonFlagIdx !== -1 && jsonFlagIdx < args.length - 1) {
      // --json '<payload>' inline
      try {
        toolArgs = JSON.parse(args[jsonFlagIdx + 1]!) as Record<string, unknown>
      } catch (err) {
        console.error(`Invalid JSON payload: ${(err as Error).message}`)
        process.exit(1)
      }
    } else if (!process.stdin.isTTY) {
      // Read from stdin pipe
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (raw) {
        try {
          toolArgs = JSON.parse(raw) as Record<string, unknown>
        } catch (err) {
          console.error(`Invalid JSON from stdin: ${(err as Error).message}`)
          process.exit(1)
        }
      }
    }

    try {
      const result = await entry.handler(toolArgs, deps)
      console.log(JSON.stringify(result, null, 2))
    } catch (err) {
      console.error(JSON.stringify({ error: (err as Error).message, tool: toolName }))
      process.exit(1)
    }
    return
  }

  console.error(`Unknown tool subcommand: ${sub}`)
  console.error('Usage: fulcrum tool list | fulcrum tool exec <name>')
  process.exit(1)
}

export async function runAction(): Promise<void> {
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum action — invoke canonical Fulcrum actions directly

  fulcrum action list [--json]           List canonical actions and mappings
  fulcrum action exec <name>             Execute action with cwd context (reads stdin for payload)
  fulcrum action exec <name> --json <p>  Execute with inline JSON payload string
`)
    return
  }

  const { buildDeps, getActionDefinition, getRegistryEntry, listActionDefinitions } = await import('./tool-registry.js')
  const ids = currentProjectIds()
  const deps = buildDeps(ids.workspace_id, ids.project_id)

  if (sub === 'list') {
    const actions = listActionDefinitions()
    if (args.includes('--json')) {
      console.log(JSON.stringify(actions, null, 2))
    } else {
      const rows = actions.map(action =>
        `  ${action.action_name.padEnd(30)} ${action.cli.primaryCommand.join(' ')}`
      )
      console.log('Available actions:\n' + rows.join('\n'))
    }
    return
  }

  if (sub === 'exec') {
    const actionName = args[2]
    if (!actionName || actionName.startsWith('--')) {
      console.error('Usage: fulcrum action exec <action-name> [--json <payload>]')
      process.exit(1)
    }

    const action = getActionDefinition(actionName)
    const entry = getRegistryEntry(actionName)
    if (!action || !entry) {
      console.error(`Unknown action: ${actionName}`)
      console.error('Run `fulcrum action list` to see available actions.')
      process.exit(1)
    }

    let actionArgs: Record<string, unknown> = {}
    const jsonFlagIdx = args.indexOf('--json')
    // Also accept positional JSON as the 4th argument (args[3])
    const positionalJson = args[3] && !args[3].startsWith('--') ? args[3] : undefined
    if (jsonFlagIdx !== -1 && jsonFlagIdx < args.length - 1) {
      try {
        actionArgs = JSON.parse(args[jsonFlagIdx + 1]!) as Record<string, unknown>
      } catch (err) {
        console.error(`Invalid JSON payload: ${(err as Error).message}`)
        process.exit(1)
      }
    } else if (positionalJson) {
      try {
        actionArgs = JSON.parse(positionalJson) as Record<string, unknown>
      } catch (err) {
        console.error(`Invalid JSON payload: ${(err as Error).message}`)
        process.exit(1)
      }
    } else if (!process.stdin.isTTY) {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (raw) {
        try {
          actionArgs = JSON.parse(raw) as Record<string, unknown>
        } catch (err) {
          console.error(`Invalid JSON from stdin: ${(err as Error).message}`)
          process.exit(1)
        }
      }
    }

    try {
      const result = await entry.handler(actionArgs, deps)
      console.log(JSON.stringify({
        action: action.action_name,
        result,
      }, null, 2))
    } catch (err) {
      console.error(JSON.stringify({ error: (err as Error).message, action: action.action_name }))
      process.exit(1)
    }
    // Drain fire-and-forget embed/extract work before process exit — actions
    // that write memories (e.g. write_memory) queue vec_memories embeds via
    // bounded-concurrency. Without this flush, short-lived CLI invocations
    // commit the L1 row but leave vec_memories empty.
    try {
      const { flushPendingMemoryWrites } = await import('fulcrum-memory')
      await flushPendingMemoryWrites(30_000)
    } catch { /* flush is best-effort */ }
    return
  }

  console.error(`Unknown action subcommand: ${sub}`)
  console.error('Usage: fulcrum action list | fulcrum action exec <name>')
  process.exit(1)
}

// ── Serve commands ────────────────────────────────────────────────────────────

let _embeddingWarmed = false
async function warmEmbedding(): Promise<void> {
  if (_embeddingWarmed) return
  const { initEmbedding, loadConfig } = await import('fulcrum-agent-core')
  try {
    const config = loadConfig()
    await initEmbedding(config)
    _embeddingWarmed = true
    process.stderr.write('[fulcrum] embedding model ready\n')
  } catch (err) {
    process.stderr.write(`[fulcrum] embedding init failed: ${(err as Error).message}\n`)
    process.exit(1)
  }
}

let _otelWarmed = false
async function warmOtel(): Promise<void> {
  if (_otelWarmed) return
  const { initOtel } = await import('fulcrum-agent-core')
  try {
    await initOtel()
  } catch (err) {
    process.stderr.write(`[fulcrum] otel init failed: ${(err as Error).message}\n`)
  }
  _otelWarmed = true
}

let _otelShutdownRegistered = false
function registerOtelShutdown(): void {
  if (_otelShutdownRegistered) return
  _otelShutdownRegistered = true
  const handler = async () => {
    try { _monitorServer?.stop() } catch { /* best-effort */ }
    _monitorServer = null
    try {
      const { shutdownOtel } = await import('fulcrum-agent-core')
      await shutdownOtel()
    } catch { /* best-effort */ }
    process.exit(0)
  }
  process.once('SIGINT', handler)
  process.once('SIGTERM', handler)
  process.on('exit', () => {
    try { _monitorServer?.stop() } catch { /* best-effort */ }
  })
}

async function runServeMcp(): Promise<void> {
  const { getDb, runMigrations, loadConfig, startSpan, endSpan } = await import('fulcrum-agent-core')
  const { TOOL_REGISTRY, buildDeps } = await import('./tool-registry.js')

  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  await warmEmbedding()
  await warmOtel()
  registerOtelShutdown()

  const ids = currentProjectIds()
  const deps = buildDeps(ids.workspace_id, ids.project_id)

  // ── SDK-based MCP server (protocol 2025-11-25) ──
  const { runFulcrumMcpServer } = await import('./mcp-server.js')

  // Thin adapter: delegates every tool call to the unified registry.
  async function handleToolCall(name: string, toolArgs: Record<string, unknown>): Promise<unknown> {
    const entry = TOOL_REGISTRY.get(name)
    if (!entry) throw new Error(`Unknown tool: ${name}`)
    return entry.handler(toolArgs, deps)
  }

  // Wrap handleToolCall with telemetry spans
  async function handleToolCallWithSpan(name: string, toolArgs: Record<string, unknown>): Promise<unknown> {
    const spanWorkspaceId =
      (toolArgs['workspace_id'] as string | undefined) ?? ids.workspace_id
    const mcpSpan = await startSpan({
      name: 'mcp.tool',
      workspace_id: spanWorkspaceId,
      payload: { tool_name: name, arg_keys: Object.keys(toolArgs) },
    })
    try {
      const result = await handleToolCall(name, toolArgs)
      await endSpan({ span_id: mcpSpan.span_id, status: 'ok', payload: { tool_name: name } })
      return result
    } catch (err) {
      await endSpan({ span_id: mcpSpan.span_id, status: 'error', payload: { error: (err as Error).message } })
      throw err
    }
  }

  // Silence unused variable warning — config is used below for workspace auto-init
  void config

  const exposurePlan = await buildExposurePlanFromArgs()

  // ── Auto-start monitor ────────────────────────────────────────────────────
  // Start the HTTP monitor in-process alongside the MCP stdio server unless:
  //   - FULCRUM_NO_MONITOR=1 env var is set
  //   - --no-monitor flag is passed
  //   - monitor was already started (e.g. called from runServeAll)
  const NO_MONITOR = process.env['FULCRUM_NO_MONITOR'] === '1' || args.includes('--no-monitor')
  if (!NO_MONITOR && !_monitorStarted) {
    try {
      const { startMonitorServer } = await import('fulcrum-monitor')
      const { projectIdsFromPath } = await import('fulcrum-agent-core')
      const monitorPort = parseInt(process.env['FULCRUM_MONITOR_PORT'] ?? '4721', 10) || 4721
      // Fall back to the deterministic cwd-derived workspace_id so the web UI
      // and /agents|/board endpoints have a scope to filter on. Without this,
      // /status returns workspace_id: null and every panel fetches without a
      // query param → 400 "workspace_id required" → empty dashboard.
      const monitorWorkspaceId = config.workspace_id || projectIdsFromPath(process.cwd()).workspace_id
      const monitorServer = startMonitorServer({
        port: monitorPort,
        workspace_id: monitorWorkspaceId,
      })
      await monitorServer.start()
      _monitorStarted = true
      _monitorServer = monitorServer
      process.stderr.write(`[fulcrum] Monitor running on http://127.0.0.1:${monitorPort}\n`)
    } catch (err) {
      _monitorStarted = true  // prevent retry on next runServeMcp() call
      const hint = err instanceof Error && err.message.includes('EADDRINUSE')
        ? ' (port in use — set FULCRUM_MONITOR_PORT or FULCRUM_NO_MONITOR=1 to skip)'
        : ''
      // Non-fatal: MCP server still works without the monitor
      process.stderr.write(`[fulcrum] Monitor auto-start failed (non-fatal): ${(err as Error).message}${hint}\n`)
    }
  }

  // ── Acquire long-lived PCI watcher ────────────────────────────────────────
  // Chokidar mount for the cwd, singleton per project root. If another
  // process already owns this project's lock we attach read-only (no second
  // watcher is spawned). Opt out with FULCRUM_DISABLE_PCI=1.
  if (process.env['FULCRUM_DISABLE_PCI'] !== '1') {
    try {
      const { indexerClient } = await import('fulcrum-memory')
      const r = await indexerClient().ensureWatching(process.cwd())
      const verb = r.already_watched ? 'attached to existing' : 'mounted new'
      process.stderr.write(`[fulcrum] PCI watcher ${verb} on ${process.cwd()}\n`)
    } catch (err) {
      process.stderr.write(`[fulcrum] PCI watcher unavailable (non-fatal): ${(err as Error).message}\n`)
    }
  }

  // Memory v3 PR 8.1 — vault-watcher-driven auto-curation (opt-in via
  // FULCRUM_MEMORY_CURATE_AUTO=1). No-op when the env flag is unset.
  try {
    const { startMemoryAutoCurateIfEnabled } = await import('./commands/memory-auto-curate-wiring.js')
    await startMemoryAutoCurateIfEnabled()
  } catch (err) {
    process.stderr.write(`[fulcrum] auto-curate wiring failed (non-fatal): ${(err as Error).message}\n`)
  }

  // Memory v3 PR 8.2 — scheduled consolidation scan (opt-in via
  // FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE={hourly|daily}). No-op when unset.
  try {
    const { startMemoryConsolidateScheduleIfEnabled } = await import('./commands/memory-consolidate-schedule-wiring.js')
    await startMemoryConsolidateScheduleIfEnabled()
  } catch (err) {
    process.stderr.write(`[fulcrum] consolidate cron wiring failed (non-fatal): ${(err as Error).message}\n`)
  }

  await runFulcrumMcpServer({
    version: '0.0.2',
    handleToolCall: handleToolCallWithSpan,
    filter: exposurePlan.filter,
    additionalTools: _pluginAdditionalTools,
  })
}

async function runMcpPlanner(): Promise<void> {
  if (command === '--help' || command === '-h') {
    console.log(`
fulcrum mcp — MCP exposure planning and compatibility utilities

  fulcrum mcp plan [--json]
  fulcrum mcp plan --mode <full|filtered|minimal>
  fulcrum mcp plan --profile <role|hook-only>
  fulcrum mcp plan --agent-type <role>
  fulcrum mcp plan --platform <platform>
  fulcrum mcp plan --runtime-capability <cap>
  fulcrum mcp plan --include-action <action>
  fulcrum mcp plan --exclude-action <action>
`)
    return
  }

  if (command !== 'plan') {
    console.error(`Unknown mcp command: ${command}`)
    console.error('Usage: fulcrum mcp plan [--json]')
    process.exit(1)
  }

  const plan = await buildExposurePlanFromArgs()

  if (args.includes('--json')) {
    console.log(JSON.stringify(plan.decisions, null, 2))
    return
  }

  const lines = plan.decisions.map(decision => {
    const status = decision.exposed ? 'expose' : 'hide'
    return `${status.padEnd(7)} ${decision.toolName.padEnd(28)} ${decision.reasons.join(', ')}`
  })
  console.log(lines.join('\n'))
}

async function runServeMcpHttp(): Promise<void> {
  const { getDb, runMigrations, loadConfig, startSpan, endSpan } = await import('fulcrum-agent-core')
  const { TOOL_REGISTRY, buildDeps } = await import('./tool-registry.js')
  const { runFulcrumMcpHttpServer } = await import('./mcp-server.js')

  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  await warmEmbedding()
  await warmOtel()
  registerOtelShutdown()

  const ids = currentProjectIds()
  const deps = buildDeps(ids.workspace_id, ids.project_id)
  void db  // used via deps.db; suppress unused-var lint
  const exposurePlan = await buildExposurePlanFromArgs()

  const portArg = args.find(a => a.startsWith('--port'))
  let port = 4722
  if (portArg) {
    const idx = args.indexOf(portArg)
    const val = portArg.includes('=') ? portArg.split('=')[1] : args[idx + 1]
    if (val) port = parseInt(val, 10)
  }

  // Thin adapter: delegates every tool call to the unified registry.
  async function handleToolCall(name: string, toolArgs: Record<string, unknown>): Promise<unknown> {
    const entry = TOOL_REGISTRY.get(name)
    if (!entry) throw new Error(`Unknown tool: ${name}`)
    return entry.handler(toolArgs, deps)
  }

  async function handleToolCallWithSpan(name: string, toolArgs: Record<string, unknown>): Promise<unknown> {
    const spanWorkspaceId = (toolArgs['workspace_id'] as string | undefined) ?? config.workspace_id ?? ''
    const mcpSpan = await startSpan({ name: 'mcp.tool', workspace_id: spanWorkspaceId, payload: { tool_name: name, arg_keys: Object.keys(toolArgs) } })
    try {
      const result = await handleToolCall(name, toolArgs)
      await endSpan({ span_id: mcpSpan.span_id, status: 'ok', payload: { tool_name: name } })
      return result
    } catch (err) {
      await endSpan({ span_id: mcpSpan.span_id, status: 'error', payload: { error: (err as Error).message } })
      throw err
    }
  }

  await runFulcrumMcpHttpServer({
    version: '0.0.2',
    handleToolCall: handleToolCallWithSpan,
    filter: exposurePlan.filter,
    additionalTools: _pluginAdditionalTools,
    port,
  })
}

async function runServeMonitor(): Promise<void> {
  const { startMonitorServer } = await import('fulcrum-monitor')
  const { getDb, runMigrations, loadConfig, projectIdsFromPath } = await import('fulcrum-agent-core')

  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  await warmEmbedding()
  await warmOtel()
  registerOtelShutdown()

  const portArg = args.find(a => a.startsWith('--port'))
  let port = config.port ?? 4721
  if (portArg) {
    const idx = args.indexOf(portArg)
    const val = portArg.includes('=') ? portArg.split('=')[1] : args[idx + 1]
    if (val) port = parseInt(val, 10)
  }

  const server = startMonitorServer({ port, workspace_id: config.workspace_id || projectIdsFromPath(process.cwd()).workspace_id })

  // Mount the PCI watcher for the cwd if nobody else already owns it. The
  // singleton's file lock does the cross-process dedup — same lock as
  // `serve mcp` uses, so running both in parallel is safe.
  if (process.env['FULCRUM_DISABLE_PCI'] !== '1') {
    try {
      const { indexerClient } = await import('fulcrum-memory')
      const r = await indexerClient().ensureWatching(process.cwd())
      const verb = r.already_watched ? 'attached to existing' : 'mounted new'
      process.stderr.write(`[fulcrum monitor] PCI watcher ${verb} on ${process.cwd()}\n`)
    } catch { /* non-fatal */ }
  }
  await server.start()
  console.log(`[fulcrum monitor] Listening on http://127.0.0.1:${port}`)
  console.log(`[fulcrum monitor] API docs: http://127.0.0.1:${port}/status`)

  // Memory v3 PR 8.1 — vault-watcher-driven auto-curation (opt-in).
  try {
    const { startMemoryAutoCurateIfEnabled } = await import('./commands/memory-auto-curate-wiring.js')
    await startMemoryAutoCurateIfEnabled()
  } catch (err) {
    process.stderr.write(`[fulcrum monitor] auto-curate wiring failed (non-fatal): ${(err as Error).message}\n`)
  }

  // Memory v3 PR 8.2 — scheduled consolidation scan (opt-in).
  try {
    const { startMemoryConsolidateScheduleIfEnabled } = await import('./commands/memory-consolidate-schedule-wiring.js')
    await startMemoryConsolidateScheduleIfEnabled()
  } catch (err) {
    process.stderr.write(`[fulcrum monitor] consolidate cron wiring failed (non-fatal): ${(err as Error).message}\n`)
  }

  // Keep alive
  await new Promise(() => {})
}

async function runServeAll(): Promise<void> {
  // Start monitor in background thread, MCP on stdio
  const { startMonitorServer } = await import('fulcrum-monitor')
  const { getDb, runMigrations, loadConfig } = await import('fulcrum-agent-core')

  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  await warmEmbedding()
  await warmOtel()
  registerOtelShutdown()

  const server = startMonitorServer({ workspace_id: config.workspace_id || undefined })
  await server.start()
  _monitorStarted = true
  _monitorServer = server
  console.error(`[fulcrum] Monitor running on http://127.0.0.1:${server.port}`)

  // Memory v3 PR 8.1 — vault-watcher-driven auto-curation (opt-in).
  try {
    const { startMemoryAutoCurateIfEnabled } = await import('./commands/memory-auto-curate-wiring.js')
    await startMemoryAutoCurateIfEnabled()
  } catch (err) {
    process.stderr.write(`[fulcrum] auto-curate wiring failed (non-fatal): ${(err as Error).message}\n`)
  }

  // Memory v3 PR 8.2 — scheduled consolidation scan (opt-in).
  try {
    const { startMemoryConsolidateScheduleIfEnabled } = await import('./commands/memory-consolidate-schedule-wiring.js')
    await startMemoryConsolidateScheduleIfEnabled()
  } catch (err) {
    process.stderr.write(`[fulcrum] consolidate cron wiring failed (non-fatal): ${(err as Error).message}\n`)
  }

  await runServeMcp()
}

// ── Workspace/project commands ────────────────────────────────────────────────

async function runWorkspaces(): Promise<void> {
  const { listWorkspaces, createWorkspace } = await import('fulcrum-agent-core')
  const sub = command // e.g. 'list' or 'create'

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum workspaces — workspace CRUD

  fulcrum workspaces list
  fulcrum workspaces create --name <name> [--id <id>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const rows = await listWorkspaces()
    if (rows.length === 0) { console.log('No workspaces found.'); return }
    for (const r of rows) console.log(`  ${r.workspace_id}  ${r.name}  (${r.status})`)
    return
  }

  if (sub === 'create') {
    const nameIdx = args.indexOf('--name')
    const idIdx = args.indexOf('--id')
    const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined
    const workspace_id = idIdx >= 0 ? args[idIdx + 1] : undefined
    if (!name) { console.error('--name is required'); process.exit(1) }
    const ws = await createWorkspace({ name, workspace_id })
    console.log(`Created workspace: ${ws.workspace_id}  (${ws.name})`)
    return
  }

  console.error(`Unknown workspaces command: ${sub}`)
  process.exit(1)
}

async function runProjects(): Promise<void> {
  const { listProjects, createProject } = await import('fulcrum-agent-core')
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum projects — project CRUD

  fulcrum projects list [--workspace-id <id>]
  fulcrum projects create --name <name> --workspace-id <id> [--type <type>] [--id <id>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const wsIdx = args.indexOf('--workspace-id')
    const workspace_id = wsIdx >= 0 ? args[wsIdx + 1] : undefined
    const rows = await listProjects({ workspace_id })
    if (rows.length === 0) { console.log('No projects found.'); return }
    for (const r of rows) console.log(`  ${r.project_id}  ${r.name}  type:${r.type}  status:${r.status}  ws:${r.workspace_id}`)
    return
  }

  if (sub === 'create') {
    const nameIdx = args.indexOf('--name')
    const wsIdx = args.indexOf('--workspace-id')
    const idIdx = args.indexOf('--id')
    const typeIdx = args.indexOf('--type')
    const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined
    const workspace_id = wsIdx >= 0 ? args[wsIdx + 1] : undefined
    if (!name || !workspace_id) { console.error('--name and --workspace-id are required'); process.exit(1) }
    const project_id = idIdx >= 0 ? args[idIdx + 1] : undefined
    const type = typeIdx >= 0 ? (args[typeIdx + 1] as Parameters<typeof createProject>[0]['type']) : undefined
    const proj = await createProject({ name, workspace_id, project_id, type })
    console.log(`Created project: ${proj.project_id}  (${proj.name}) in workspace ${proj.workspace_id}`)
    return
  }

  console.error(`Unknown projects command: ${sub}`)
  process.exit(1)
}

// ── Task commands (J-6) ───────────────────────────────────────────────────────

export async function runTasks(): Promise<void> {
  const { listTasks, createTask, updateTask } = await import('fulcrum-agent-core')
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum task — task CRUD

  fulcrum task list [--workspace-id <id>] [--project-id <id>] [--status <s>] [--limit <n>] [--json]
  fulcrum task get --id <task_id> [--json]
  fulcrum task create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>] [--priority <p>] [--assigned-to <role>]
  fulcrum task update --id <task_id> [--status <s>] [--note <n>] [--assigned-to <role>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const workspace_id = optArg('--workspace-id') ?? currentProjectIds().workspace_id
    const project_id = optArg('--project-id')
    const status = optArg('--status') as Parameters<typeof listTasks>[0]['status']
    const limit = optIntArg('--limit') ?? 50
    const rows = await listTasks({ workspace_id, project_id, status })
    const trimmed = rows.slice(0, limit).map(t => ({
      task_id: t.task_id,
      display_id: t.display_id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assigned_to: t.assigned_to ?? '',
    }))
    outputRows(trimmed)
    return
  }

  if (sub === 'get') {
    const task_id = requireArg('--id')
    const { getDb } = await import('fulcrum-agent-core')
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(task_id) as Record<string, unknown> | undefined
    if (!row) { console.error(`task not found: ${task_id}`); process.exit(1) }
    outputObject(row)
    return
  }

  if (sub === 'create') {
    const title = requireArg('--title')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id') ?? ids.project_id
    const description = optArg('--description')
    const priority = optArg('--priority') as Parameters<typeof createTask>[0]['priority']
    const assigned_to = optArg('--assigned-to')
    const task = await createTask({ title, workspace_id, project_id, description, priority, assigned_to })
    outputObject({ task_id: task.task_id, display_id: task.display_id, title: task.title, status: task.status, priority: task.priority })
    return
  }

  if (sub === 'update') {
    const task_id = requireArg('--id')
    const status = optArg('--status') as Parameters<typeof updateTask>[0]['status']
    const note = optArg('--note')
    const assigned_to = optArg('--assigned-to')
    const task = await updateTask({ task_id, status, note, assigned_to })
    outputObject({ task_id: task.task_id, status: task.status, note: task.note ?? '', assigned_to: task.assigned_to ?? '' })
    return
  }

  console.error(`Unknown task command: ${sub}`)
  process.exit(1)
}

// ── Issue commands (J-6) ──────────────────────────────────────────────────────

export async function runIssues(): Promise<void> {
  const { createIssue, updateIssue, listIssues } = await import('fulcrum-planning')
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum issue — issue CRUD

  fulcrum issue list [--workspace-id <id>] [--project-id <id>] [--status <s>] [--json]
  fulcrum issue get --id <issue_id> [--json]
  fulcrum issue create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>] [--priority <p>]
  fulcrum issue update --id <issue_id> [--status <s>] [--title <t>] [--expected-version <n>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const status = optArg('--status') as Parameters<typeof listIssues>[0]['status']
    const rows = await listIssues({ workspace_id, project_id, status })
    outputRows(rows.map(i => ({
      issue_id: i.issue_id,
      display_id: i.display_id,
      title: i.title,
      status: i.status,
      priority: i.priority,
    })))
    return
  }

  if (sub === 'create') {
    const title = requireArg('--title')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id') ?? ids.project_id
    const description = optArg('--description')
    const priority = optArg('--priority') as Parameters<typeof createIssue>[0]['priority']
    const issue = await createIssue({ title, workspace_id, project_id, description, priority })
    outputObject({ issue_id: issue.issue_id, display_id: issue.display_id, title: issue.title, status: issue.status })
    return
  }

  if (sub === 'get') {
    const issue_id = requireArg('--id')
    const { getDb } = await import('fulcrum-agent-core')
    const db = getDb()
    const row = db.prepare('SELECT * FROM issues WHERE issue_id = ?').get(issue_id) as Record<string, unknown> | undefined
    if (!row) { console.error(`issue not found: ${issue_id}`); process.exit(1) }
    outputObject(row)
    return
  }

  if (sub === 'update') {
    const issue_id = requireArg('--id')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const status = optArg('--status') as Parameters<typeof updateIssue>[0]['status']
    const title = optArg('--title')
    const expected_version = optIntArg('--expected-version') ?? 0
    const issue = await updateIssue({ issue_id, workspace_id, status, title, expected_version })
    outputObject({ issue_id: issue.issue_id, status: issue.status, title: issue.title, version: issue.version })
    return
  }

  console.error(`Unknown issue command: ${sub}`)
  process.exit(1)
}

// ── Epic commands (J-6) ───────────────────────────────────────────────────────

export async function runEpics(): Promise<void> {
  const { createEpic, listEpics } = await import('fulcrum-planning')
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum epic — epic CRUD

  fulcrum epic list [--workspace-id <id>] [--project-id <id>] [--json]
  fulcrum epic get --id <epic_id> [--json]
  fulcrum epic create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>] [--priority <p>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const rows = await listEpics({ workspace_id, project_id })
    outputRows(rows.map(e => ({
      epic_id: e.epic_id,
      display_id: e.display_id,
      title: e.title,
      status: e.status,
      priority: e.priority,
    })))
    return
  }

  if (sub === 'create') {
    const title = requireArg('--title')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id') ?? ids.project_id
    const description = optArg('--description')
    const priority = optArg('--priority') as Parameters<typeof createEpic>[0]['priority']
    const epic = await createEpic({ title, workspace_id, project_id, description, priority })
    outputObject({ epic_id: epic.epic_id, display_id: epic.display_id, title: epic.title, status: epic.status })
    return
  }

  if (sub === 'get') {
    const epic_id = requireArg('--id')
    const { getDb } = await import('fulcrum-agent-core')
    const db = getDb()
    const row = db.prepare('SELECT * FROM epics WHERE epic_id = ?').get(epic_id) as Record<string, unknown> | undefined
    if (!row) { console.error(`epic not found: ${epic_id}`); process.exit(1) }
    outputObject(row)
    return
  }

  console.error(`Unknown epic command: ${sub}`)
  process.exit(1)
}

// ── Board commands (J-6) ──────────────────────────────────────────────────────

export async function runBoard(): Promise<void> {
  const { listTasks } = await import('fulcrum-agent-core')
  const sub = command ?? 'show'

  if (sub === '--help' || sub === '-h') {
    console.log(`
fulcrum board — kanban-style task board view

  fulcrum board show [--workspace-id <id>] [--project-id <id>] [--json]

Groups tasks by status_category (backlog, active, blocked, done).
`)
    process.exit(0)
  }

  if (sub === 'show') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const tasks = await listTasks({ workspace_id, project_id })
    const groups: Record<string, typeof tasks> = { backlog: [], active: [], blocked: [], done: [] }
    for (const t of tasks) {
      const cat = t.status_category as keyof typeof groups
      if (groups[cat]) groups[cat].push(t)
    }
    if (args.includes('--json')) {
      console.log(JSON.stringify(groups, null, 2))
      return
    }
    for (const [cat, rows] of Object.entries(groups)) {
      console.log(`\n== ${cat.toUpperCase()} (${rows.length}) ==`)
      for (const t of rows) {
        console.log(`  ${t.display_id}  ${t.status.padEnd(10)}  ${t.title}`)
      }
    }
    console.log('')
    return
  }

  console.error(`Unknown board command: ${sub}`)
  process.exit(1)
}

// ── Queue commands (J-6) ──────────────────────────────────────────────────────

export async function runQueue(): Promise<void> {
  // Arg layout: `fulcrum queue merge list` → args[0]='queue', args[1]='merge',
  // args[2]='list'.
  const sub = command
  const sub2 = args[2]

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum queue — integration and review queues

  fulcrum queue merge list [--workspace-id <id>]
  fulcrum queue merge process --workspace-id <id> --actor-role <role> [--project-id <id>]
  fulcrum queue review list [--workspace-id <id>] [--project-id <id>]
`)
    process.exit(0)
  }

  if (sub === 'merge' && sub2 === 'list') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const { getDb } = await import('fulcrum-agent-core')
    const db = getDb()
    const rows = db.prepare(
      `SELECT worktree_id, branch_name, status, project_id, updated_at
       FROM worktrees
       WHERE workspace_id = ? AND status IN ('ready_for_merge','conflict')
       ORDER BY updated_at ASC`,
    ).all(workspace_id) as Record<string, unknown>[]
    outputRows(rows)
    return
  }

  if (sub === 'merge' && sub2 === 'process') {
    const { processMergeQueue } = await import('fulcrum-worktrees')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id') ?? ids.project_id
    const actor_role = requireArg('--actor-role')
    const result = await processMergeQueue({ workspace_id, project_id, actor_role })
    outputObject({
      merged: result.merged.length,
      skipped: result.skipped.length,
      conflicts: result.conflicts.length,
      results: result.results,
    })
    return
  }

  if (sub === 'review' && sub2 === 'list') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const { getDb } = await import('fulcrum-agent-core')
    const db = getDb()
    let sql = `SELECT artifact_id, display_id, title, artifact_type, status, file_path, updated_at
               FROM artifacts
               WHERE workspace_id = ? AND artifact_type = 'review_summary'`
    const params: unknown[] = [workspace_id]
    if (project_id) { sql += ' AND project_id = ?'; params.push(project_id) }
    sql += ' ORDER BY updated_at DESC LIMIT 50'
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
    outputRows(rows)
    return
  }

  console.error(`Unknown queue command: ${sub} ${sub2 ?? ''}`)
  console.error('Usage: fulcrum queue merge list|process | fulcrum queue review list')
  process.exit(1)
}

// ── Sync commands (J-6) ───────────────────────────────────────────────────────

export async function runSync(): Promise<void> {
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum sync — plane sync (push/pull to remote adapter)

  fulcrum sync status [--workspace-id <id>] [--json]
  fulcrum sync push [--workspace-id <id>] [--object-type <type>]
  fulcrum sync pull [--workspace-id <id>]
`)
    process.exit(0)
  }

  const { syncAll, listConflicts } = await import('fulcrum-sync')

  if (sub === 'status') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const { getDb } = await import('fulcrum-agent-core')
    const db = getDb()
    const state = db.prepare(
      `SELECT object_type, sync_status, COUNT(*) as count
       FROM sync_states WHERE workspace_id = ?
       GROUP BY object_type, sync_status
       ORDER BY object_type, sync_status`,
    ).all(workspace_id) as Record<string, unknown>[]
    const conflicts = await listConflicts({ workspace_id, unresolved_only: true })
    if (args.includes('--json')) {
      console.log(JSON.stringify({ state, conflicts }, null, 2))
      return
    }
    console.log('\nSync state:')
    outputRows(state)
    console.log(`\nUnresolved conflicts: ${conflicts.length}`)
    return
  }

  if (sub === 'push') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const object_type = optArg('--object-type') as Parameters<typeof syncAll>[0]['object_type']
    try {
      const result = await syncAll({ workspace_id, object_type })
      outputObject(result as unknown as Record<string, unknown>)
    } catch (err) {
      console.error(`sync push failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'pull') {
    // Plane sync is push-based by design; pulling happens inside adapter on
    // conflict detection. Expose as a no-op that runs syncAll (which will
    // reconcile both directions for the queued objects).
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    try {
      const result = await syncAll({ workspace_id })
      outputObject(result as unknown as Record<string, unknown>)
    } catch (err) {
      console.error(`sync pull failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  console.error(`Unknown sync command: ${sub}`)
  console.error('Usage: fulcrum sync status|push|pull')
  process.exit(1)
}

// ── Team commands (J-6) ───────────────────────────────────────────────────────

export async function runTeams(): Promise<void> {
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum team — team templates and instances

  fulcrum team list [--workspace-id <id>]
  fulcrum team create --name <name> [--description <d>] [--workspace-id <id>]
  fulcrum team invoke --template-id <id> --workspace-id <id> --caller-role <role> [--goal <g> | --purpose <p>] [--project-id <id>] [--caller-agent-id <id>]
  fulcrum team instances [--workspace-id <id>] [--project-id <id>]
`)
    process.exit(0)
  }

  const { getTeamOps: _getTeamOpsForCli } = await import('fulcrum-agent-core')
  const _cliTeamOps = _getTeamOpsForCli()
  if (!_cliTeamOps) {
    console.error('team: fulcrum-teams is not available')
    process.exit(1)
  }

  if (sub === 'list') {
    const { getDb } = await import('fulcrum-agent-core')
    const db = getDb()
    const rows = db.prepare(
      `SELECT template_id, name, description, created_at FROM team_templates ORDER BY created_at DESC`,
    ).all() as Record<string, unknown>[]
    outputRows(rows)
    return
  }

  if (sub === 'create') {
    const name = requireArg('--name')
    const description = optArg('--description')
    const template = await _cliTeamOps.createTeamTemplate({ name, description, slots: [] })
    outputObject({ template_id: template.template_id, name: template.name })
    return
  }

  if (sub === 'invoke') {
    const template_id = requireArg('--template-id')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const caller_role = requireArg('--caller-role')
    const purpose = optArg('--purpose') ?? optArg('--goal') ?? 'cli-invoked'
    const caller_agent_id = optArg('--caller-agent-id') ?? `cli/${caller_role}`
    try {
      const inst = await _cliTeamOps.invokeTeam({
        template_id,
        workspace_id,
        project_id,
        purpose,
        caller_agent_id,
        caller_role,
      })
      outputObject({ instance_id: inst.instance_id, display_id: inst.display_id, status: inst.status })
    } catch (err) {
      console.error(`team invoke failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'instances') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const rows = await _cliTeamOps.listTeamInstances({ workspace_id, project_id })
    outputRows(rows.map(r => ({
      instance_id: r.instance_id,
      display_id: r.display_id,
      template_id: r.template_id,
      status: r.status,
      purpose: r.purpose,
    })))
    return
  }

  console.error(`Unknown team command: ${sub}`)
  process.exit(1)
}

// ── Workflow commands (J-6) ───────────────────────────────────────────────────

export async function runWorkflows(): Promise<void> {
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum workflow — durable multi-step workflows

  fulcrum workflow list [--workspace-id <id>]
  fulcrum workflow start --workflow-name <name> [--workspace-id <id>] [--project-id <id>]
  fulcrum workflow run --wf-id <id> [--workspace-id <id>]
  fulcrum workflow status --wf-id <id> [--workspace-id <id>]
  fulcrum workflow resume --wf-id <id> [--workspace-id <id>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const { listWorkflows } = await import('fulcrum-workflows')
    const defs = await listWorkflows()
    outputRows(defs.map(d => ({ name: d.name, version: d.version, steps: d.steps.length, description: d.description ?? '' })))
    return
  }

  if (sub === 'start') {
    const { startWorkflow } = await import('fulcrum-workflows')
    const workflow_name = requireArg('--workflow-name')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    try {
      const run = await startWorkflow({ workflow_name, workspace_id, project_id })
      outputObject({ wf_id: run.wf_id, display_id: run.display_id, status: run.status })
    } catch (err) {
      console.error(`workflow start failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'run') {
    const { runWorkflow } = await import('fulcrum-workflows')
    const wf_id = requireArg('--wf-id')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    try {
      const result = await runWorkflow({ wf_id, workspace_id })
      outputObject(result as unknown as Record<string, unknown>)
    } catch (err) {
      console.error(`workflow run failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'status') {
    const { getWorkflowRun } = await import('fulcrum-workflows')
    const wf_id = requireArg('--wf-id')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    try {
      const run = await getWorkflowRun({ wf_id, workspace_id })
      outputObject({
        wf_id: run.wf_id,
        display_id: run.display_id,
        status: run.status,
        current_step: run.current_step_id ?? '',
        workflow_name: run.workflow_name,
      })
    } catch (err) {
      console.error(`workflow status failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'resume') {
    const { resumeWorkflow } = await import('fulcrum-workflows')
    const wf_id = requireArg('--wf-id')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    try {
      const run = await resumeWorkflow({ wf_id, workspace_id })
      outputObject({ wf_id: run.wf_id, status: run.status })
    } catch (err) {
      console.error(`workflow resume failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  console.error(`Unknown workflow command: ${sub}`)
  process.exit(1)
}

// ── Agent commands (J-6) ──────────────────────────────────────────────────────

export async function runAgent(): Promise<void> {
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum agent — agent runs and spawning

  fulcrum agent list [--workspace-id <id>] [--json]
  fulcrum agent status --run-id <id> [--json]
  fulcrum agent spawn --target-role <role> --caller-role <role> --task-id <id> [--workspace-id <id>] [--project-id <id>] [--adapter <name>]
  fulcrum agent versions <role>
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const { getDb } = await import('fulcrum-agent-core')
    const db = getDb()
    const rows = db.prepare(
      `SELECT run_id, role, status, task_id, current_step, progress_pct, started_at
       FROM agent_runs
       WHERE workspace_id = ?
       ORDER BY started_at DESC LIMIT 50`,
    ).all(workspace_id) as Record<string, unknown>[]
    outputRows(rows)
    return
  }

  if (sub === 'status') {
    const run_id = requireArg('--run-id')
    const { getAgentRunStatus } = await import('fulcrum-agent-core')
    try {
      const run = await getAgentRunStatus({ run_id })
      outputObject({
        run_id: run.run_id,
        status: run.status,
        role: run.role,
        task_id: run.task_id,
        current_step: run.current_step ?? '',
        progress_pct: run.progress_pct ?? 0,
      })
    } catch (err) {
      console.error(`agent status failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'spawn') {
    const { spawnAgent } = await import('fulcrum-worker')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id') ?? ids.project_id
    const target_role = requireArg('--target-role')
    const caller_role = requireArg('--caller-role')
    const task_id = requireArg('--task-id')
    const adapter = optArg('--adapter')
    try {
      const result = await spawnAgent({
        workspace_id,
        project_id,
        task_id,
        target_role: target_role as Parameters<typeof spawnAgent>[0]['target_role'],
        caller_role: caller_role as Parameters<typeof spawnAgent>[0]['caller_role'],
        adapter,
      })
      outputObject({
        run_id: result.run_id,
        status: result.result.status,
        summary: result.result.summary ?? '',
      })
    } catch (err) {
      console.error(`agent spawn failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'versions') {
    const role = args[2]
    if (!role) {
      console.error('Usage: fulcrum agent versions <role>')
      process.exit(1)
    }
    const { getAgentDefinition } = await import('fulcrum-agent-core')
    const def = getAgentDefinition(role)
    if (!def) {
      console.error(`No agent definition found for role: ${role}`)
      process.exit(1)
    }
    outputObject({
      role: def.role,
      display_name: def.display_name,
      version: def.version,
      stability: def.stability,
      updated_at: def.updated_at,
    })
    return
  }

  console.error(`Unknown agent command: ${sub}`)
  process.exit(1)
}

// ── Auto project initialization ───────────────────────────────────────────────
//
// Every fulcrum command that touches the DB runs through this first. It:
//   1. opens the single GLOBAL DB at globalDataDir()/fulcrum.db — NEVER in $CWD
//      and runs migrations (idempotent)
//   2. ensures a workspace + project exist, with deterministic IDs derived from
//      the absolute $CWD path — logical isolation inside the one global DB,
//      not physical separation
// Idempotent: safe to call on every invocation. Prints a one-line notice
// on first-time init (to stderr so it never corrupts MCP stdio traffic).
// NEVER writes any files to $CWD or any project directory.

let _projectInitialized = false
let _projectIds: { workspace_id: string; project_id: string } | null = null

function currentProjectIds(): { workspace_id: string; project_id: string } {
  if (!_projectIds) throw new Error('ensureProjectInitialized() must be called before accessing project IDs')
  return _projectIds
}

async function ensureProjectInitialized(opts: { silent?: boolean } = {}): Promise<{ workspace_id: string; project_id: string }> {
  if (_projectIds) return _projectIds
  const { getDb, runMigrations, getWorkspace, getProject, createWorkspace, createProject, projectIdsFromPath } = await import('fulcrum-agent-core')

  // Initialize the global DB (data lives in globalDataDir(), NEVER in $CWD)
  const db = getDb()
  runMigrations(db)

  // Deterministic IDs: sha256[:12] of the absolute CWD path, prefixed with a
  // sanitized directory name. Stable across runs, unique across projects.
  // No file is written to the project directory.
  const { workspace_id, project_id } = projectIdsFromPath(process.cwd())
  const sanitizedName = workspace_id.replace(/^ws_/, '').replace(/_[a-f0-9]{12}$/, '')

  // Route workspace/project creation through core CRUD so FK/enum validation
  // runs in one place. Both calls are effectively idempotent: we check
  // existence first, and createWorkspace itself is INSERT OR IGNORE.
  const existingWs = await getWorkspace(workspace_id)
  const existingProj = await getProject(project_id)
  if (!existingWs) await createWorkspace({ workspace_id, name: sanitizedName })
  if (!existingProj) await createProject({ workspace_id, project_id, name: sanitizedName })

  // Announce first-time init on stderr (never stdout — MCP stdio is strict)
  const firstRun = !existingWs || !existingProj
  if (firstRun && !opts.silent && !_projectInitialized) {
    process.stderr.write(`[fulcrum] initialized project "${sanitizedName}" (${workspace_id})\n`)
  }
  _projectInitialized = true
  _projectIds = { workspace_id, project_id }
  return _projectIds
}

// ── Plugin management ────────────────────────────────────────────────────────

async function runPlugin(): Promise<void> {
  const { execSync } = await import('child_process')
  const { existsSync, mkdirSync } = await import('fs')
  const { join } = await import('path')

  switch (command) {
    case 'list': {
      const plugins = discoverPlugins(process.cwd())
      if (plugins.length === 0) {
        console.log('No Fulcrum plugins found.')
        console.log(`(searched project node_modules and ${globalDataDir()}/plugins/)`)
        return
      }
      const rows = plugins.map(p => ({
        name: p.name,
        root: p.root,
        hooks: p.manifest.hooks ?? '',
        skills: p.manifest.skills ?? '',
        agents: p.manifest.agents ?? '',
      }))
      outputRows(rows, ['name', 'root', 'hooks', 'skills', 'agents'])
      return
    }

    case 'add':
    case 'install': {
      // Install an npm package as a globally-available Fulcrum plugin
      const pkgArg = args.find(a => !a.startsWith('--') && a !== 'plugin' && a !== 'install' && a !== 'add')
      if (!pkgArg) {
        console.error('Usage: fulcrum plugin install <package-name-or-path>')
        process.exit(1)
      }
      const pluginsDir = join(globalDataDir(), 'plugins')
      mkdirSync(pluginsDir, { recursive: true })
      console.log(`Installing ${pkgArg} into ${pluginsDir}...`)
      execSync(`npm install --prefix ${pluginsDir} ${pkgArg}`, { stdio: 'inherit' })
      console.log(`Plugin installed. Run 'fulcrum plugin list' to verify.`)
      return
    }

    case 'link': {
      // Link a local plugin directory (development mode)
      const dirArg = args.find(a => !a.startsWith('--') && a !== 'plugin' && a !== 'link')
      if (!dirArg) {
        console.error('Usage: fulcrum plugin link <path-to-plugin-dir>')
        process.exit(1)
      }
      const pluginsDir = join(globalDataDir(), 'plugins')
      mkdirSync(pluginsDir, { recursive: true })
      const absPath = join(process.cwd(), dirArg)
      if (!existsSync(absPath)) {
        console.error(`Directory not found: ${absPath}`)
        process.exit(1)
      }
      execSync(`npm install --prefix ${pluginsDir} ${absPath}`, { stdio: 'inherit' })
      console.log(`Plugin linked from ${absPath}. Run 'fulcrum plugin list' to verify.`)
      return
    }

    case 'remove':
    case 'uninstall': {
      const pkgArg = args.find(a => !a.startsWith('--') && a !== 'plugin' && a !== command)
      if (!pkgArg) {
        console.error(`Usage: fulcrum plugin ${command} <package-name>`)
        process.exit(1)
      }
      const pluginsDir = join(globalDataDir(), 'plugins')
      console.log(`Removing ${pkgArg} from ${pluginsDir}...`)
      execSync(`npm uninstall --prefix ${pluginsDir} ${pkgArg}`, { stdio: 'inherit' })
      console.log(`Plugin removed.`)
      return
    }

    default:
      console.log(`
fulcrum plugin — manage Fulcrum plugins

USAGE
  fulcrum plugin list                         List discovered plugins
  fulcrum plugin install <package>            Install plugin from npm
  fulcrum plugin link <path>                  Link a local plugin (dev mode)
  fulcrum plugin remove <package>             Remove a globally-installed plugin

PLUGIN FORMAT
  A Fulcrum plugin is any npm package with a "fulcrum" key in package.json:
    {
      "fulcrum": {
        "type": "plugin",
        "hooks": "dist/hooks.js",   // optional: hook handler module
        "skills": "skills/",        // optional: directory of SKILL.md files
        "agents": "agents/"         // optional: directory of agent .md files
      }
    }

PLUGIN SEARCH PATH
  1. Closest project node_modules (walking up from CWD)
  2. ${globalDataDir()}/plugins/  (globally installed)
`)
      process.exit(0)
  }
}

// ── Skills management ────────────────────────────────────────────────────────
// GAP-SKILLS-9: Install skills to the Claude Code load path.
// Claude Code reads skills from ~/.claude/skills/ (user scope) or
// <project>/.claude/skills/ (project scope). `fulcrum skills install` creates
// a symlink so the bundled skills are discoverable without manual copying.

async function runSkills(): Promise<void> {
  const { symlinkSync, existsSync, mkdirSync, readdirSync, lstatSync } = await import('fs')
  const { join, resolve } = await import('path')

  // Locate the bundled skills directory inside the Fulcrum repo.
  // Priority: CWD/agent-integration/skills (repo context) → globalDataDir()/skills (installed context)
  function findSourceDir(): string | null {
    const cwdSource = join(process.cwd(), 'agent-integration', 'skills')
    if (existsSync(cwdSource)) return cwdSource
    const globalSource = join(globalDataDir(), 'agent-integration', 'skills')
    if (existsSync(globalSource)) return globalSource
    return null
  }

  switch (command) {
    case 'install': {
      const sourceDir = findSourceDir()
      if (!sourceDir) {
        console.error('Cannot find agent-integration/skills/ in CWD or global data dir.')
        console.error('Run this command from the Fulcrum repo root, or install Fulcrum globally first.')
        process.exit(1)
      }

      // Destination: ~/.claude/skills/ (user-scoped, always loaded by Claude Code)
      const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? ''
      const destParent = join(homeDir, '.claude')
      const destLink = join(destParent, 'skills')

      // Also support project scope: <cwd>/.claude/skills/
      const projectScope = args.includes('--project')
      const targetDir = projectScope ? join(process.cwd(), '.claude') : destParent
      const targetLink = projectScope ? join(process.cwd(), '.claude', 'skills') : destLink

      if (existsSync(targetLink)) {
        const stat = lstatSync(targetLink)
        if (stat.isSymbolicLink()) {
          console.log(`Skills already installed at ${targetLink} (symlink).`)
          console.log(`  → ${resolve(sourceDir)}`)
        } else {
          console.log(`${targetLink} exists but is not a symlink — skipping.`)
          console.log('Remove it manually and re-run to install the skills symlink.')
        }
        return
      }

      mkdirSync(targetDir, { recursive: true })
      symlinkSync(resolve(sourceDir), targetLink)
      const count = readdirSync(sourceDir).filter(d => existsSync(join(sourceDir, d, 'SKILL.md'))).length
      console.log(`Installed ${count} Fulcrum skills → ${targetLink}`)
      console.log(`  Symlinked from: ${resolve(sourceDir)}`)
      console.log(`  Claude Code will load these skills automatically.`)
      return
    }

    case 'list': {
      const sourceDir = findSourceDir()
      if (!sourceDir) {
        console.log('No bundled skills found. Run this command from the Fulcrum repo root.')
        return
      }
      const skillDirs = readdirSync(sourceDir).filter(d => existsSync(join(sourceDir, d, 'SKILL.md')))
      console.log(`Fulcrum skills (${skillDirs.length}) — source: ${sourceDir}`)
      for (const dir of skillDirs) {
        const skillPath = join(sourceDir, dir, 'SKILL.md')
        // Extract name and description from frontmatter
        const raw = (await import('fs')).readFileSync(skillPath, 'utf8').split('\n')
        const nameLine = raw.find(l => l.startsWith('name:'))
        const descLine = raw.find(l => l.startsWith('description:'))
        const name = nameLine?.replace('name:', '').trim() ?? dir
        const desc = descLine?.replace('description:', '').trim() ?? ''
        const invocable = raw.some(l => l.includes('user-invocable: true')) ? '✓' : '○'
        console.log(`  ${invocable} ${name.padEnd(30)} ${desc.slice(0, 60)}`)
      }
      console.log('\n  ✓ = user-invocable  ○ = auto-trigger only')
      return
    }

    default:
      console.log(`
fulcrum skills — manage Fulcrum skills for Claude Code

USAGE
  fulcrum skills install             Install bundled skills to ~/.claude/skills/ (user scope)
  fulcrum skills install --project   Install to .claude/skills/ (project scope)
  fulcrum skills list                List available bundled skills

ABOUT
  Skills teach Claude Code agents how to use Fulcrum's MCP tools correctly.
  They are loaded by Claude Code from ~/.claude/skills/ or .claude/skills/.
  Run 'fulcrum skills install' once after setup to activate them.

  Source: agent-integration/skills/ in the Fulcrum repo
  Docs:   agent-integration/skills/index.md
`)
      process.exit(0)
  }
}

// ── Init: Cursor / Windsurf per-project integration ──────────────────────────

async function runInit(): Promise<void> {
  const dryRun = args.includes('--dry-run')
  const adaptive = args.includes('--adaptive')
  const cursor = args.includes('--cursor')
  const windsurf = args.includes('--windsurf')
  const codex = args.includes('--codex')
  const opencode = args.includes('--opencode')
  const global = args.includes('--global')

  const targetDir = global ? (process.env['HOME'] ?? process.cwd()) : process.cwd()

  if (adaptive || (!cursor && !windsurf && !codex && !opencode)) {
    const plan = summarizeAdaptiveInstallPlan({ cwd: process.cwd(), home: process.env['HOME'] })
    if (args.includes('--json')) {
      console.log(JSON.stringify(plan, null, 2))
      return
    }

    console.log('Adaptive plugin/extension install plan')
    console.log(`recommended path: ${plan.recommendedPath}`)
    if (plan.detectedRuntimes.length === 0) {
      console.log('detected runtimes: none')
      console.log('fallback: use the CLI-only path, then add agent-specific integrations when you choose a runtime.')
      return
    }

    console.log(`detected runtimes: ${plan.detectedRuntimes.join(', ')}`)
    for (const runtime of plan.runtimes.filter(item => item.detected)) {
      console.log(`\n- ${runtime.displayName}`)
      console.log(`  path: ${runtime.installPath}`)
      console.log(`  supports: ${runtime.supports.join(', ')}`)
      console.log(`  rationale: ${runtime.rationale}`)
      for (const step of runtime.nextSteps) console.log(`  next: ${step}`)
    }
    return
  }

  const { installCursor, installWindsurf, installCodex, installOpencode } = await import('../../../agent-integration/install.js')

  if (cursor) await installCursor({ dryRun, targetDir })
  if (windsurf) await installWindsurf({ dryRun, targetDir })
  if (codex) await installCodex({ dryRun, targetDir })
  if (opencode) await installOpencode({ dryRun, targetDir })
}

async function runInstall(): Promise<void> {
  if (command !== 'plan') {
    console.error('Usage: fulcrum install plan [--json]')
    process.exit(1)
  }

  const plan = summarizeAdaptiveInstallPlan({ cwd: process.cwd(), home: process.env['HOME'] })
  if (args.includes('--json')) {
    console.log(JSON.stringify(plan, null, 2))
    return
  }

  console.log('Adaptive plugin/extension install plan')
  console.log(`recommended path: ${plan.recommendedPath}`)
  for (const runtime of plan.runtimes) {
    console.log(`\n${runtime.detected ? '✓' : '○'} ${runtime.displayName}`)
    console.log(`  install path: ${runtime.installPath}`)
    console.log(`  supports: ${runtime.supports.join(', ')}`)
    console.log(`  applyable here: ${runtime.applyable ? 'yes' : 'no'}`)
    console.log(`  rationale: ${runtime.rationale}`)
    if (runtime.detected) {
      for (const step of runtime.nextSteps) console.log(`  next: ${step}`)
    }
  }
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

export async function main(): Promise<void> {
  // Discover and wire plugins from project node_modules + globalDataDir()/plugins/
  // GAP-PLUGIN-1 fix: plugin-discovery.ts was fully implemented but never called.
  try {
    const plugins = discoverPlugins(process.cwd())
    const registration = registerPlugins(plugins)
    _pluginAdditionalTools = registration.additionalTools ?? []
    _pluginAdditionalActions = (registration.additionalActions ?? []).map(action => ({
      action_name: action.action_name,
      mcp: action.mcp,
    }))
    const { setAdditionalActionDefinitions } = await import('./tool-registry.js')
    setAdditionalActionDefinitions(_pluginAdditionalActions)
    for (const hookModulePath of registration.hookModules) {
      await import(hookModulePath)
    }
  } catch {
    // Plugin discovery failure is non-fatal — continue without plugins
  }

  // Sync file-based agent definitions (GAP-AGENTDEF-5).
  // Reads .fulcrum/agent-defs/*.agent.json and globalDataDir()/agent-defs/*.agent.json.
  // Non-fatal — a missing directory or malformed file is silently skipped.
  try {
    const { loadAgentDefsFromDir } = await import('fulcrum-agent-core')
    loadAgentDefsFromDir(process.cwd())
  } catch {
    // DB not initialised yet at this point in some sub-commands — ignore
  }

  // Wire fulcrum-teams implementation into core's TeamOps registry.
  // GAP-ARCH-1 fix: breaks the core ↔ teams circular dependency — core never
  // imports teams; the CLI (which depends on both) registers the impl once.
  try {
    const { createTeamOps } = await import('fulcrum-teams')
    const { setTeamOps } = await import('fulcrum-agent-core')
    setTeamOps(createTeamOps())
  } catch {
    // fulcrum-teams may not be installed — team operations will return null
  }

  // Wire fulcrum-worktrees janitor ops into core's WorktreeOps registry.
  // Same IoC pattern as teams — core never imports worktrees; the CLI registers
  // the impl once so janitor can reap abandoned worktrees without a dynamic import.
  try {
    const { createWorktreeOps } = await import('fulcrum-worktrees')
    const { setWorktreeOps } = await import('fulcrum-agent-core')
    setWorktreeOps(createWorktreeOps())
  } catch {
    // fulcrum-worktrees may not be installed — janitor will skip worktree cleanup
  }

  if (!group || group === '--help' || group === '-h') usage()

  if (group === '--version' || group === '-v' || group === 'version') {
    const { readFileSync } = await import('fs')
    const { fileURLToPath } = await import('url')
    const path = await import('path')
    const cliPath = fileURLToPath(import.meta.url)
    const pkgPath = path.resolve(path.dirname(cliPath), '..', 'package.json')
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
      console.log(pkg.version)
    } catch {
      console.log('unknown')
    }
    return
  }

  // Auto-initialize the project in $CWD (opens global DB, ensures workspace +
  // project exist) before dispatching any command that touches the DB.
  // Nothing is written to $CWD. workspace_id/project_id are computed
  // deterministically from the abs path. `hook` and `serve mcp` use silent
  // mode so the init notice doesn't spam stderr on every tool call.
  const silentInit = group === 'hook' || (group === 'serve' && command === 'mcp')
  await ensureProjectInitialized({ silent: silentInit })

  if (group === 'memory') { await runMemory(); return }

  if (group === 'serve') {
    if (!command || command === '--help' || command === '-h') {
      console.log(`
fulcrum serve — long-running servers

  fulcrum serve mcp          Start MCP server (stdio JSON-RPC 2.0) — 23 control tools
  fulcrum serve mcp-http     Start MCP server (StreamableHTTP, default port 4722) [planner flags] [--port <n>]
  fulcrum serve monitor      Start HTTP monitor + control API [--port <n>]
  fulcrum serve all          Start both MCP and monitor servers

OPTIONS (serve mcp)
  --mode <full|filtered|minimal>
                             Choose MCP exposure strategy (default: filtered)
  --profile hook-only        Compatibility shortcut for hook-capable runtimes
  --profile <role>           Apply role policy from agent_definitions
  --agent-type <role>        Filter by agent type / min-role metadata
  --platform <name>          Filter by runtime platform metadata
  --runtime-capability <c>   Filter by runtime capability (repeatable, e.g. hooks)
  --include-action <name>    Force-include a canonical action (repeatable)
  --exclude-action <name>    Force-hide a canonical action (repeatable)
  --no-monitor               Skip auto-starting the HTTP monitor alongside the MCP server

OPTIONS (serve mcp-http)
  Same planner flags as serve mcp, plus:
  --port <n>                 HTTP port for the StreamableHTTP endpoint (default: 4722)
`)
      process.exit(0)
    }
    if (command === 'mcp') { await runServeMcp(); return }
    if (command === 'mcp-http') { await runServeMcpHttp(); return }
    if (command === 'monitor') { await runServeMonitor(); return }
    if (command === 'all') { await runServeAll(); return }
    console.error(`Unknown serve command: ${command}`)
    console.error('Usage: fulcrum serve mcp | mcp-http | monitor | all')
    process.exit(1)
  }

  if (group === 'hook') {
    const cli = command // 'claude' | 'gemini' | 'pi' | '--help' | '-h' | undefined
    if (!cli || cli === '--help' || cli === '-h') {
      await runHook(cli ?? '--help')
      return
    }
    if (cli === 'claude' || cli === 'gemini' || cli === 'codex' || cli === 'pi' || cli === 'opencode' || cli === 'cursor' || cli === 'windsurf' || cli === 'auto') {
      // Optional second-level arg: lifecycle phase or tool phase
      // Default 'pre' for backward compatibility with existing settings.json entries.
      const phaseArg = args[2] as string | undefined

      // Claude lifecycle hooks
      if (cli === 'claude') {
        if (phaseArg === 'session-start')  { await runSessionStartHook(); return }
        if (phaseArg === 'session-stop')   { await runSessionStopHook();  return }
        if (phaseArg === 'session-end')    { await runSessionStopHook();  return }
        if (phaseArg === 'pre-compact')    { await runPreCompactHook();   return }
        if (phaseArg === 'subagent-start' || phaseArg === 'subagent-stop') {
          await runStubHook('claude', phaseArg); return
        }
      }

      // Gemini lifecycle hooks
      if (cli === 'gemini') {
        if (phaseArg === 'session-start') { await runGeminiSessionStartHook(); return }
        if (phaseArg === 'before-agent')  { await runGeminiBeforeAgentHook();  return }
        if (phaseArg === 'session-end')   { await runGeminiSessionEndHook();   return }
        if (
          phaseArg === 'before-model' ||
          phaseArg === 'after-model' ||
          phaseArg === 'pre-compress' ||
          phaseArg === 'after-agent'
        ) {
          await runStubHook('gemini', phaseArg); return
        }
      }

      // Codex lifecycle hooks
      if (cli === 'codex') {
        if (phaseArg === 'session-start') { await runCodexSessionStartHook(); return }
        if (phaseArg === 'session-end')   { await runCodexStopHook();         return }
        // Codex [notify] section fires on run completion — same semantic as session-end
        if (phaseArg === 'notify')        { await runCodexStopHook();         return }
      }

      // Opencode / Cursor / Windsurf lifecycle hooks.
      // The opencode plugin shells to `fulcrum hook opencode session-end` on
      // session.idle and to `fulcrum hook opencode pre-compact` on
      // session.compacted. Cursor + Windsurf only route through `hook auto`
      // today but we accept the lifecycle phases so future configs don't error.
      if (cli === 'opencode' || cli === 'cursor' || cli === 'windsurf') {
        if (
          phaseArg === 'session-start' ||
          phaseArg === 'session-end' ||
          phaseArg === 'pre-compact'
        ) {
          await runStubHook(cli, phaseArg)
          return
        }
      }

      const phase: HookPhase = phaseArg === 'post' ? 'post' : 'pre'
      if (phaseArg && phaseArg !== 'pre' && phaseArg !== 'post') {
        console.error(`Unknown hook phase: ${phaseArg}`)
        console.error('Usage: fulcrum hook auto|claude|gemini|codex|pi [pre|post|session-start|session-stop|session-end|pre-compact|before-agent|subagent-start|subagent-stop|before-model|after-model|pre-compress|after-agent|notify]')
        process.exit(1)
      }
      await runHook(cli, phase)
      return
    }
    console.error(`Unknown hook: ${cli}`)
    console.error('Usage: fulcrum hook auto|claude|gemini|codex|pi [pre|post]')
    process.exit(1)
  }

  if (group === 'mcp') { await runMcpPlanner(); return }
  if (group === 'install') { await runInstall(); return }
  if (group === 'daemon') {
    const { runDaemon } = await import('./commands/daemon.js')
    await runDaemon(args.slice(1))
    return
  }
  if (group === 'tool' || group === 'tools') { await runTool(); return }
  if (group === 'action' || group === 'actions') { await runAction(); return }

  if (group === 'workspaces') { await runWorkspaces(); return }
  if (group === 'projects') { await runProjects(); return }

  // J-6: 10 top-level command groups mirroring the Python reference CLI.
  // Each delegates to existing fulcrum-* package APIs via dynamic imports
  // so we don't pay the module load cost for unused groups.
  if (group === 'task' || group === 'tasks') { await runTasks(); return }
  if (group === 'issue' || group === 'issues') { await runIssues(); return }
  if (group === 'epic' || group === 'epics') { await runEpics(); return }
  if (group === 'board') { await runBoard(); return }
  if (group === 'queue') { await runQueue(); return }
  if (group === 'sync') { await runSync(); return }
  if (group === 'team' || group === 'teams') { await runTeams(); return }
  if (group === 'workflow' || group === 'workflows') { await runWorkflows(); return }
  if (group === 'agent' || group === 'agents') { await runAgent(); return }

  if (group === 'plugin' || group === 'plugins') { await runPlugin(); return }

  if (group === 'skills' || group === 'skill') { await runSkills(); return }

  // v2a per-host cluster Task 51 — `fulcrum pi cockpit start|stop|status`.
  if (group === 'pi') {
    if (command === 'cockpit') {
      const { runPiCockpit } = await import('./pi-cockpit.js')
      await runPiCockpit(args[2], args.slice(3))
      return
    }
    console.error(`Unknown pi subcommand: ${command}`)
    console.error('Usage: fulcrum pi cockpit start|stop|status')
    process.exit(1)
  }

  if (group === 'dream') {
    const { runDream } = await import('./dream.js')
    await runDream(args.slice(1))
    return
  }

  if (group === 'init') { await runInit(); return }

  if (group === 'log') {
    const { runLog } = await import('./log.js')
    await runLog(args)
    return
  }

  if (group === 'tui') {
    const { runTui } = await import('./tui/index.js')
    await runTui()
    return
  }

  if (group === 'doctor') {
    const fix = args.includes('--fix')
    const dryRun = args.includes('--dry-run')
    const json = args.includes('--json')
    const { results, exitCode, fixesApplied } = await runDoctor({ cwd: process.cwd(), json, fix, dryRun })
    printDoctorResults(results, json)
    if (fix && !dryRun) {
      console.log(`\nApplied ${fixesApplied} fix(es). Re-run 'fulcrum doctor' to verify.`)
    }
    process.exit(exitCode)
  }

  console.error(`Unknown group: ${group}`)
  usage()
}

// Only auto-run main() when executed as a script, not when imported as a
// module (e.g. unit tests importing `normalizeHookEvent`). We compare the
// process entry path to this module's path after resolving symlinks, so the
// check still works when invoked through an npm-installed bin shim
// (node_modules/.bin/fulcrum → ../fulcrum-agent-cli/src/index.ts).
const isEntry = (() => {
  try {
    const entry = process.argv[1]
    if (!entry) return false
    const entryReal = realpathSync(entry)
    const selfReal = realpathSync(fileURLToPath(import.meta.url))
    return entryReal === selfReal
  } catch {
    return false
  }
})()

if (isEntry) {
  main().catch(err => {
    console.error((err as Error).message)
    process.exit(1)
  })
}
