// v2b PR 11 Task 2.0 — fulcrum dream operator CLI.
//
// Operator-only: NOT registered in TOOL_REGISTRY. Invoked as `fulcrum dream`.
// Dreaming is a maintenance operation, not an agent-callable action.

import { runLightPhase } from 'fulcrum-memory'

const VALID_PHASES = ['light', 'REM', 'deep', 'all'] as const
type Phase = (typeof VALID_PHASES)[number]

export async function runDream(args: string[]): Promise<void> {
  const phaseArg = args.find(a => a.startsWith('--phase='))?.split('=')[1]
  const isDryRun = args.includes('--dry-run')

  const phase: Phase = (phaseArg as Phase) ?? 'all'

  if (!VALID_PHASES.includes(phase)) {
    throw new Error(`unknown phase: ${phase}. Valid phases: ${VALID_PHASES.join(', ')}`)
  }

  // Bright-banner warning per Gate 3 ADR (thresholds unvalidated)
  console.warn(
    '[fulcrum dream] WARNING: Dreaming thresholds applied unvalidated. ' +
      "Run 'fulcrum dream stats' after 2 weeks of usage to re-tune."
  )

  if (isDryRun) {
    console.log(`[fulcrum dream] dry-run: phase=${phase} — no writes performed.`)
    return
  }

  if (phase === 'light' || phase === 'all') {
    await runLightPhaseCli()
  }

  if (phase === 'REM' || phase === 'all') {
    console.log('[fulcrum dream] REM phase: entity extraction (v2b PR 11 Task 2.1 — not yet implemented)')
  }

  if (phase === 'deep' || phase === 'all') {
    console.log('[fulcrum dream] deep phase: promotion (v2b PR 11 Task 2.3 — not yet implemented)')
  }
}

async function runLightPhaseCli(): Promise<void> {
  const { getDb } = await import('fulcrum-agent-core')
  const db = getDb()

  const memories = db.prepare(`
    SELECT memory_id, slug, recall_count, unique_query_count, max_recall_score, scope
    FROM memories
    WHERE scope = 'short'
  `).all() as Parameters<typeof runLightPhase>[0]['memories']

  const wikilinks = db.prepare(`
    SELECT src_memory_id, dst_slug, dst_memory_id FROM memory_wikilinks
  `).all() as Parameters<typeof runLightPhase>[0]['wikilinks']

  const since = Date.now() - 24 * 60 * 60 * 1000
  const recallEvents = db.prepare(`
    SELECT memory_id, query, score, created_at FROM memory_recall_events WHERE created_at >= ?
  `).all(since) as Parameters<typeof runLightPhase>[0]['recallEvents']

  const result = await runLightPhase({ memories, wikilinks, recallEvents })

  console.log(result.report)
  console.log(`\n[fulcrum dream] light phase complete — ${result.danglingIds.length} dangling, ${result.scores.filter(s => s.meetsThreshold).length} promotion candidates.`)
}
