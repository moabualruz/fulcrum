// packages/cli/src/plugin-discovery.ts
// Scan node_modules for packages that declare a "fulcrum" key in their
// package.json manifest, then register their hooks, skills, and agents.

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { globalDataDir } from 'fulcrum-core'
import type { ToolSchema } from './mcp-tools.js'

// ---------- Types ----------

export interface PluginSetting {
  /** Setting name (used as key in config) */
  name: string
  /** Environment variable to read the value from at runtime */
  envVar: string
  /** Human-readable description shown during install prompting */
  description?: string
  /** If true, the value should be stored in the vault and masked in output */
  sensitive?: boolean
  /** Default value used when neither envVar nor explicit config is set */
  default?: string
}

export interface FulcrumPluginManifest {
  type: 'plugin'
  /** Path (relative to package root) to a CommonJS/ESM module exporting hook handlers */
  hooks?: string
  /** Directory (relative to package root) containing SKILL.md files */
  skills?: string
  /** Directory (relative to package root) containing agent MD files */
  agents?: string
  /** Path (relative to package root) to a JSON file exporting PluginActionManifest[] */
  actions?: string
  /** Settings/secrets this plugin requires. Shown during install; read from env vars at runtime. */
  settings?: PluginSetting[]
}

export interface DiscoveredPlugin {
  name: string
  root: string
  manifest: FulcrumPluginManifest
}

export interface PluginActionManifest {
  action_name: string
  title: string
  description: string
  mcp: ToolSchema
}

// ---------- Discovery ----------

/**
 * Scan two locations for Fulcrum plugins:
 *  1. The closest `node_modules` directory (walking up from `startDir`) — project-local plugins
 *  2. `globalDataDir()/plugins/` — globally installed plugins (e.g. via `fulcrum plugin install`)
 *
 * A package is a plugin if it declares a top-level `"fulcrum"` key with `"type": "plugin"`
 * in its `package.json`.
 *
 * Returns a deduplicated list of discovered plugins. Never throws — silently skips
 * packages that are malformed or unreadable.
 */
export function discoverPlugins(startDir: string = process.cwd()): DiscoveredPlugin[] {
  const plugins: DiscoveredPlugin[] = []
  const seenRoots = new Set<string>()

  function scanNodeModules(nmDir: string): void {
    let entries: string[]
    try { entries = readdirSync(nmDir) } catch { return }

    for (const entry of entries) {
      if (entry.startsWith('@')) {
        let scoped: string[]
        try { scoped = readdirSync(join(nmDir, entry)) } catch { continue }
        for (const sub of scoped) {
          const root = join(nmDir, entry, sub)
          if (seenRoots.has(root)) continue
          seenRoots.add(root)
          const pkg = tryLoadPlugin(root, `${entry}/${sub}`)
          if (pkg) plugins.push(pkg)
        }
      } else {
        const root = join(nmDir, entry)
        if (seenRoots.has(root)) continue
        seenRoots.add(root)
        const pkg = tryLoadPlugin(root, entry)
        if (pkg) plugins.push(pkg)
      }
    }
  }

  // 1. Project-local: closest node_modules walking up from startDir
  const nmDir = findNodeModules(startDir)
  if (nmDir) scanNodeModules(nmDir)

  // 2. Global: globalDataDir()/plugins/ — individually-installed plugin packages
  const globalPluginsDir = join(globalDataDir(), 'plugins')
  if (existsSync(globalPluginsDir)) scanNodeModules(globalPluginsDir)

  return plugins
}

function tryLoadPlugin(pkgRoot: string, name: string): DiscoveredPlugin | null {
  const pkgJsonPath = join(pkgRoot, 'package.json')
  if (!existsSync(pkgJsonPath)) return null
  try {
    const raw = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as Record<string, unknown>
    const fm = raw['fulcrum'] as FulcrumPluginManifest | undefined
    if (!fm || fm.type !== 'plugin') return null
    return { name, root: pkgRoot, manifest: fm }
  } catch {
    return null
  }
}

function findNodeModules(startDir: string): string | null {
  let current = resolve(startDir)
  for (let i = 0; i < 10; i++) {
    const candidate = join(current, 'node_modules')
    if (existsSync(candidate)) return candidate
    const parent = resolve(current, '..')
    if (parent === current) break
    current = parent
  }
  return null
}

// ---------- Registration ----------

export interface PluginRegistration {
  skills: Array<{ name: string; path: string }>
  agents: Array<{ name: string; path: string }>
  hookModules: string[]
  additionalActions: PluginActionManifest[]
  additionalTools: ToolSchema[]
}

/**
 * Walk discovered plugins and collect their skills, agents, and hook module paths.
 * Callers can then load the hook modules and merge skills/agents into the CLI context.
 */
export function registerPlugins(plugins: DiscoveredPlugin[]): PluginRegistration {
  const registration: PluginRegistration = { skills: [], agents: [], hookModules: [], additionalActions: [], additionalTools: [] }

  for (const plugin of plugins) {
    const { root, manifest } = plugin

    if (manifest.hooks) {
      const hookPath = resolve(root, manifest.hooks)
      if (existsSync(hookPath)) registration.hookModules.push(hookPath)
    }

    if (manifest.skills) {
      const skillsDir = resolve(root, manifest.skills)
      if (existsSync(skillsDir)) {
        let skillEntries: string[]
        try { skillEntries = readdirSync(skillsDir) } catch { skillEntries = [] }
        for (const entry of skillEntries) {
          const skillMd = join(skillsDir, entry, 'SKILL.md')
          if (existsSync(skillMd)) {
            registration.skills.push({ name: `${plugin.name}:${entry}`, path: skillMd })
          }
        }
      }
    }

    if (manifest.agents) {
      const agentsDir = resolve(root, manifest.agents)
      if (existsSync(agentsDir)) {
        let agentEntries: string[]
        try { agentEntries = readdirSync(agentsDir) } catch { agentEntries = [] }
        for (const entry of agentEntries) {
          if (entry.endsWith('.md')) {
            registration.agents.push({ name: `${plugin.name}:${entry.replace(/\.md$/, '')}`, path: join(agentsDir, entry) })
          }
        }
      }
    }

    if (manifest.actions) {
      const actionsPath = resolve(root, manifest.actions)
      try {
        const raw = readFileSync(actionsPath, 'utf8')
        const parsed = JSON.parse(raw) as PluginActionManifest[]
        for (const action of parsed) {
          registration.additionalActions.push(action)
          registration.additionalTools.push(action.mcp)
        }
      } catch (err) {
        process.stderr.write(`[fulcrum] Plugin ${plugin.name}: failed to load actions from ${manifest.actions}: ${(err as Error).message}\n`)
      }
    } else if ((manifest as { tools?: string }).tools) {
      process.stderr.write(
        `[fulcrum] Plugin ${plugin.name}: manifest.tools is no longer supported; register canonical actions via manifest.actions instead.\n`,
      )
    }
  }

  return registration
}
