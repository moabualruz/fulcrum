// v2b PR 10 Task 1.7 — SQLite ↔ Kuzu cross-store divergence monitor.
//
// checkDivergence() samples rows from SQLite tables and verifies each has a
// corresponding node in Kuzu. Designed for daily cron alerting on >0.1% drift.

export interface SqliteRowSampler {
  sampleIds(sqliteTable: string, limit: number): string[]
}

export interface KuzuNodeChecker {
  hasNode(table: string, id: string): Promise<boolean>
}

export interface TableConfig {
  table: string        // Kuzu node table name (e.g. 'Task')
  sqliteTable: string  // SQLite table name (e.g. 'tasks')
}

export interface DivergeReport {
  totalChecked: number
  missingInKuzu: number
  driftPct: number
  isDrifting: boolean
  missing: Array<{ table: string; id: string }>
}

export interface CheckOptions {
  sampleSize?: number
  alertThreshold?: number  // default 0.001 (0.1%)
}

export async function checkDivergence(
  tables: TableConfig[],
  sampler: SqliteRowSampler,
  checker: KuzuNodeChecker,
  opts: CheckOptions = {}
): Promise<DivergeReport> {
  const { sampleSize = 100, alertThreshold = 0.001 } = opts
  const missing: Array<{ table: string; id: string }> = []
  let totalChecked = 0

  for (const cfg of tables) {
    const ids = sampler.sampleIds(cfg.sqliteTable, sampleSize)
    for (const id of ids) {
      totalChecked++
      const exists = await checker.hasNode(cfg.table, id)
      if (!exists) missing.push({ table: cfg.table, id })
    }
  }

  const missingInKuzu = missing.length
  const driftPct = totalChecked === 0 ? 0 : missingInKuzu / totalChecked

  return {
    totalChecked,
    missingInKuzu,
    driftPct,
    isDrifting: driftPct > alertThreshold,
    missing,
  }
}
