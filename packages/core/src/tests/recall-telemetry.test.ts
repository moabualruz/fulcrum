import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs'

function writeFileSyncOrIgnore(p: string, contents: string): void {
  try { writeFileSync(p, contents, 'utf8') } catch { /* ignore */ }
}
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { logRecallEvent, telemetryPath } from '../recall-telemetry.js'

describe('recall-telemetry (PR 3 R1)', () => {
  let tmp: string
  const originalHome = process.env.HOME
  const originalFulcrumDir = process.env.FULCRUM_DATA_DIR

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fulcrum-telemetry-'))
    process.env.FULCRUM_DATA_DIR = tmp
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    if (originalFulcrumDir === undefined) delete process.env.FULCRUM_DATA_DIR
    else process.env.FULCRUM_DATA_DIR = originalFulcrumDir
  })

  it('telemetryPath points under globalDataDir()/telemetry/recall_bias.jsonl', () => {
    expect(telemetryPath().endsWith('telemetry/recall_bias.jsonl')).toBe(true)
  })

  it('creates the telemetry directory on first write', () => {
    logRecallEvent({
      kind: 'recall_called',
      agent_type: 'claude',
      session_id: 'run_1',
    })
    expect(existsSync(telemetryPath())).toBe(true)
  })

  it('appends JSONL records with ts + kind + agent_type + session_id', () => {
    logRecallEvent({ kind: 'recall_called',         agent_type: 'claude', session_id: 'run_x' })
    logRecallEvent({ kind: 'grep_called_without_recall', agent_type: 'claude', session_id: 'run_x' })
    const lines = readFileSync(telemetryPath(), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0]!)
    expect(first.kind).toBe('recall_called')
    expect(first.agent_type).toBe('claude')
    expect(first.session_id).toBe('run_x')
    expect(first.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('records variant + tool_name + grep counter when provided (Variant A nudge)', () => {
    logRecallEvent({
      kind: 'nudge_emitted',
      agent_type: 'claude',
      session_id: 'run_y',
      turn_id: 'turn_5',
      variant: 'A',
      tool_name: 'Grep',
      grep_count_without_recall: 3,
    })
    const line = JSON.parse(readFileSync(telemetryPath(), 'utf8').trim())
    expect(line.variant).toBe('A')
    expect(line.tool_name).toBe('Grep')
    expect(line.grep_count_without_recall).toBe(3)
    expect(line.turn_id).toBe('turn_5')
  })

  it('never throws — failures are swallowed so telemetry cannot block a hook', () => {
    // Stub logRecallEvent's write path by pointing at a path that requires
    // a file to exist where a directory is expected; readonly / system paths
    // behave inconsistently in CI containers, so we point at a sibling file.
    const blockedPath = join(tmp, 'blocker-file')
    writeFileSyncOrIgnore(blockedPath, 'not-a-dir')
    process.env.FULCRUM_DATA_DIR = blockedPath
    expect(() =>
      logRecallEvent({ kind: 'recall_called', agent_type: 'claude', session_id: 'x' }),
    ).not.toThrow()
  })
})
