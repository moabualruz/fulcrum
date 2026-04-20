import type Database from 'better-sqlite3'

// Cross-process coordination state for the Fulcrum-first bias measurement spike
// (PR 3, v3.3 R1). The Claude PreToolUse hook increments grep-without-recall
// per (session_id, turn_id, agent_type); the recall path resets it.
//
// AD-9b: `session_id` comes from hook stdin and is UNTRUSTED. Every write path
// must first call `isTrustedSession` to verify the session maps to an
// `agent_runs.run_id` row before any insert/update.

export interface RecallTurnState {
  session_id: string
  turn_id: string
  agent_type: string
  last_recall_at: string | null
  grep_count_without_recall: number
  created_at: string
  updated_at: string
}

export function isTrustedSession(db: Database.Database, sessionId: string): boolean {
  if (!sessionId) return false
  const row = db
    .prepare('SELECT 1 as found FROM agent_runs WHERE run_id = ? LIMIT 1')
    .get(sessionId) as { found: number } | undefined
  return row?.found === 1
}

export function recordRecall(
  db: Database.Database,
  params: { sessionId: string; turnId?: string; agentType: string },
): void {
  if (!isTrustedSession(db, params.sessionId)) return
  const turnId = params.turnId ?? ''
  db.prepare(
    `INSERT INTO recall_turn_state
       (session_id, turn_id, agent_type, last_recall_at, grep_count_without_recall,
        created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), 0, datetime('now'), datetime('now'))
     ON CONFLICT(session_id, turn_id, agent_type) DO UPDATE SET
       last_recall_at = datetime('now'),
       grep_count_without_recall = 0,
       updated_at = datetime('now')`,
  ).run(params.sessionId, turnId, params.agentType)
}

export function recordGrepWithoutRecall(
  db: Database.Database,
  params: { sessionId: string; turnId?: string; agentType: string },
): number {
  if (!isTrustedSession(db, params.sessionId)) return 0
  const turnId = params.turnId ?? ''
  db.prepare(
    `INSERT INTO recall_turn_state
       (session_id, turn_id, agent_type, grep_count_without_recall,
        created_at, updated_at)
     VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
     ON CONFLICT(session_id, turn_id, agent_type) DO UPDATE SET
       grep_count_without_recall = recall_turn_state.grep_count_without_recall + 1,
       updated_at = datetime('now')`,
  ).run(params.sessionId, turnId, params.agentType)
  const row = db
    .prepare(
      `SELECT grep_count_without_recall AS count
         FROM recall_turn_state
        WHERE session_id = ? AND turn_id = ? AND agent_type = ?`,
    )
    .get(params.sessionId, turnId, params.agentType) as { count: number } | undefined
  return row?.count ?? 0
}

export function getTurnState(
  db: Database.Database,
  params: { sessionId: string; turnId?: string; agentType: string },
): RecallTurnState | null {
  const turnId = params.turnId ?? ''
  const row = db
    .prepare(
      `SELECT session_id, turn_id, agent_type, last_recall_at,
              grep_count_without_recall, created_at, updated_at
         FROM recall_turn_state
        WHERE session_id = ? AND turn_id = ? AND agent_type = ?`,
    )
    .get(params.sessionId, turnId, params.agentType) as RecallTurnState | undefined
  return row ?? null
}
