// v2a PR 6 Tasks 29-32 — hooks-writers unit tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  dedupKey, markSeen, clearDedupCache,
  extractFilePatch, summarizeDiff, isMutatingBash,
  hasTaskOutcomeForRun, sessionSummaryUniqueConstraintError,
} from '../hooks-writers.js'
import { renderRecallEnvelope } from '../hooks-session.js'
import { getDb, closeDb, runMigrations, type Db } from 'fulcrum-agent-core'

describe('dedup (v2a PR 6 Task 29 — per-turn dedup)', () => {
  beforeEach(() => { clearDedupCache() })

  it('dedupKey is deterministic across equivalent inputs', () => {
    const k1 = dedupKey('Edit', { file_path: '/x' }, '/cwd')
    const k2 = dedupKey('Edit', { file_path: '/x' }, '/cwd')
    expect(k1).toBe(k2)
  })

  it('dedupKey varies with tool_name, input, and cwd', () => {
    const base = dedupKey('Edit', { file_path: '/x' }, '/cwd')
    expect(dedupKey('Write', { file_path: '/x' }, '/cwd')).not.toBe(base)
    expect(dedupKey('Edit', { file_path: '/y' }, '/cwd')).not.toBe(base)
    expect(dedupKey('Edit', { file_path: '/x' }, '/other')).not.toBe(base)
  })

  it('markSeen returns true for first call and false for dupes', () => {
    const key = 'abc'
    expect(markSeen(key)).toBe(true)
    expect(markSeen(key)).toBe(false)
    expect(markSeen(key)).toBe(false)
  })
})

describe('extractFilePatch (Task 29)', () => {
  it('Write extracts file_path + content preview', () => {
    const result = extractFilePatch('Write', { file_path: '/tmp/a.ts', content: 'export const x = 1' })
    expect(result).not.toBeNull()
    expect(result!.filePath).toBe('/tmp/a.ts')
    expect(result!.operation).toBe('write')
  })

  it('Edit extracts diff summary', () => {
    const r = extractFilePatch('Edit', { file_path: '/x', old_string: 'a\nb', new_string: 'a\nc' })
    expect(r!.operation).toBe('edit')
    expect(r!.diffSummary).toMatch(/lines/)
  })

  it('MultiEdit concatenates multiple edits', () => {
    const r = extractFilePatch('MultiEdit', { file_path: '/x', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: 'd' }] })
    expect(r!.operation).toBe('multi-edit')
  })

  it('NotebookEdit uses notebook_path', () => {
    const r = extractFilePatch('NotebookEdit', { notebook_path: '/nb.ipynb', new_source: 'print(1)' })
    expect(r!.filePath).toBe('/nb.ipynb')
  })

  it('returns null for read-only tools', () => {
    expect(extractFilePatch('Read', { file_path: '/x' })).toBeNull()
    expect(extractFilePatch('Glob', { pattern: '**/*.ts' })).toBeNull()
    expect(extractFilePatch('Grep', { pattern: 'foo' })).toBeNull()
  })

  it('returns null when file_path missing', () => {
    expect(extractFilePatch('Edit', { old_string: 'a', new_string: 'b' })).toBeNull()
  })
})

describe('summarizeDiff', () => {
  it('reports line delta with sign', () => {
    expect(summarizeDiff('', 'a\nb\nc')).toMatch(/^\+3 lines/)
    expect(summarizeDiff('a\nb\nc', '')).toMatch(/^-3 lines/)
  })

  it('includes a preview of the new content', () => {
    expect(summarizeDiff('', 'hello world')).toContain('hello world')
  })
})

describe('isMutatingBash (Task 30 allowlist invert)', () => {
  it('accepts mutating verbs', () => {
    expect(isMutatingBash('rm -rf /tmp/x')).toBe(true)
    expect(isMutatingBash('mv a b')).toBe(true)
    expect(isMutatingBash('npm install')).toBe(true)
    expect(isMutatingBash('pnpm build')).toBe(true)
    expect(isMutatingBash('docker run foo')).toBe(true)
    expect(isMutatingBash('git commit -m "x"')).toBe(true)
    expect(isMutatingBash('git push origin main')).toBe(true)
  })

  it('rejects read-only commands', () => {
    expect(isMutatingBash('ls -la')).toBe(false)
    expect(isMutatingBash('cat /tmp/x')).toBe(false)
    expect(isMutatingBash('grep foo /tmp/x')).toBe(false)
    expect(isMutatingBash('find . -name "*.ts"')).toBe(false)
    expect(isMutatingBash('git status')).toBe(false)
    expect(isMutatingBash('git log')).toBe(false)
    expect(isMutatingBash('ps aux')).toBe(false)
  })

  it('detects mutating verbs after redirection / pipeline tokens', () => {
    expect(isMutatingBash('ls && rm x')).toBe(true)
    expect(isMutatingBash('cat x.txt > y.txt')).toBe(false)  // no mutating verb after >
    expect(isMutatingBash('echo foo > /tmp/out')).toBe(false)  // echo is not listed
    expect(isMutatingBash('ls ; mv a b')).toBe(true)
  })

  it('treats sed -i as mutating', () => {
    expect(isMutatingBash('sed -i s/foo/bar/g file')).toBe(true)
    expect(isMutatingBash('sed -n 1p file')).toBe(false)
  })

  it('treats tee without -a as mutating, tee -a as non-trivial', () => {
    expect(isMutatingBash('tee out.log')).toBe(true)
    expect(isMutatingBash('tee -a out.log')).toBe(false)  // append-only — still should be logged but v2a treats as safe
  })

  it('empty command is not mutating', () => {
    expect(isMutatingBash('')).toBe(false)
    expect(isMutatingBash('   ')).toBe(false)
  })
})

describe('hasTaskOutcomeForRun (Task 31 race guard)', () => {
  let db: Db
  let dir: string
  beforeEach(() => {
    closeDb()
    dir = mkdtempSync(join(tmpdir(), 'fulcrum-hw-'))
    db = getDb(dir)
    runMigrations(db)
  })
  afterEach(() => {
    closeDb()
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('returns true when task_outcome exists for run', () => {
    db.prepare(`INSERT INTO workspaces (workspace_id, name) VALUES ('ws', 'ws')`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, scope, kind, title, content, provenance) VALUES ('m1', 'ws', 'project', 'task_outcome', 't', 'c', '{"run_id":"r1"}')`).run()
    expect(hasTaskOutcomeForRun(db, 'r1')).toBe(true)
  })

  it('returns false when only other kinds exist', () => {
    db.prepare(`INSERT INTO workspaces (workspace_id, name) VALUES ('ws', 'ws')`).run()
    db.prepare(`INSERT INTO memories (memory_id, workspace_id, scope, kind, title, content, provenance) VALUES ('m1', 'ws', 'project', 'file_patch', 't', 'c', '{"run_id":"r1"}')`).run()
    expect(hasTaskOutcomeForRun(db, 'r1')).toBe(false)
  })

  it('returns false for unknown run_id', () => {
    expect(hasTaskOutcomeForRun(db, 'missing')).toBe(false)
  })

  it('sessionSummaryUniqueConstraintError recognizes UNIQUE errors', () => {
    expect(sessionSummaryUniqueConstraintError({ message: 'UNIQUE constraint failed', code: 'SQLITE_CONSTRAINT' })).toBe(true)
    expect(sessionSummaryUniqueConstraintError({ message: 'not a unique issue' })).toBe(false)
  })
})

describe('renderRecallEnvelope (Task 33 fence)', () => {
  it('wraps results in untrusted fence', () => {
    const output = renderRecallEnvelope({ results: ['hello', 'world'] })
    expect(output).toContain('<fulcrum-recall trust="untrusted">')
    expect(output).toContain('</fulcrum-recall>')
    expect(output).toContain('"hello"')
  })

  it('empty results get reason annotation', () => {
    expect(renderRecallEnvelope({ results: [], reason: 'no_match' })).toContain('reason=no_match')
    expect(renderRecallEnvelope({ results: [], reason: 'below_floor' })).toContain('reason=below_floor')
  })

  it('empty results with no reason defaults to no_match', () => {
    expect(renderRecallEnvelope({ results: [] })).toContain('reason=no_match')
  })
})
