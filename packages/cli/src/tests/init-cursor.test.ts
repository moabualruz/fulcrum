// packages/cli/src/tests/init-cursor.test.ts
//
// Tests for `fulcrum init --cursor` and `fulcrum init --windsurf`.
// Exercises installCursor() and installWindsurf() directly against a temp
// directory so we don't touch any real user config.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// We import the functions directly (not via CLI spawn) so tests are fast.
// install.ts exports installCursor / installWindsurf and guards main() with
// an entry check, so the import side-effect is safe.
import { installCursor, installWindsurf, installCodex, installOpencode } from '../../../../agent-integration/install.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulcrum-init-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ── Cursor happy path ─────────────────────────────────────────────────────────

describe('installCursor()', () => {
  it('creates .cursor/mcp.json with correct content', async () => {
    await installCursor({ dryRun: false, targetDir: tmpDir })

    const mcpPath = path.join(tmpDir, '.cursor', 'mcp.json')
    expect(fs.existsSync(mcpPath)).toBe(true)

    const parsed = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
    const servers = parsed['mcpServers'] as Record<string, unknown>
    expect(servers).toBeDefined()
    expect(servers['fulcrum']).toMatchObject({
      command: 'fulcrum',
      args: ['serve', 'mcp', '--mode', 'filtered'],
    })
  })

  it('creates .cursor/rules/fulcrum.mdc with alwaysApply frontmatter', async () => {
    await installCursor({ dryRun: false, targetDir: tmpDir })

    const mdcPath = path.join(tmpDir, '.cursor', 'rules', 'fulcrum.mdc')
    expect(fs.existsSync(mdcPath)).toBe(true)

    const content = fs.readFileSync(mdcPath, 'utf8')
    expect(content).toContain('alwaysApply: true')
    expect(content).toContain('Fulcrum Agent OS')
    expect(content).toContain('get_current_context')
  })

  it('auto-creates .cursor/ directory when it does not exist', async () => {
    // tmpDir is fresh — .cursor/ does not exist
    expect(fs.existsSync(path.join(tmpDir, '.cursor'))).toBe(false)

    await installCursor({ dryRun: false, targetDir: tmpDir })

    expect(fs.existsSync(path.join(tmpDir, '.cursor'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules'))).toBe(true)
  })

  it('skips files that already exist (idempotent)', async () => {
    // First run
    await installCursor({ dryRun: false, targetDir: tmpDir })

    const mcpPath = path.join(tmpDir, '.cursor', 'mcp.json')
    const mdcPath = path.join(tmpDir, '.cursor', 'rules', 'fulcrum.mdc')

    // Overwrite with sentinel content
    fs.writeFileSync(mcpPath, '{"sentinel": true}', 'utf8')
    fs.writeFileSync(mdcPath, 'SENTINEL', 'utf8')

    // Second run — must not overwrite
    await installCursor({ dryRun: false, targetDir: tmpDir })

    expect(fs.readFileSync(mcpPath, 'utf8')).toBe('{"sentinel": true}')
    expect(fs.readFileSync(mdcPath, 'utf8')).toBe('SENTINEL')
  })

  it('dry-run: prints actions but writes no files', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await installCursor({ dryRun: true, targetDir: tmpDir })

    // No files written
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'mcp.json'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'fulcrum.mdc'))).toBe(false)

    // Dry-run messages printed via console.log
    const allOutput = logSpy.mock.calls.map(c => c.join(' ')).join('\n')
    logSpy.mockRestore()
    expect(allOutput).toContain('dry-run')
  })
})

// ── Windsurf happy path ───────────────────────────────────────────────────────

describe('installWindsurf()', () => {
  it('creates .windsurf/mcp.json with correct content', async () => {
    await installWindsurf({ dryRun: false, targetDir: tmpDir })

    const mcpPath = path.join(tmpDir, '.windsurf', 'mcp.json')
    expect(fs.existsSync(mcpPath)).toBe(true)

    const parsed = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
    const servers = parsed['mcpServers'] as Record<string, unknown>
    expect(servers).toBeDefined()
    expect(servers['fulcrum']).toMatchObject({
      command: 'fulcrum',
      args: ['serve', 'mcp', '--mode', 'filtered'],
    })
  })

  it('creates .windsurf/rules/fulcrum.mdc with alwaysApply frontmatter', async () => {
    await installWindsurf({ dryRun: false, targetDir: tmpDir })

    const mdcPath = path.join(tmpDir, '.windsurf', 'rules', 'fulcrum.mdc')
    expect(fs.existsSync(mdcPath)).toBe(true)

    const content = fs.readFileSync(mdcPath, 'utf8')
    expect(content).toContain('alwaysApply: true')
    expect(content).toContain('Fulcrum Agent OS')
    expect(content).toContain('Hook-based features')
  })

  it('auto-creates .windsurf/ directory when it does not exist', async () => {
    expect(fs.existsSync(path.join(tmpDir, '.windsurf'))).toBe(false)

    await installWindsurf({ dryRun: false, targetDir: tmpDir })

    expect(fs.existsSync(path.join(tmpDir, '.windsurf'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.windsurf', 'rules'))).toBe(true)
  })

  it('skips files that already exist (idempotent)', async () => {
    await installWindsurf({ dryRun: false, targetDir: tmpDir })

    const mcpPath = path.join(tmpDir, '.windsurf', 'mcp.json')
    const mdcPath = path.join(tmpDir, '.windsurf', 'rules', 'fulcrum.mdc')

    fs.writeFileSync(mcpPath, '{"sentinel": true}', 'utf8')
    fs.writeFileSync(mdcPath, 'SENTINEL', 'utf8')

    await installWindsurf({ dryRun: false, targetDir: tmpDir })

    expect(fs.readFileSync(mcpPath, 'utf8')).toBe('{"sentinel": true}')
    expect(fs.readFileSync(mdcPath, 'utf8')).toBe('SENTINEL')
  })

  it('dry-run: prints actions but writes no files', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await installWindsurf({ dryRun: true, targetDir: tmpDir })

    expect(fs.existsSync(path.join(tmpDir, '.windsurf', 'mcp.json'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.windsurf', 'rules', 'fulcrum.mdc'))).toBe(false)

    const allOutput = logSpy.mock.calls.map(c => c.join(' ')).join('\n')
    logSpy.mockRestore()
    expect(allOutput).toContain('dry-run')
  })
})

describe('installCodex()', () => {
  it('merges [mcp_servers.fulcrum] into ~/.codex/config.toml', async () => {
    const fakeHome = tmpDir
    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })

    const tomlPath = path.join(fakeHome, '.codex', 'config.toml')
    expect(fs.existsSync(tomlPath)).toBe(true)

    const content = fs.readFileSync(tomlPath, 'utf8')
    expect(content).toContain('[mcp_servers.fulcrum]')
    expect(content).toContain('command = "fulcrum"')
    expect(content).toContain('args = ["serve", "mcp", "--mode", "filtered"]')
  })

  it('writes AGENTS.md to targetDir', async () => {
    const fakeHome = tmpDir
    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })

    const agentsPath = path.join(tmpDir, 'AGENTS.md')
    expect(fs.existsSync(agentsPath)).toBe(true)

    const content = fs.readFileSync(agentsPath, 'utf8')
    expect(content).toContain('Fulcrum Agent OS')
    expect(content).toContain('config.toml')
  })

  it('skips AGENTS.md if it already exists (idempotent)', async () => {
    const fakeHome = tmpDir
    const agentsPath = path.join(tmpDir, 'AGENTS.md')
    fs.writeFileSync(agentsPath, 'SENTINEL', 'utf8')

    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })

    expect(fs.readFileSync(agentsPath, 'utf8')).toBe('SENTINEL')
  })

  it('skips toml merge if already present (idempotent)', async () => {
    const fakeHome = tmpDir
    const codexDir = path.join(fakeHome, '.codex')
    fs.mkdirSync(codexDir, { recursive: true })
    fs.writeFileSync(path.join(codexDir, 'config.toml'), '[mcp_servers.fulcrum]\ncommand = "fulcrum"\n', 'utf8')

    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })

    // Content unchanged (only one occurrence of the marker)
    const content = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8')
    expect(content.split('[mcp_servers.fulcrum]').length - 1).toBe(1)
  })

  it('dry-run: prints actions but writes no files', async () => {
    const fakeHome = tmpDir
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await installCodex({ dryRun: true, targetDir: tmpDir, globalHome: fakeHome })

    expect(fs.existsSync(path.join(fakeHome, '.codex', 'config.toml'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false)

    const allOutput = logSpy.mock.calls.map(c => c.join(' ')).join('\n')
    logSpy.mockRestore()
    expect(allOutput).toContain('dry-run')
  })

  it('registers fulcrum plugin in ~/.agents/plugins/marketplace.json', async () => {
    const fakeHome = tmpDir
    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })

    const marketplacePath = path.join(fakeHome, '.agents', 'plugins', 'marketplace.json')
    expect(fs.existsSync(marketplacePath)).toBe(true)

    const parsed = JSON.parse(fs.readFileSync(marketplacePath, 'utf8')) as Record<string, unknown>
    const plugins = parsed['plugins'] as Array<Record<string, unknown>>
    expect(plugins.some(p => p['name'] === 'fulcrum')).toBe(true)
  })

  it('does not duplicate plugin entry on second run', async () => {
    const fakeHome = tmpDir
    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })
    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })

    const marketplacePath = path.join(fakeHome, '.agents', 'plugins', 'marketplace.json')
    const parsed = JSON.parse(fs.readFileSync(marketplacePath, 'utf8')) as Record<string, unknown>
    const plugins = parsed['plugins'] as Array<Record<string, unknown>>
    const fulcrumEntries = plugins.filter(p => p['name'] === 'fulcrum')
    expect(fulcrumEntries).toHaveLength(1)
  })
})

describe('installOpencode()', () => {
  it('creates .opencode/opencode.jsonc with correct MCP config', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir })

    const configPath = path.join(tmpDir, '.opencode', 'opencode.jsonc')
    expect(fs.existsSync(configPath)).toBe(true)

    const content = fs.readFileSync(configPath, 'utf8')
    expect(content).toContain('"type": "local"')
    expect(content).toContain('"fulcrum"')
    expect(content).toContain('"serve", "mcp"')
  })

  it('creates .opencode/opencode.md context doc', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir })

    const docPath = path.join(tmpDir, '.opencode', 'opencode.md')
    expect(fs.existsSync(docPath)).toBe(true)

    const content = fs.readFileSync(docPath, 'utf8')
    expect(content).toContain('Fulcrum Agent OS')
    expect(content).toContain('opencode')
  })

  it('creates .opencode/command/ slash commands', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir })

    const cmdDir = path.join(tmpDir, '.opencode', 'command')
    expect(fs.existsSync(cmdDir)).toBe(true)

    const files = fs.readdirSync(cmdDir)
    expect(files.some(f => f.startsWith('fulcrum-') && f.endsWith('.md'))).toBe(true)
  })

  it('skips files that already exist (idempotent)', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir })

    const configPath = path.join(tmpDir, '.opencode', 'opencode.jsonc')
    fs.writeFileSync(configPath, '{"sentinel": true}', 'utf8')

    await installOpencode({ dryRun: false, targetDir: tmpDir })

    expect(fs.readFileSync(configPath, 'utf8')).toBe('{"sentinel": true}')
  })

  it('dry-run: prints actions but writes no files', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await installOpencode({ dryRun: true, targetDir: tmpDir })

    expect(fs.existsSync(path.join(tmpDir, '.opencode', 'opencode.jsonc'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.opencode', 'opencode.md'))).toBe(false)

    const allOutput = logSpy.mock.calls.map(c => c.join(' ')).join('\n')
    logSpy.mockRestore()
    expect(allOutput).toContain('dry-run')
  })
})
