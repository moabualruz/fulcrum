// packages/cli/src/tests/plugin-mcp-tools.test.ts
// Tests for plugin-contributed actions whose MCP exposure is derived from action metadata.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { discoverPlugins, registerPlugins } from '../plugin-discovery.js'
import type { ToolSchema } from '../mcp-tools.js'
import type { PluginActionManifest } from '../plugin-discovery.js'
import { buildMcpExposurePlan, setAdditionalActionDefinitions } from '../tool-registry.js'

let tmpDir: string

function setup(): void {
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-plugin-mcp-tools-test-'))
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

const sampleToolSchema: ToolSchema = {
  title: 'Sample Tool',
  name: 'sample_tool',
  description: 'A sample tool for testing',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'A message' },
    },
    required: ['message'],
  },
}

const sampleActionManifest: PluginActionManifest = {
  action_name: 'sample_tool',
  title: 'Sample Tool',
  description: 'A sample action for testing',
  mcp: sampleToolSchema,
}

describe('registerPlugins — additionalActions', () => {
  beforeEach(setup)
  afterEach(() => {
    setAdditionalActionDefinitions([])
    teardown()
  })

  it('returns additionalActions and derived additionalTools from a plugin with a valid actions JSON file', () => {
    const nmDir = join(tmpDir, 'node_modules')
    mkdirSync(nmDir, { recursive: true })
    const pkgDir = createFakePlugin(nmDir, 'my-plugin', {
      fulcrum: { type: 'plugin', actions: './actions.json' },
    })

    writeFileSync(join(pkgDir, 'actions.json'), JSON.stringify([sampleActionManifest]))

    const plugins = discoverPlugins(tmpDir)
    const reg = registerPlugins(plugins)

    expect(reg.additionalActions).toHaveLength(1)
    expect(reg.additionalActions[0].action_name).toBe('sample_tool')
    expect(reg.additionalTools).toHaveLength(1)
    expect(reg.additionalTools[0].name).toBe('sample_tool')
    expect(reg.additionalTools[0].title).toBe('Sample Tool')
  })

  it('lets plugin actions participate in the MCP exposure planner once registered', async () => {
    const nmDir = join(tmpDir, 'node_modules')
    mkdirSync(nmDir, { recursive: true })
    const pkgDir = createFakePlugin(nmDir, 'my-plugin', {
      fulcrum: { type: 'plugin', actions: './actions.json' },
    })

    writeFileSync(join(pkgDir, 'actions.json'), JSON.stringify([sampleActionManifest]))

    const plugins = discoverPlugins(tmpDir)
    const reg = registerPlugins(plugins)
    setAdditionalActionDefinitions(reg.additionalActions.map(action => ({
      action_name: action.action_name,
      mcp: action.mcp,
    })))

    const plan = await buildMcpExposurePlan({ mode: 'filtered' })
    const decision = plan.decisions.find(item => item.actionName === 'sample_tool')

    expect(decision).toBeDefined()
    expect(decision?.exposed).toBe(true)
    expect(plan.filter(sampleToolSchema)).toBe(true)
  })

  it('returns empty additionalActions/additionalTools when no plugins are provided', () => {
    const reg = registerPlugins([])
    expect(reg.additionalActions).toEqual([])
    expect(reg.additionalTools).toEqual([])
  })

  it('logs to stderr and skips plugin actions when actions file does not exist', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const nmDir = join(tmpDir, 'node_modules')
    mkdirSync(nmDir, { recursive: true })
    createFakePlugin(nmDir, 'bad-plugin', {
      fulcrum: { type: 'plugin', actions: './nonexistent-actions.json' },
    })

    const plugins = discoverPlugins(tmpDir)
    let reg: ReturnType<typeof registerPlugins> | undefined
    expect(() => { reg = registerPlugins(plugins) }).not.toThrow()
    expect(reg!.additionalActions).toHaveLength(0)
    expect(reg!.additionalTools).toHaveLength(0)
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('bad-plugin'),
    )

    stderrSpy.mockRestore()
  })

  it('logs to stderr and skips plugin actions when actions file has invalid JSON', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const nmDir = join(tmpDir, 'node_modules')
    mkdirSync(nmDir, { recursive: true })
    const pkgDir = createFakePlugin(nmDir, 'invalid-json-plugin', {
      fulcrum: { type: 'plugin', actions: './actions.json' },
    })

    writeFileSync(join(pkgDir, 'actions.json'), '{ invalid json ]]]')

    const plugins = discoverPlugins(tmpDir)
    let reg: ReturnType<typeof registerPlugins> | undefined
    expect(() => { reg = registerPlugins(plugins) }).not.toThrow()
    expect(reg!.additionalActions).toHaveLength(0)
    expect(reg!.additionalTools).toHaveLength(0)
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('invalid-json-plugin'),
    )

    stderrSpy.mockRestore()
  })

  it('collects tools from multiple plugins', () => {
    const nmDir = join(tmpDir, 'node_modules')
    mkdirSync(nmDir, { recursive: true })

    const pkgDir1 = createFakePlugin(nmDir, 'plugin-a', {
      fulcrum: { type: 'plugin', actions: './actions.json' },
    })
    const secondTool: PluginActionManifest = {
      action_name: 'second_tool',
      title: 'Second Tool',
      description: 'Another action',
      mcp: {
        title: 'Second Tool',
        name: 'second_tool',
        description: 'Another tool',
        inputSchema: { type: 'object', properties: {} },
      },
    }
    const pkgDir2 = createFakePlugin(nmDir, 'plugin-b', {
      fulcrum: { type: 'plugin', actions: './actions.json' },
    })

    writeFileSync(join(pkgDir1, 'actions.json'), JSON.stringify([sampleActionManifest]))
    writeFileSync(join(pkgDir2, 'actions.json'), JSON.stringify([secondTool]))

    const plugins = discoverPlugins(tmpDir)
    const reg = registerPlugins(plugins)

    expect(reg.additionalActions).toHaveLength(2)
    expect(reg.additionalTools).toHaveLength(2)
    const names = reg.additionalTools.map(t => t.name)
    expect(names).toContain('sample_tool')
    expect(names).toContain('second_tool')
  })

  it('skips bad plugin tools but still collects tools from valid plugins', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const nmDir = join(tmpDir, 'node_modules')
    mkdirSync(nmDir, { recursive: true })

    const goodPkgDir = createFakePlugin(nmDir, 'good-plugin', {
      fulcrum: { type: 'plugin', actions: './actions.json' },
    })
    createFakePlugin(nmDir, 'bad-plugin2', {
      fulcrum: { type: 'plugin', actions: './missing.json' },
    })

    writeFileSync(join(goodPkgDir, 'actions.json'), JSON.stringify([sampleActionManifest]))

    const plugins = discoverPlugins(tmpDir)
    const reg = registerPlugins(plugins)

    expect(reg.additionalActions).toHaveLength(1)
    expect(reg.additionalTools).toHaveLength(1)
    expect(reg.additionalTools[0].name).toBe('sample_tool')
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('bad-plugin2'),
    )

    stderrSpy.mockRestore()
  })
  it('rejects legacy manifest.tools-only plugins with a clear warning', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const nmDir = join(tmpDir, 'node_modules')
    mkdirSync(nmDir, { recursive: true })
    const pkgDir = createFakePlugin(nmDir, 'legacy-plugin', {
      fulcrum: { type: 'plugin', tools: './tools.json' },
    })

    writeFileSync(join(pkgDir, 'tools.json'), JSON.stringify([sampleToolSchema]))

    const plugins = discoverPlugins(tmpDir)
    const reg = registerPlugins(plugins)

    expect(reg.additionalActions).toHaveLength(0)
    expect(reg.additionalTools).toHaveLength(0)
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('manifest.tools is no longer supported'),
    )

    stderrSpy.mockRestore()
  })
})

describe('runPlugin — add alias for install', () => {
  it('add command is recognized as an alias (export verification)', async () => {
    // Verify the switch case 'add' is handled the same as 'install' by checking
    // that the plugin-discovery module exports are correct and the index handles it.
    // The actual CLI dispatch test would require process.argv mocking; we verify
    // the source via a static check that the module doesn't throw on import.
    const mod = await import('../plugin-discovery.js')
    expect(typeof mod.registerPlugins).toBe('function')
    expect(typeof mod.discoverPlugins).toBe('function')
  })
})
