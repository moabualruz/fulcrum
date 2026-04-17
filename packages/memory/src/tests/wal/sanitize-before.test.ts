import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { appendWal, walPathFor, WalDurabilityError } from '../../wal/writer.js'

describe('WAL writer — v2a PR 5 Task 26', () => {
  let dataDir: string
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'fulcrum-wal-'))
    process.env['FULCRUM_DATA_DIR'] = dataDir
  })
  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true })
    delete process.env['FULCRUM_DATA_DIR']
  })

  it('appends a JSONL record at db/wal/memory-writes-YYYY-MM-DD.jsonl', () => {
    const path = walPathFor()
    expect(path).toContain('db/wal/memory-writes-')
    appendWal({
      op: 'WRITE',
      memory_id: 'mem_test',
      kind: 'fact',
      workspace_id: 'ws_1',
      content: 'clean content',
      sanitize_events: [],
    })
    expect(existsSync(path)).toBe(true)
    const lines = readFileSync(path, 'utf8').trim().split('\n')
    expect(lines.length).toBe(1)
    const record = JSON.parse(lines[0]!)
    expect(record.op).toBe('WRITE')
    expect(record.memory_id).toBe('mem_test')
    expect(typeof record.content_sha256).toBe('string')
    expect(record.content_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('records content_sha256 only — never the body', () => {
    const path = walPathFor()
    const body = 'sensitive body that must NOT appear in the WAL'
    appendWal({
      op: 'WRITE',
      memory_id: 'mem_x',
      kind: 'fact',
      workspace_id: 'ws_1',
      content: body,
      sanitize_events: [],
    })
    const raw = readFileSync(path, 'utf8')
    expect(raw).not.toContain('sensitive body')
    expect(raw).not.toContain('NOT appear')
  })

  it('records sanitize_events from the upstream middleware', () => {
    const path = walPathFor()
    appendWal({
      op: 'WRITE',
      memory_id: 'mem_z',
      kind: 'fact',
      workspace_id: 'ws_1',
      content: 'x',
      sanitize_events: [{ rule: 'fence.strip', severity: 'info' }],
    })
    const record = JSON.parse(readFileSync(path, 'utf8').trim().split('\n')[0]!)
    expect(record.sanitize_events).toHaveLength(1)
    expect(record.sanitize_events[0].rule).toBe('fence.strip')
  })

  it('WalDurabilityError carries an errno hint', () => {
    const err = new WalDurabilityError('disk full', 'ENOSPC')
    expect(err.errno).toBe('ENOSPC')
    expect(err.name).toBe('WalDurabilityError')
  })
})
