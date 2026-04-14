// packages/cli/src/tests/plugin-discovery.test.ts
// Tests for plugin discovery via "fulcrum" manifest key in package.json.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { discoverPlugins, registerPlugins } from '../plugin-discovery.js'

let tmpDir: string

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-plugin-test-'))
}

function teardown(): void {
  try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
}

function createFakePlugin(
  nmDir: string,
  pkgName: string,
  manifest: Record<string, unknown>,
): string {
  const pkgDir = join(nmDir, pkgName)
  mkdirSync(pkgDir, { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
    name: pkgName,
    version: '0.0.1',
    ...manifest,
  }))
  return pkgDir
}

describe('discoverPlugins', () => {
  beforeEach(setup)
  afterEach(teardown)

  it('returns empty array when no node_modules exists', () => {
    const plugins = discoverPlugins(join(tmpDir, 'nonexistent-project'))
    expect(plugins).toEqual([])
  })

  it('discovers a package with fulcrum.type = "plugin"', () => {
    const nmDir = join(tmpDir, 'node_modules')
    mkdirSync(nmDir)
    createFakePlugin(nmDir, 'my-fulcrum-plugin', {
      fulcrum: { type: 'plugin', skills: './skills/', agents: './agents/' },
    })

    const plugins = discoverPlugins(tmpDir)
    expect(plugins).toHaveLength(1)
    expect(plugins[0].name).toBe('my-fulcrum-plugin')
    expect(plugins[0].manifest.type).toBe('plugin')
    expect(plugins[0].manifest.skills).toBe('./skills/')
  })

  it('ignores packages without fulcrum key', () => {
    const nmDir = join(tmpDir, 'node_modules')
    mkdirSync(nmDir)
    createFakePlugin(nmDir, 'regular-package', { description: 'just a normal package' })
    createFakePlugin(nmDir, 'fulcrum-plugin', { fulcrum: { type: 'plugin' } })

    const plugins = discoverPlugins(tmpDir)
    expect(plugins).toHaveLength(1)
    expect(plugins[0].name).toBe('fulcrum-plugin')
  })

  it('ignores packages with fulcrum key but wrong type', () => {
    const nmDir = join(tmpDir, 'node_modules')
    mkdirSync(nmDir)
    createFakePlugin(nmDir, 'not-a-plugin', { fulcrum: { type: 'extension' } })

    const plugins = discoverPlugins(tmpDir)
    expect(plugins).toHaveLength(0)
  })

  it('discovers scoped packages (@org/pkg)', () => {
    const nmDir = join(tmpDir, 'node_modules')
    const scopeDir = join(nmDir, '@fulcrum-plugins')
    mkdirSync(scopeDir, { recursive: true })
    createFakePlugin(scopeDir, 'my-plugin', { fulcrum: { type: 'plugin' } })

    const plugins = discoverPlugins(tmpDir)
    expect(plugins).toHaveLength(1)
    expect(plugins[0].name).toBe('@fulcrum-plugins/my-plugin')
  })

  it('tolerates malformed package.json', () => {
    const nmDir = join(tmpDir, 'node_modules')
    const pkgDir = join(nmDir, 'malformed')
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), '{ invalid json ]]]')

    const plugins = discoverPlugins(tmpDir)
    expect(plugins).toHaveLength(0)
  })
})

describe('registerPlugins', () => {
  beforeEach(setup)
  afterEach(teardown)

  it('collects skills from plugin skill directories', () => {
    const nmDir = join(tmpDir, 'node_modules')
    const pkgDir = createFakePlugin(nmDir, 'my-plugin', { fulcrum: { type: 'plugin', skills: './skills/' } })

    // Create a skill
    const skillDir = join(pkgDir, 'skills', 'my-skill')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, 'SKILL.md'), '# My Skill\n')

    const plugins = discoverPlugins(tmpDir)
    const reg = registerPlugins(plugins)

    expect(reg.skills).toHaveLength(1)
    expect(reg.skills[0].name).toBe('my-plugin:my-skill')
  })

  it('collects agents from plugin agent directories', () => {
    const nmDir = join(tmpDir, 'node_modules')
    const pkgDir = createFakePlugin(nmDir, 'my-plugin', { fulcrum: { type: 'plugin', agents: './agents/' } })

    const agentsDir = join(pkgDir, 'agents')
    mkdirSync(agentsDir, { recursive: true })
    writeFileSync(join(agentsDir, 'my-agent.md'), '# My Agent\n')

    const plugins = discoverPlugins(tmpDir)
    const reg = registerPlugins(plugins)

    expect(reg.agents).toHaveLength(1)
    expect(reg.agents[0].name).toBe('my-plugin:my-agent')
  })

  it('collects hook module paths when hooks file exists', () => {
    const nmDir = join(tmpDir, 'node_modules')
    const pkgDir = createFakePlugin(nmDir, 'my-plugin', { fulcrum: { type: 'plugin', hooks: './dist/hooks.js' } })

    mkdirSync(join(pkgDir, 'dist'), { recursive: true })
    writeFileSync(join(pkgDir, 'dist', 'hooks.js'), 'module.exports = {}')

    const plugins = discoverPlugins(tmpDir)
    const reg = registerPlugins(plugins)

    expect(reg.hookModules).toHaveLength(1)
    expect(reg.hookModules[0]).toContain('hooks.js')
  })

  it('returns empty registration for empty plugin list', () => {
    const reg = registerPlugins([])
    expect(reg.skills).toHaveLength(0)
    expect(reg.agents).toHaveLength(0)
    expect(reg.hookModules).toHaveLength(0)
  })
})
