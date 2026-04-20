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
import {
  installCursor,
  installWindsurf,
  installCodex,
  installOpencode,
  OpencodePluginUnresolvedError,
  OPENCODE_PLUGIN_PKG,
} from '../../../../agent-integration/install.js'

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

  it('creates .cursor/rules/fulcrum-core.mdc with alwaysApply frontmatter', async () => {
    await installCursor({ dryRun: false, targetDir: tmpDir })

    const mdcPath = path.join(tmpDir, '.cursor', 'rules', 'fulcrum-core.mdc')
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
    const mdcPath = path.join(tmpDir, '.cursor', 'rules', 'fulcrum-core.mdc')

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
    expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'fulcrum-core.mdc'))).toBe(false)

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

  // PR 6.4 — Codex skill fanout (6→33). Installer uses parseCanonicalSource +
  // emitCodex so ~/.codex/skills/ carries the full canonical skill set.
  it('fans out 33 canonical skills to ~/.codex/skills/fulcrum-<name>/SKILL.md', async () => {
    const fakeHome = tmpDir
    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })
    const skillsDir = path.join(fakeHome, '.codex', 'skills')
    expect(fs.existsSync(skillsDir)).toBe(true)
    const entries = fs.readdirSync(skillsDir).filter(n => n.startsWith('fulcrum-'))
    expect(entries.length).toBeGreaterThanOrEqual(33)
    // Spot-check a known canonical skill
    const spot = path.join(skillsDir, 'fulcrum-start-every-task', 'SKILL.md')
    expect(fs.existsSync(spot)).toBe(true)
    const content = fs.readFileSync(spot, 'utf8')
    expect(content).toMatch(/^---/)
    expect(content).toContain('name: fulcrum-start-every-task')
  })

  it('installs canonical rules into ~/.codex/rules/ so the UserPromptSubmit hook can find them', async () => {
    const fakeHome = tmpDir
    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })
    const rulesDir = path.join(fakeHome, '.codex', 'rules')
    expect(fs.existsSync(rulesDir)).toBe(true)
    const ruleFiles = fs.readdirSync(rulesDir).filter(n => n.endsWith('.md'))
    expect(ruleFiles.length).toBeGreaterThanOrEqual(3)
    // Rider hook reads with \n\n---\n\n join — individual rule files stay as raw .md
    const someRule = fs.readFileSync(path.join(rulesDir, ruleFiles[0]!), 'utf8')
    expect(someRule.length).toBeGreaterThan(10)
  })

  // PR 6.5 — openai.yaml sidecars accompany every SKILL.md.
  it('emits openai.yaml sidecar at skills/fulcrum-<name>/agents/openai.yaml for each skill', async () => {
    const fakeHome = tmpDir
    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })
    const sidecar = path.join(fakeHome, '.codex', 'skills', 'fulcrum-start-every-task', 'agents', 'openai.yaml')
    expect(fs.existsSync(sidecar)).toBe(true)
    const body = fs.readFileSync(sidecar, 'utf8')
    expect(body).toContain('interface:')
    expect(body).toContain('display_name: Start Every Task')
    expect(body).toContain('policy:')
    expect(body).toContain("brand_color: '#4F46E5'")
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

  it('fans out canonical skills to .opencode/agents/fulcrum-skill-<name>.md', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir })
    const agentsDir = path.join(tmpDir, '.opencode', 'agents')
    expect(fs.existsSync(agentsDir)).toBe(true)
    const files = fs.readdirSync(agentsDir).filter(f => f.startsWith('fulcrum-skill-') && f.endsWith('.md'))
    // canonical source has 33 skills (PR 1 observation — index.md is a catalog, not a skill)
    expect(files.length).toBeGreaterThanOrEqual(33)
    const sample = fs.readFileSync(path.join(agentsDir, files[0]!), 'utf8')
    // emitOpencode frontmatter contract: name, description, mode: subagent, hidden: true
    expect(sample).toContain('mode: subagent')
    expect(sample).toContain('hidden: true')
  })

  it('copies canonical rules verbatim to .opencode/rules/', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir })
    const rulesDir = path.join(tmpDir, '.opencode', 'rules')
    expect(fs.existsSync(rulesDir)).toBe(true)
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'))
    expect(files).toContain('fulcrum-first.md')
    expect(files).toContain('lifecycle.md')
    expect(files).toContain('role-boundaries.md')
  })

  it('writes .opencode/.ridersum matching the SHA-256 of sorted rule bodies', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir })
    const ridersumPath = path.join(tmpDir, '.opencode', '.ridersum')
    expect(fs.existsSync(ridersumPath)).toBe(true)
    const content = fs.readFileSync(ridersumPath, 'utf8').trim()
    expect(content).toMatch(/^[0-9a-f]{64}$/)

    // Recompute independently and assert exact match — this is the integrity
    // contract the plugin's loadRider verifies at runtime.
    const { createHash } = await import('node:crypto')
    const rulesDir = path.join(tmpDir, '.opencode', 'rules')
    const bodies = fs.readdirSync(rulesDir)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => a.localeCompare(b))
      .map(f => fs.readFileSync(path.join(rulesDir, f), 'utf8'))
    const expected = createHash('sha256').update(bodies.join('\n\n---\n\n')).digest('hex')
    expect(content).toBe(expected)
  })

  it('dry-run: skills/rules/.ridersum steps write nothing', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await installOpencode({ dryRun: true, targetDir: tmpDir })
    logSpy.mockRestore()
    expect(fs.existsSync(path.join(tmpDir, '.opencode', 'agents'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.opencode', 'rules'))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, '.opencode', '.ridersum'))).toBe(false)
  })

  it('writes 24 role MDs to .opencode/agents/<role>.md with opencode-flavored frontmatter', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir })
    const agentsDir = path.join(tmpDir, '.opencode', 'agents')
    expect(fs.existsSync(agentsDir)).toBe(true)

    // 24 canonical role MDs, filenames mirror agent-integration/claude/agents/.
    const roleFiles = fs.readdirSync(agentsDir)
      .filter(f => f.endsWith('.md') && !f.startsWith('fulcrum-skill-'))
    expect(roleFiles.length).toBeGreaterThanOrEqual(24)

    // chief_of_staff + orchestrator are L1/L2 orchestration → mode: primary.
    const cos = fs.readFileSync(path.join(agentsDir, 'chief_of_staff.md'), 'utf8')
    expect(cos).toContain('mode: primary')
    expect(cos).toMatch(/^---\n/)

    // Implementation roles land as mode: subagent, hidden: true.
    const se = fs.readFileSync(path.join(agentsDir, 'software_engineer.md'), 'utf8')
    expect(se).toContain('mode: subagent')
    expect(se).toContain('hidden: true')

    // Description is carried over from the canonical source.
    expect(se.toLowerCase()).toContain('implements features')
    // Body (responsibilities / purpose sections) survives the translation.
    expect(se).toMatch(/##\s+Purpose/i)
  })

  // ── PR 4 c6 — dual-mode plugin resolution ──────────────────────────────────
  it('mode=local writes opencode.jsonc with "plugin": ["./plugins/fulcrum.ts"]', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir, mode: 'local' })
    const config = fs.readFileSync(path.join(tmpDir, '.opencode', 'opencode.jsonc'), 'utf8')
    expect(config).toMatch(/"plugin"\s*:\s*\["\.\/plugins\/fulcrum\.ts"\]/)
    // Local mode also copies fulcrum.ts + rider.ts into .opencode/plugins/.
    expect(fs.existsSync(path.join(tmpDir, '.opencode', 'plugins', 'fulcrum.ts'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.opencode', 'plugins', 'rider.ts'))).toBe(true)
  })

  it('mode=npm throws OpencodePluginUnresolvedError when npm probe cannot resolve the package', async () => {
    // The scoped package does not exist on npm (PR 14.3 blocked on npm-org
    // registration — v3.3 approval checklist). mode=npm MUST fail loudly; no
    // silent fallback to local.
    await expect(installOpencode({ dryRun: false, targetDir: tmpDir, mode: 'npm' }))
      .rejects.toMatchObject({
        name: 'OpencodePluginUnresolvedError',
        code: 'opencode-plugin-unresolved',
      })
  })

  it('mode=auto (default) falls through to local when npm probe misses', async () => {
    // Same conditions as above — the npm probe will miss — but mode=auto
    // allows local fallback when the template file is present on disk.
    await installOpencode({ dryRun: false, targetDir: tmpDir /* default mode */ })
    const config = fs.readFileSync(path.join(tmpDir, '.opencode', 'opencode.jsonc'), 'utf8')
    expect(config).toMatch(/"plugin"\s*:\s*\["\.\/plugins\/fulcrum\.ts"\]/)
  })

  it('exports OPENCODE_PLUGIN_PKG as the canonical scoped name', () => {
    expect(OPENCODE_PLUGIN_PKG).toBe('@fulcrum-agent-os/opencode-plugin')
  })

  it('OpencodePluginUnresolvedError carries code="opencode-plugin-unresolved"', () => {
    const err = new OpencodePluginUnresolvedError('test reason')
    expect(err.code).toBe('opencode-plugin-unresolved')
    expect(err.message).toContain('opencode-plugin-unresolved')
    expect(err.message).toContain('test reason')
  })
})
