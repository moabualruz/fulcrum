import { describe, expect, it } from 'vitest'
import { join } from 'path'
import {
  pathFingerprint,
  resolveAllRuntimeDataProfiles,
  resolveRuntimeDataProfile,
} from '../runtime-profile.js'

const ROOT = '/tmp/fulcrum-runtime-profile-test'

describe('runtime data profile resolver', () => {
  it('resolves install, dev, and test to distinct data roots', () => {
    const profiles = resolveAllRuntimeDataProfiles({
      data_dir: ROOT,
      vault_path: join(ROOT, 'operator-vault'),
      cwd: '/workspace/project',
      env: {},
    })

    expect(profiles.install.profile).toBe('install')
    expect(profiles.dev.profile).toBe('dev')
    expect(profiles.test.profile).toBe('test')

    const pathSets = [profiles.install, profiles.dev, profiles.test].map(profile => profile.paths)
    for (const key of ['db', 'vault', 'graph', 'vectors', 'artifacts'] as const) {
      expect(new Set(pathSets.map(paths => paths[key])).size, `${key} paths must be profile-distinct`).toBe(3)
    }
  })

  it('normalizes paths and emits stable non-secret fingerprints', () => {
    const manifest = resolveRuntimeDataProfile({
      profile: 'dev',
      data_dir: `${ROOT}/../fulcrum-runtime-profile-test`,
      cwd: '/workspace/project',
      env: {},
    })

    expect(manifest.paths.db).toBe(join(ROOT, 'profiles', 'dev', 'fulcrum.db'))
    expect(manifest.path_fingerprints.db).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(manifest.path_fingerprints.db).toBe(pathFingerprint(manifest.paths.db))
  })

  it('marks install as confirmation-required and test as disposable', () => {
    const install = resolveRuntimeDataProfile({ profile: 'install', data_dir: ROOT, cwd: '/workspace/project', env: {} })
    const test = resolveRuntimeDataProfile({ profile: 'test', data_dir: ROOT, cwd: '/workspace/project', env: {} })

    expect(install.requires_confirmation).toBe(true)
    expect(install.disposable).toBe(false)
    expect(test.requires_confirmation).toBe(false)
    expect(test.disposable).toBe(true)
  })
})
