import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runRagRebuild } from '../setup/rag-lifecycle.js'
import { readRebuildReport } from '../setup/rebuild-report.js'

let root = ''

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
  root = mkdtempSync(join(tmpdir(), 'fulcrum-profile-backup-'))
})

afterEach(() => {
  resetTestDb()
  rmSync(root, { recursive: true, force: true })
})

describe('installed/operator rebuild backup reporting', () => {
  it('records backup reference, confirmation, path fingerprints, verification refs, and audit-ready scope', async () => {
    const installDbPath = join(root, 'fulcrum.db')
    const installVaultFile = join(root, 'vault', 'sentinel.md')
    mkdirSync(join(root, 'vault'), { recursive: true })
    writeFileSync(installDbPath, 'operator-db')
    writeFileSync(installVaultFile, 'operator-vault')

    const result = await runRagRebuild({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      runtime_profile: 'install',
      data_dir: root,
      confirm_profile: 'install',
      verification_refs: ['report_dev_ok', 'report_test_ok'],
      domains: ['code'],
      allow_empty: true,
    }, getDb())

    expect(result.status).toBe('completed')
    expect(result.scope.runtime_profile).toBe('install')
    const backup = result.backup
    expect(backup?.backup_ref).toMatch(/^backup_/)
    expect(backup?.backup_path).toBe(join(root, 'artifacts', 'backups', backup?.backup_ref ?? ''))
    const backupPath = backup?.backup_path ?? ''
    expect(existsSync(join(backupPath, 'profile-manifest.json'))).toBe(true)
    const backupDb = new Database(join(backupPath, 'fulcrum.db'), { readonly: true })
    try {
      expect(backupDb.prepare("SELECT COUNT(*) AS n FROM workspaces WHERE workspace_id = 'ws_1'").get()).toEqual({ n: 1 })
    } finally {
      backupDb.close()
    }
    expect(readFileSync(join(backupPath, 'vault', 'sentinel.md'), 'utf8')).toBe('operator-vault')
    expect(result.profile_confirmation).toBe('install')
    expect(result.verification_refs).toEqual(['report_dev_ok', 'report_test_ok'])
    expect(result.profile_manifest.path_fingerprints.db).toMatch(/^sha256:/)

    const row = getDb().prepare(`
      SELECT runtime_profile, profile_manifest, backup_ref, verification_refs, mutation_scope
      FROM rag_rebuild_reports
      WHERE report_id = ?
    `).get(result.report_id) as {
      runtime_profile: string
      profile_manifest: string
      backup_ref: string
      verification_refs: string
      mutation_scope: string
    }

    expect(row.runtime_profile).toBe('install')
    expect(row.backup_ref).toBe(result.backup?.backup_ref)
    expect(JSON.parse(row.verification_refs)).toEqual(['report_dev_ok', 'report_test_ok'])
    expect(JSON.parse(row.profile_manifest).path_fingerprints.db).toMatch(/^sha256:/)
    expect(JSON.parse(row.mutation_scope)).toMatchObject({ profile: 'install', clear_scope: 'derived_rag_state' })

    const persisted = readRebuildReport(result.report_id, 'ws_1', getDb())
    expect(persisted.backup?.backup_path).toBe(backupPath)
  })

  it('rejects installed/operator execution without explicit profile confirmation in memory primitive', async () => {
    const result = await runRagRebuild({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      runtime_profile: 'install',
      data_dir: root,
      domains: ['code'],
      allow_empty: true,
    }, getDb())

    expect(result.status).toBe('failed')
    expect(result.backup).toBeNull()
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'install_profile_confirmation_required' }))
  })
})
