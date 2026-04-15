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
import { installCursor, installWindsurf } from '../../../../agent-integration/install.js'

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
      args: ['serve', 'mcp'],
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
      args: ['serve', 'mcp'],
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
