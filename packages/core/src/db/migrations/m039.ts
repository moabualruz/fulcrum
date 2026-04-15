import type Database from 'better-sqlite3'

// MIGRATION_039 — separate run_events table (Task 4.6)
// Replaces the agent_runs.events JSON blob with a proper relational table.
// Each heartbeat/lifecycle event becomes a single INSERT instead of a
// JSON read-modify-write cycle, eliminating O(N) write amplification.
export function runM039(db: Database.Database): void {
  const already = db.prepare("SELECT id FROM schema_migrations WHERE name = '039_run_events_table'").get()
  if (!already) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS run_events (
        id          TEXT PRIMARY KEY,
        run_id      TEXT NOT NULL REFERENCES agent_runs(run_id) ON DELETE CASCADE,
        ts          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        event_type  TEXT NOT NULL,
        payload     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, ts);
    `)

    // Backfill: migrate existing events JSON blobs from agent_runs.events
    // into individual run_events rows.
    const runRows = db.prepare(`SELECT run_id, events FROM agent_runs WHERE events IS NOT NULL AND events != '[]'`).all() as Array<{ run_id: string; events: string }>
    const insertEvt = db.prepare(
      'INSERT OR IGNORE INTO run_events (id, run_id, ts, event_type, payload) VALUES (?, ?, ?, ?, ?)'
    )
    const getRandomId = db.prepare("SELECT lower(hex(randomblob(10))) AS v")
    const backfill = db.transaction(() => {
      for (const runRow of runRows) {
        let eventsArr: Array<{ ts?: string; event_type?: string; payload?: Record<string, unknown> }> = []
        try {
          eventsArr = JSON.parse(runRow.events) as typeof eventsArr
        } catch {
          continue
        }
        if (!Array.isArray(eventsArr)) continue
        for (const evt of eventsArr) {
          if (!evt.event_type) continue
          const idRow = getRandomId.get() as { v: string }
          const evtId = 'revt_' + idRow.v
          const ts = evt.ts ?? new Date().toISOString()
          const payload = evt.payload ? JSON.stringify(evt.payload) : null
          insertEvt.run(evtId, runRow.run_id, ts, evt.event_type, payload)
        }
      }
    })
    backfill()

    db.prepare("INSERT OR IGNORE INTO schema_migrations (name) VALUES ('039_run_events_table')").run()
  }
}
