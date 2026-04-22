import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { _configureDb, closeDb, getDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { executeRagRebuildCommand, inspectRuntimeProfilePaths } from '../commands/memory-rag-lifecycle.js'

const DATA_DIR = '/tmp/fulcrum-cli-profile-contract'
let tempRoot = ''

beforeEach(() => {
  vi.stubEnv('FULCRUM_DATA_DIR', DATA_DIR)
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
})

afterEach(() => {
  closeDb()
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true })
  tempRoot = ''
  vi.unstubAllEnvs()
})

function openMigratedDb(path: string): Database.Database {
  const db = new Database(path)
  _configureDb(db)
  runMigrations(db)
  return db
}

describe('runtime profile CLI contract', () => {
  it('inspects profile paths without mutating rebuild state', () => {
    const beforeReports = getDb().prepare('SELECT COUNT(*) AS n FROM rag_rebuild_reports').get() as { n: number }

    const manifest = inspectRuntimeProfilePaths({ profile: 'dev' })

    expect(manifest.profile).toBe('dev')
    expect(manifest.paths.db).toContain('/profiles/dev/')
    expect(manifest.path_fingerprints.db).toMatch(/^sha256:/)
    expect(manifest.safe_for_destructive_execution).toBe(true)

    const afterReports = getDb().prepare('SELECT COUNT(*) AS n FROM rag_rebuild_reports').get() as { n: number }
    expect(afterReports.n).toBe(beforeReports.n)
  })

  it('returns structured non-mutating error when execute omits explicit runtime profile', async () => {
    const result = await executeRagRebuildCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      domains: ['code'],
      allow_empty: true,
    }, getDb())

    expect(result.status).toBe('failed')
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'runtime_profile_required' }))
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM rag_rebuild_reports').get()).toEqual({ n: 0 })
  })

  it('requires installed/operator confirmation before install profile execution', async () => {
    const result = await executeRagRebuildCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      runtime_profile: 'install',
      domains: ['code'],
      allow_empty: true,
    }, getDb())

    expect(result.status).toBe('failed')
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'install_profile_confirmation_required' }))
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM rag_rebuild_reports').get()).toEqual({ n: 0 })
  })

  it('executes rebuilds against the selected profile DB when no DB is injected', async () => {
    closeDb()
    tempRoot = mkdtempSync(join(tmpdir(), 'fulcrum-cli-profile-db-'))
    const installDb = openMigratedDb(join(tempRoot, 'fulcrum.db'))
    installDb.close()

    const result = await executeRagRebuildCommand({
      workspace_id: 'ws_file',
      project_id: 'proj_file',
      mode: 'execute',
      runtime_profile: 'dev',
      data_dir: tempRoot,
      domains: ['code'],
      allow_empty: true,
    })

    expect(result.status).toBe('completed')
    expect(result.profile_manifest.paths.db).toBe(join(tempRoot, 'profiles', 'dev', 'fulcrum.db'))

    const devDb = new Database(join(tempRoot, 'profiles', 'dev', 'fulcrum.db'))
    const installCheckDb = new Database(join(tempRoot, 'fulcrum.db'))
    try {
      expect(devDb.prepare('SELECT COUNT(*) AS n FROM rag_rebuild_reports').get()).toEqual({ n: 1 })
      expect(installCheckDb.prepare('SELECT COUNT(*) AS n FROM rag_rebuild_reports').get()).toEqual({ n: 0 })
    } finally {
      devDb.close()
      installCheckDb.close()
    }
  })

  it('fails closed when an injected file DB does not match the selected profile', async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'fulcrum-cli-profile-mismatch-'))
    const wrongDb = openMigratedDb(join(tempRoot, 'fulcrum.db'))

    const result = await executeRagRebuildCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      runtime_profile: 'dev',
      data_dir: tempRoot,
      domains: ['code'],
      allow_empty: true,
    }, wrongDb)

    expect(result.status).toBe('failed')
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'runtime_profile_db_mismatch' }))
    expect(wrongDb.prepare('SELECT COUNT(*) AS n FROM rag_rebuild_reports').get()).toEqual({ n: 0 })
    wrongDb.close()
  })
})
