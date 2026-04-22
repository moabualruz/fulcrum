import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { createHash } from 'crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runRagRebuild } from '../setup/rag-lifecycle.js'

let root = ''

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
  root = mkdtempSync(join(tmpdir(), 'fulcrum-profile-isolation-'))
})

afterEach(() => {
  resetTestDb()
  rmSync(root, { recursive: true, force: true })
})

function fileHash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

describe('profile-scoped RAG rebuild isolation', () => {
  it('clears allowlisted derived state only inside the selected dev profile', async () => {
    const installDbSentinel = join(root, 'fulcrum.db')
    const installVaultSentinel = join(root, 'vault', 'sentinel.md')
    mkdirSync(join(root, 'vault'), { recursive: true })
    writeFileSync(installDbSentinel, 'operator-db')
    writeFileSync(installVaultSentinel, 'operator-vault')

    const before = [fileHash(installDbSentinel), fileHash(installVaultSentinel)]

    const result = await runRagRebuild({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      runtime_profile: 'dev',
      data_dir: root,
      domains: ['code'],
      allow_empty: true,
    }, getDb())

    expect(result.status).toBe('completed')
    expect(result.scope.runtime_profile).toBe('dev')
    expect(result.profile_manifest.paths.db).toBe(join(root, 'profiles', 'dev', 'fulcrum.db'))
    expect([fileHash(installDbSentinel), fileHash(installVaultSentinel)]).toEqual(before)
  })

  it('uses the selected profile DB when the caller does not inject a DB', async () => {
    const result = await runRagRebuild({
      workspace_id: 'ws_profile',
      project_id: 'proj_profile',
      mode: 'execute',
      runtime_profile: 'dev',
      data_dir: root,
      domains: ['code'],
      allow_empty: true,
    })

    expect(result.status).toBe('completed')
    expect(result.profile_manifest.paths.db).toBe(join(root, 'profiles', 'dev', 'fulcrum.db'))
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM rag_rebuild_reports').get()).toEqual({ n: 0 })

    const profileDb = new Database(join(root, 'profiles', 'dev', 'fulcrum.db'))
    try {
      expect(profileDb.prepare('SELECT COUNT(*) AS n FROM rag_rebuild_reports').get()).toEqual({ n: 1 })
    } finally {
      profileDb.close()
    }
  })
})
