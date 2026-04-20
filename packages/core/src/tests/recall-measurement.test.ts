import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { summarizeRecallTelemetry, loadRecallEvents, summarizeRecallEvents } from '../recall-measurement.js'

describe('recall-measurement', () => {
  let tmp: string
  const originalFulcrumDir = process.env.FULCRUM_DATA_DIR

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fulcrum-measure-'))
    process.env.FULCRUM_DATA_DIR = tmp
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
    if (originalFulcrumDir === undefined) delete process.env.FULCRUM_DATA_DIR
    else process.env.FULCRUM_DATA_DIR = originalFulcrumDir
  })

  function writeEvents(events: unknown[]): void {
    const path = join(tmp, 'telemetry', 'recall_bias.jsonl')
    mkdirSync(join(tmp, 'telemetry'), { recursive: true })
    writeFileSync(path, events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  }

  it('returns zero summary when telemetry is absent', () => {
    const s = summarizeRecallTelemetry()
    expect(s.total_events).toBe(0)
    expect(s.sessions).toBe(0)
    expect(s.recall_rate).toBe(0)
  })

  it('aggregates per-session counters across the four event kinds', () => {
    writeEvents([
      { ts: '2026-04-20T00:00:00Z', kind: 'grep_called_without_recall', agent_type: 'claude', session_id: 'run_A', tool_name: 'Grep' },
      { ts: '2026-04-20T00:00:01Z', kind: 'nudge_emitted', agent_type: 'claude', session_id: 'run_A', variant: 'A', tool_name: 'Grep' },
      { ts: '2026-04-20T00:00:10Z', kind: 'recall_called', agent_type: 'claude', session_id: 'run_A', tool_name: 'mcp__fulcrum__recall_knowledge' },
      { ts: '2026-04-20T01:00:00Z', kind: 'grep_called_without_recall', agent_type: 'claude', session_id: 'run_B' },
      { ts: '2026-04-20T01:00:01Z', kind: 'nudge_opt_out', agent_type: 'claude', session_id: 'run_B' },
    ])
    const s = summarizeRecallTelemetry()
    expect(s.total_events).toBe(5)
    expect(s.sessions).toBe(2)
    expect(s.grep_without_recall).toBe(2)
    expect(s.recall_called).toBe(1)
    expect(s.nudge_emitted).toBe(1)
    expect(s.nudge_opt_out).toBe(1)
  })

  it('computes recall_rate as recall / (recall + grep_without_recall)', () => {
    writeEvents([
      { ts: '2026-04-20T00:00:00Z', kind: 'recall_called',               agent_type: 'claude', session_id: 'run_A' },
      { ts: '2026-04-20T00:00:01Z', kind: 'recall_called',               agent_type: 'claude', session_id: 'run_A' },
      { ts: '2026-04-20T00:00:02Z', kind: 'recall_called',               agent_type: 'claude', session_id: 'run_A' },
      { ts: '2026-04-20T00:00:03Z', kind: 'grep_called_without_recall',  agent_type: 'claude', session_id: 'run_A' },
    ])
    const s = summarizeRecallTelemetry()
    expect(s.recall_rate).toBeCloseTo(0.75, 3)
  })

  it('skips malformed JSONL lines instead of throwing', () => {
    const path = join(tmp, 'telemetry', 'recall_bias.jsonl')
    mkdirSync(join(tmp, 'telemetry'), { recursive: true })
    writeFileSync(
      path,
      [
        JSON.stringify({ ts: 't', kind: 'recall_called', agent_type: 'claude', session_id: 'run_X' }),
        '{"malformed',
        '',
        JSON.stringify({ ts: 't', kind: 'grep_called_without_recall', agent_type: 'claude', session_id: 'run_X' }),
      ].join('\n'),
    )
    const events = loadRecallEvents(path)
    expect(events.length).toBe(2)
    const s = summarizeRecallEvents(events)
    expect(s.recall_called).toBe(1)
    expect(s.grep_without_recall).toBe(1)
  })

  it('records first_seen / last_seen per session', () => {
    writeEvents([
      { ts: '2026-04-20T00:00:00Z', kind: 'grep_called_without_recall', agent_type: 'claude', session_id: 'run_A' },
      { ts: '2026-04-20T02:00:00Z', kind: 'recall_called', agent_type: 'claude', session_id: 'run_A' },
      { ts: '2026-04-20T01:00:00Z', kind: 'recall_called', agent_type: 'claude', session_id: 'run_A' },
    ])
    const s = summarizeRecallTelemetry()
    const session = s.per_session[0]!
    expect(session.first_seen).toBe('2026-04-20T00:00:00Z')
    expect(session.last_seen).toBe('2026-04-20T01:00:00Z')
  })
})
