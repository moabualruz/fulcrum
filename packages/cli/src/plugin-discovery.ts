// packages/cli/src/plugin-discovery.ts
// Scan node_modules for packages that declare a "fulcrum" key in their
// package.json manifest, then register their hooks, skills, and agents.

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'

// ---------- Types ----------

export interface FulcrumPluginManifest {
  type: 'plugin'
  /** Path (relative to package root) to a CommonJS/ESM module exporting hook handlers */
  hooks?: string
  /** Directory (relative to package root) containing SKILL.md files */
  skills?: string
  /** Directory (relative to package root) containing agent MD files */
  agents?: string
}

export interface DiscoveredPlugin {
  name: string
  root: string
  manifest: FulcrumPluginManifest
}

// ---------- Discovery ----------

/**
 * Scan the closest `node_modules` directory (walking up from `startDir`)
 * for packages that declare a top-level `"fulcrum"` key in their `package.json`.
 *
 * Returns a list of discovered plugins. Never throws — silently skips packages
 * that are malformed or unreadable.
 */
export function discoverPlugins(startDir: string = process.cwd()): DiscoveredPlugin[] {
  const nmDir = findNodeModules(startDir)
  if (!nmDir) return []

  const plugins: DiscoveredPlugin[] = []

  let entries: string[]
  try {
    entries = readdirSync(nmDir)
  } catch {
    return []
  }

  for (const entry of entries) {
    // Handle scoped packages (@org/pkg)
    if (entry.startsWith('@')) {
      let scoped: string[]
      try { scoped = readdirSync(join(nmDir, entry)) } catch { continue }
      for (const sub of scoped) {
        const pkg = tryLoadPlugin(join(nmDir, entry, sub), `${entry}/${sub}`)
        if (pkg) plugins.push(pkg)
      }
    } else {
      const pkg = tryLoadPlugin(join(nmDir, entry), entry)
      if (pkg) plugins.push(pkg)
    }
  }

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
}

/**
 * Walk discovered plugins and collect their skills, agents, and hook module paths.
 * Callers can then load the hook modules and merge skills/agents into the CLI context.
 */
export function registerPlugins(plugins: DiscoveredPlugin[]): PluginRegistration {
  const registration: PluginRegistration = { skills: [], agents: [], hookModules: [] }

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
  }

  return registration
}
