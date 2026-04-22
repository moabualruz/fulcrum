import { createHash } from 'crypto'
import { homedir, tmpdir } from 'os'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { globalDataDir } from './db/client.js'
import type {
  FulcrumConfig,
  RuntimeDataProfile,
  RuntimeDataProfileManifest,
  RuntimeProfileError,
  RuntimeProfilePathKey,
  RuntimeProfilePaths,
} from './types.js'

const PROFILES: RuntimeDataProfile[] = ['install', 'dev', 'test']
const PATH_KEYS: RuntimeProfilePathKey[] = ['db', 'vault', 'graph', 'vectors', 'artifacts']

export interface ResolveRuntimeDataProfileInput {
  profile?: RuntimeDataProfile | string
  data_dir?: string
  db_path?: string
  vault_path?: string
  graph_path?: string
  vector_path?: string
  artifacts_path?: string
  install_db_path?: string
  install_vault_path?: string
  install_graph_path?: string
  install_vector_path?: string
  install_artifacts_path?: string
  cwd?: string
  env?: Record<string, string | undefined>
  config?: FulcrumConfig
}

function runtimeEnv(input: ResolveRuntimeDataProfileInput): Record<string, string | undefined> {
  return input.env ?? process.env
}

export function normalizeRuntimeDataProfile(value: string | undefined): RuntimeDataProfile {
  const profile = value ?? 'dev'
  if (!PROFILES.includes(profile as RuntimeDataProfile)) {
    throw new Error(`unknown runtime data profile: ${profile}`)
  }
  return profile as RuntimeDataProfile
}

export function normalizeRuntimePath(path: string): string {
  const normalized = resolve(path)
  return normalized.length > 1 ? normalized.replace(new RegExp(`${sep.replace('\\', '\\\\')}+$`), '') : normalized
}

export function pathFingerprint(path: string): string {
  return `sha256:${createHash('sha256').update(normalizeRuntimePath(path)).digest('hex')}`
}

function profileBaseDir(input: ResolveRuntimeDataProfileInput): string {
  const env = runtimeEnv(input)
  return normalizeRuntimePath(input.data_dir ?? env['FULCRUM_DATA_DIR'] ?? globalDataDir())
}

function configuredProfilePath(
  config: FulcrumConfig | undefined,
  profile: RuntimeDataProfile,
  key: RuntimeProfilePathKey,
): string | undefined {
  return config?.runtime_profiles?.[profile]?.[key]
}

function defaultVaultPath(input: ResolveRuntimeDataProfileInput, base: string): string {
  const env = runtimeEnv(input)
  return normalizeRuntimePath(
    input.install_vault_path ??
    configuredProfilePath(input.config, 'install', 'vault') ??
    input.config?.vault?.path ??
    env['FULCRUM_INSTALL_VAULT_PATH'] ??
    env['FULCRUM_VAULT_PATH'] ??
    join(base, 'vault')
  )
}

function installPaths(input: ResolveRuntimeDataProfileInput): RuntimeProfilePaths {
  const base = profileBaseDir(input)
  return {
    db: normalizeRuntimePath(input.install_db_path ?? join(base, 'fulcrum.db')),
    vault: defaultVaultPath(input, base),
    graph: normalizeRuntimePath(input.install_graph_path ?? join(base, 'graph')),
    vectors: normalizeRuntimePath(input.install_vector_path ?? join(base, 'vectors')),
    artifacts: normalizeRuntimePath(input.install_artifacts_path ?? join(base, 'artifacts')),
  }
}

function selectedPaths(profile: RuntimeDataProfile, input: ResolveRuntimeDataProfileInput): RuntimeProfilePaths {
  const env = runtimeEnv(input)
  const base = profileBaseDir(input)
  if (profile === 'install') {
    return {
      db: normalizeRuntimePath(input.db_path ?? input.install_db_path ?? join(base, 'fulcrum.db')),
      vault: normalizeRuntimePath(
        input.vault_path ??
        input.install_vault_path ??
        configuredProfilePath(input.config, 'install', 'vault') ??
        input.config?.vault?.path ??
        env['FULCRUM_VAULT_PATH'] ??
        join(base, 'vault')
      ),
      graph: normalizeRuntimePath(input.graph_path ?? input.install_graph_path ?? join(base, 'graph')),
      vectors: normalizeRuntimePath(input.vector_path ?? input.install_vector_path ?? join(base, 'vectors')),
      artifacts: normalizeRuntimePath(input.artifacts_path ?? input.install_artifacts_path ?? join(base, 'artifacts')),
    }
  }

  const profileRoot = profile === 'test' && !input.data_dir && !env['FULCRUM_DATA_DIR']
    ? normalizeRuntimePath(join(tmpdir(), 'fulcrum', 'profiles', 'test'))
    : normalizeRuntimePath(join(base, 'profiles', profile))

  return {
    db: normalizeRuntimePath(input.db_path ?? configuredProfilePath(input.config, profile, 'db') ?? join(profileRoot, 'fulcrum.db')),
    vault: normalizeRuntimePath(input.vault_path ?? configuredProfilePath(input.config, profile, 'vault') ?? env['FULCRUM_VAULT_PATH'] ?? join(profileRoot, 'vault')),
    graph: normalizeRuntimePath(input.graph_path ?? configuredProfilePath(input.config, profile, 'graph') ?? join(profileRoot, 'graph')),
    vectors: normalizeRuntimePath(input.vector_path ?? configuredProfilePath(input.config, profile, 'vectors') ?? join(profileRoot, 'vectors')),
    artifacts: normalizeRuntimePath(input.artifacts_path ?? configuredProfilePath(input.config, profile, 'artifacts') ?? join(profileRoot, 'artifacts')),
  }
}

function overlaps(a: string, b: string): boolean {
  const left = normalizeRuntimePath(a)
  const right = normalizeRuntimePath(b)
  if (left === right) return true
  const leftToRight = relative(left, right)
  const rightToLeft = relative(right, left)
  return Boolean(leftToRight && !leftToRight.startsWith('..') && !isAbsolute(leftToRight)) ||
    Boolean(rightToLeft && !rightToLeft.startsWith('..') && !isAbsolute(rightToLeft))
}

function safetyErrors(profile: RuntimeDataProfile, paths: RuntimeProfilePaths, input: ResolveRuntimeDataProfileInput): RuntimeProfileError[] {
  const errors: RuntimeProfileError[] = []
  if (profile === 'install') return errors

  const install = installPaths(input)
  for (const key of PATH_KEYS) {
    for (const installKey of PATH_KEYS) {
      if (overlaps(paths[key], install[installKey])) {
        errors.push({
          code: 'profile_path_overlap',
          profile,
          path_key: key,
          path: paths[key],
          conflicts_with_profile: 'install',
          conflicts_with_path_key: installKey,
          conflicts_with_path: install[installKey],
        })
      }
    }
  }

  const home = homedir()
  if (profile === 'test' && home && PATH_KEYS.some(key => paths[key] === normalizeRuntimePath(home))) {
    errors.push({ code: 'shared_global_path', profile, path_key: 'db', path: home })
  }

  return errors
}

export function resolveRuntimeDataProfile(input: ResolveRuntimeDataProfileInput = {}): RuntimeDataProfileManifest {
  const profile = normalizeRuntimeDataProfile(input.profile ?? runtimeEnv(input)['FULCRUM_PROFILE'] ?? input.config?.runtime_profile)
  const paths = selectedPaths(profile, input)
  const errors = safetyErrors(profile, paths, input)
  const path_fingerprints = Object.fromEntries(
    PATH_KEYS.map(key => [key, pathFingerprint(paths[key])])
  ) as Record<RuntimeProfilePathKey, string>

  return {
    profile,
    safe_for_destructive_execution: errors.length === 0,
    disposable: profile === 'test',
    requires_confirmation: profile === 'install',
    paths,
    path_fingerprints,
    errors,
  }
}

export function resolveAllRuntimeDataProfiles(input: ResolveRuntimeDataProfileInput = {}): Record<RuntimeDataProfile, RuntimeDataProfileManifest> {
  return {
    install: resolveRuntimeDataProfile({ ...input, profile: 'install' }),
    dev: resolveRuntimeDataProfile({
      ...input,
      profile: 'dev',
      db_path: undefined,
      vault_path: undefined,
      graph_path: undefined,
      vector_path: undefined,
      artifacts_path: undefined,
    }),
    test: resolveRuntimeDataProfile({
      ...input,
      profile: 'test',
      db_path: undefined,
      vault_path: undefined,
      graph_path: undefined,
      vector_path: undefined,
      artifacts_path: undefined,
    }),
  }
}

export function assertRuntimeDataProfileSafe(manifest: RuntimeDataProfileManifest): void {
  if (manifest.safe_for_destructive_execution) return
  throw new Error(manifest.errors.map(error => error.code).join(', '))
}

export function runtimeProfileDbMismatch(
  db: { name?: string },
  manifest: RuntimeDataProfileManifest,
): { code: 'runtime_profile_db_mismatch'; profile: RuntimeDataProfile; expected_path: string; actual_path: string; expected_fingerprint: string } | null {
  const name = db.name
  if (!name || name === ':memory:') return null
  const actual = normalizeRuntimePath(name)
  const expected = normalizeRuntimePath(manifest.paths.db)
  if (actual === expected) return null
  return {
    code: 'runtime_profile_db_mismatch',
    profile: manifest.profile,
    expected_path: expected,
    actual_path: actual,
    expected_fingerprint: manifest.path_fingerprints.db,
  }
}
