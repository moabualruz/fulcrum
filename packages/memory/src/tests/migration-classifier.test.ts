// packages/memory/src/tests/migration-classifier.test.ts
//
// Memory v3 PR 6 unit 6.1 — classifier maps existing memory.kind to the
// v3 migration tier (`l0_raw`, `l1_curated_stub`, or `unknown`).
//
// Plan §PR 6.1 — only the explicit lists migrate by default:
//   L0_raw:          bash_trace, file_patch, tool_trace, session_summary
//   L1_curated_stub: decision, identity, persona, concept, fact
// Everything else (v2b graph kinds, legacy content kinds, pre_compact_extract,
// summary, delegation_summary, …) classifies as `unknown` and needs an
// explicit operator opt-in before migrating — narrowest safe reading.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { newId } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import {
  classifyMemoryKind,
  classifyMemoriesForMigration,
  buildClassifierReport,
  type MigrationClass,
} from '../migration/classifier.js'

function seedMemory(kind: string, opts: { workspace_id?: string; project_id?: string; content?: string } = {}): string {
  const db = getDb()
  const id = newId('memory')
  db.prepare(`
    INSERT INTO memories(memory_id, workspace_id, project_id, scope, kind, title, summary, content)
    VALUES(?, ?, ?, 'project', ?, '', '', ?)
  `).run(id, opts.workspace_id ?? 'ws_mig', opts.project_id ?? 'proj_mig', kind, opts.content ?? 'body')
  return id
}

beforeEach(() => {
  createTestDb()
  seedWorkspaceAndProject(getDb(), 'ws_mig', 'proj_mig')
  seedWorkspaceAndProject(getDb(), 'ws_other', 'proj_other')
})

afterEach(() => {
  resetTestDb()
})

describe('classifyMemoryKind — explicit L0_raw mapping (plan §6.1)', () => {
  it.each([
    ['bash_trace', 'bash_trace'],
    ['file_patch', 'file_patch'],
    ['tool_trace', 'tool_trace'],
  ] as const)('kind=%s classifies as l0_raw with source_type=%s', (kind, source_type) => {
    const out = classifyMemoryKind(kind)
    expect(out.classification).toBe<MigrationClass>('l0_raw')
    expect(out.l0_source_type).toBe(source_type)
  })

  it('kind=session_summary classifies as l0_raw with source_type=session_transcript (plan lists session_summary but l0/types.ts canonicalises on session_transcript)', () => {
    const out = classifyMemoryKind('session_summary')
    expect(out.classification).toBe('l0_raw')
    expect(out.l0_source_type).toBe('session_transcript')
  })
})

describe('classifyMemoryKind — explicit L1_curated_stub mapping (plan §6.1)', () => {
  it.each(['decision', 'identity', 'persona', 'concept', 'fact'])('kind=%s classifies as l1_curated_stub', (kind) => {
    const out = classifyMemoryKind(kind)
    expect(out.classification).toBe('l1_curated_stub')
    expect(out.l0_source_type).toBeUndefined()
  })
})

describe('classifyMemoryKind — unknown fallback', () => {
  it.each([
    'pre_compact_extract',
    'delegation_summary',
    'blocker_resolution',
    'task_outcome',
    'summary',
    // legacy (v1) kinds
    'symbol',
    'procedure',
    'error',
    'diff',
    'doc',
    'code',
    'task_goal',
    'task_decision',
    'task_failure',
    'reasoning_step',
    'lesson',
    // v2b graph kinds
    'entity',
    'edge',
    'agent_card',
    'policy_event',
    'external_ref',
    'git_commit',
    'git_branch',
    'git_pr',
    'git_tag',
    'agent_adapter',
    'artifact_contract',
    'notification_event',
    // completely unknown
    'xyz_made_up',
  ])('kind=%s classifies as unknown', (kind) => {
    const out = classifyMemoryKind(kind)
    expect(out.classification).toBe('unknown')
    expect(out.l0_source_type).toBeUndefined()
  })

  it('empty string and whitespace-only kinds classify as unknown', () => {
    expect(classifyMemoryKind('').classification).toBe('unknown')
    expect(classifyMemoryKind('   ').classification).toBe('unknown')
  })
})

describe('classifyMemoriesForMigration — DB walk', () => {
  it('returns one classified row per memories row (all classes represented)', () => {
    seedMemory('bash_trace')
    seedMemory('file_patch')
    seedMemory('decision')
    seedMemory('fact')
    seedMemory('entity') // unknown

    const rows = classifyMemoriesForMigration(getDb())
    expect(rows).toHaveLength(5)
    const classes = rows.map(r => r.classification).sort()
    expect(classes).toEqual(['l0_raw', 'l0_raw', 'l1_curated_stub', 'l1_curated_stub', 'unknown'])
  })

  it('excludes rows already migrated to schema_version >= 3', () => {
    const legacy = seedMemory('decision')
    const v3 = seedMemory('decision')
    getDb().prepare('UPDATE memories SET schema_version = 3 WHERE memory_id = ?').run(v3)

    const rows = classifyMemoriesForMigration(getDb())
    expect(rows.map(r => r.memory_id)).toEqual([legacy])
  })

  it('honours workspace_id filter', () => {
    seedMemory('decision', { workspace_id: 'ws_mig' })
    seedMemory('decision', { workspace_id: 'ws_other' })

    const rows = classifyMemoriesForMigration(getDb(), { workspaceId: 'ws_mig' })
    expect(rows).toHaveLength(1)
  })

  it('propagates workspace_id, project_id, and content_length on each ClassifiedRow', () => {
    const id = seedMemory('bash_trace', { content: 'hello world' })
    const [row] = classifyMemoriesForMigration(getDb())
    expect(row.memory_id).toBe(id)
    expect(row.workspace_id).toBe('ws_mig')
    expect(row.project_id).toBe('proj_mig')
    expect(row.kind).toBe('bash_trace')
    expect(row.content_length).toBe('hello world'.length)
  })
})

describe('buildClassifierReport', () => {
  it('counts totals and classes', () => {
    seedMemory('bash_trace')
    seedMemory('file_patch')
    seedMemory('decision')
    seedMemory('identity')
    seedMemory('concept')
    seedMemory('entity')
    seedMemory('external_ref')

    const rows = classifyMemoriesForMigration(getDb())
    const report = buildClassifierReport(rows)
    expect(report.total).toBe(7)
    expect(report.by_class.l0_raw).toBe(2)
    expect(report.by_class.l1_curated_stub).toBe(3)
    expect(report.by_class.unknown).toBe(2)
    expect(report.unknown_kinds.sort()).toEqual(['entity', 'external_ref'])
  })

  it('by_kind surfaces per-kind counts with classification', () => {
    seedMemory('bash_trace')
    seedMemory('bash_trace')
    seedMemory('decision')

    const report = buildClassifierReport(classifyMemoriesForMigration(getDb()))
    expect(report.by_kind.bash_trace?.count).toBe(2)
    expect(report.by_kind.bash_trace?.classification).toBe('l0_raw')
    expect(report.by_kind.decision?.count).toBe(1)
    expect(report.by_kind.decision?.classification).toBe('l1_curated_stub')
  })

  it('empty db → total=0, unknown_kinds empty', () => {
    const report = buildClassifierReport(classifyMemoriesForMigration(getDb()))
    expect(report.total).toBe(0)
    expect(report.by_class).toEqual({ l0_raw: 0, l1_curated_stub: 0, unknown: 0 })
    expect(report.unknown_kinds).toEqual([])
  })
})
