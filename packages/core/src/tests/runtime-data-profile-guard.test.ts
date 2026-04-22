import { describe, expect, it } from 'vitest'
import { join } from 'path'
import {
  assertRuntimeDataProfileSafe,
  resolveRuntimeDataProfile,
} from '../runtime-profile.js'

const ROOT = '/tmp/fulcrum-runtime-profile-guard-test'

describe('runtime data profile contamination guards', () => {
  it('fails closed when test profile resolves to installed/operator DB path', () => {
    const manifest = resolveRuntimeDataProfile({
      profile: 'test',
      data_dir: ROOT,
      db_path: join(ROOT, 'fulcrum.db'),
      cwd: '/workspace/project',
      env: {},
    })

    expect(manifest.safe_for_destructive_execution).toBe(false)
    expect(manifest.errors).toContainEqual(expect.objectContaining({
      code: 'profile_path_overlap',
      profile: 'test',
      path_key: 'db',
    }))
    expect(() => assertRuntimeDataProfileSafe(manifest)).toThrow(/profile_path_overlap/)
  })

  it('fails closed when dev profile vault overlaps installed/operator vault', () => {
    const manifest = resolveRuntimeDataProfile({
      profile: 'dev',
      data_dir: ROOT,
      vault_path: join(ROOT, 'vault', 'review-child'),
      install_vault_path: join(ROOT, 'vault'),
      cwd: '/workspace/project',
      env: {},
    })

    expect(manifest.safe_for_destructive_execution).toBe(false)
    expect(manifest.errors).toContainEqual(expect.objectContaining({
      code: 'profile_path_overlap',
      profile: 'dev',
      path_key: 'vault',
    }))
  })

  it('fails closed when a dev profile root overlaps a different installed/operator root', () => {
    const manifest = resolveRuntimeDataProfile({
      profile: 'dev',
      data_dir: ROOT,
      artifacts_path: join(ROOT, 'vault', 'review-artifacts'),
      install_vault_path: join(ROOT, 'vault'),
      cwd: '/workspace/project',
      env: {},
    })

    expect(manifest.safe_for_destructive_execution).toBe(false)
    expect(manifest.errors).toContainEqual(expect.objectContaining({
      code: 'profile_path_overlap',
      profile: 'dev',
      path_key: 'artifacts',
      conflicts_with_path_key: 'vault',
    }))
  })

  it('treats global vault env as installed/operator vault for non-install profiles', () => {
    const operatorVault = join(ROOT, 'operator-vault')
    const manifest = resolveRuntimeDataProfile({
      profile: 'test',
      data_dir: ROOT,
      cwd: '/workspace/project',
      env: { FULCRUM_VAULT_PATH: operatorVault },
    })

    expect(manifest.paths.vault).toBe(operatorVault)
    expect(manifest.safe_for_destructive_execution).toBe(false)
    expect(manifest.errors).toContainEqual(expect.objectContaining({
      code: 'profile_path_overlap',
      profile: 'test',
      path_key: 'vault',
      conflicts_with_path: operatorVault,
    }))
  })
})
