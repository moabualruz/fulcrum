// packages/fulcrum-mcp/src/tests/index.test.ts
//
// Unit tests for the fulcrum-mcp thin wrapper.
// Verifies the argv injection and delegation pattern without spawning
// a full MCP server (embedding model not required).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../')

describe('fulcrum-mcp package', () => {
  it('package.json has correct bin entry', async () => {
    const { readFileSync } = await import('fs')
    const pkgPath = resolve(REPO_ROOT, 'packages/fulcrum-mcp/package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    const bin = pkg['bin'] as Record<string, string> | undefined
    expect(bin).toBeDefined()
    expect(bin?.['fulcrum-mcp']).toBeDefined()
    expect(bin?.['fulcrum-mcp']).toMatch(/index\.[jt]s$/)
  })

  it('package.json name is fulcrum-mcp', async () => {
    const { readFileSync } = await import('fs')
    const pkgPath = resolve(REPO_ROOT, 'packages/fulcrum-mcp/package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    expect(pkg['name']).toBe('fulcrum-mcp')
  })

  it('package.json depends on fulcrum-agent-cli', async () => {
    const { readFileSync } = await import('fs')
    const pkgPath = resolve(REPO_ROOT, 'packages/fulcrum-mcp/package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    const deps = pkg['dependencies'] as Record<string, string> | undefined
    expect(deps?.['fulcrum-agent-cli']).toBeDefined()
  })

  it('package.json has engines.node >= 20', async () => {
    const { readFileSync } = await import('fs')
    const pkgPath = resolve(REPO_ROOT, 'packages/fulcrum-mcp/package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    const engines = pkg['engines'] as Record<string, string> | undefined
    expect(engines?.['node']).toContain('20')
  })

  it('fulcrum-memory package has kuzu as optionalDependency', async () => {
    const { readFileSync } = await import('fs')
    const pkgPath = resolve(REPO_ROOT, 'packages/memory/package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
    // kuzu should NOT be in regular dependencies
    const deps = pkg['dependencies'] as Record<string, unknown> | undefined
    expect(deps?.['kuzu']).toBeUndefined()
    // kuzu should be in optionalDependencies
    const optDeps = pkg['optionalDependencies'] as Record<string, unknown> | undefined
    expect(optDeps?.['kuzu']).toBeDefined()
  })
})

describe('argv injection', () => {
  let savedArgv: string[]

  beforeEach(() => {
    savedArgv = process.argv.slice()
    vi.resetModules()
  })

  afterEach(() => {
    process.argv = savedArgv
  })

  it('injects serve mcp at index 2', async () => {
    process.argv = ['node', '/path/to/fulcrum-mcp/index.ts']
    vi.doMock('fulcrum-agent-cli', () => ({ main: async () => {} }))
    await import('../index.js')
    expect(process.argv[2]).toBe('serve')
    expect(process.argv[3]).toBe('mcp')
  })

  it('preserves existing args after the injection point', async () => {
    process.argv = ['node', '/path/to/fulcrum-mcp/index.ts', '--no-monitor']
    vi.doMock('fulcrum-agent-cli', () => ({ main: async () => {} }))
    await import('../index.js')
    expect(process.argv[2]).toBe('serve')
    expect(process.argv[3]).toBe('mcp')
    expect(process.argv[4]).toBe('--no-monitor')
  })
})
