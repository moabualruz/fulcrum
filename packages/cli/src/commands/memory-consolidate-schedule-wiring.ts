// packages/cli/src/commands/memory-consolidate-schedule-wiring.ts
//
// Memory v3 PR 8 unit 8.2 — long-running-process glue for the
// scheduled consolidation pass. Resolves the workspace + vault root
// once, then builds a runPass callback that scans for merge candidates
// and appends a JSONL line to `curated/consolidate.log.md`. Dry-run only.

export interface ConsolidateScheduleWiringOptions {
  /** Test/override hook. Default = config.workspace_id || cwd-derived. */
  workspace_id?: string
  /** Test/override hook. Default = getVaultPath(). */
  vaultPath?: string
}

export async function startMemoryConsolidateScheduleIfEnabled(
  opts: ConsolidateScheduleWiringOptions = {},
): Promise<() => void> {
  const cadence = process.env['FULCRUM_MEMORY_CONSOLIDATE_SCHEDULE']
  if (!cadence) return () => {}

  const {
    startConsolidateSchedule,
    findConsolidationCandidates,
    appendConsolidateLog,
    getVaultPath,
    CADENCE_MS,
  } = await import('fulcrum-memory')
  if (!CADENCE_MS[cadence]) return () => {}  // 'never' / unknown
  const { getDb, loadConfig, projectIdsFromPath } = await import('fulcrum-agent-core')

  const config = loadConfig()
  const workspace_id =
    opts.workspace_id ?? config.workspace_id ?? projectIdsFromPath(process.cwd()).workspace_id
  if (!workspace_id) return () => {}
  const vaultPath = opts.vaultPath ?? getVaultPath()

  const stop = startConsolidateSchedule({
    cadence,
    runPass: async () => {
      const started = Date.now()
      const candidates = findConsolidationCandidates(getDb(), { workspace_id })
      appendConsolidateLog(vaultPath, {
        ts: new Date().toISOString(),
        workspace_id,
        cadence,
        min_confidence: 0.5,
        candidates_count: candidates.length,
        duration_ms: Date.now() - started,
        candidates,
      })
    },
    onError: (err) => {
      process.stderr.write(`[fulcrum consolidate-cron] ${err.message}\n`)
    },
  })

  process.stderr.write(
    `[fulcrum consolidate-cron] cadence=${cadence} workspace=${workspace_id}\n`,
  )

  return stop
}
