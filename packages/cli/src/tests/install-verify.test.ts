// packages/cli/src/tests/install-verify.test.ts
//
// TDD tests for verifyInstall() — checks that each agent's sentinel files
// are present after a successful installX() call.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  installCursor,
  installWindsurf,
  installOpencode,
  installCopilot,
  verifyInstall,
  type VerifyResult,
} from '../../../../agent-integration/install.js'

let tmpDir: string
let fakeHome: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulcrum-verify-test-'))
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fulcrum-verify-home-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.rmSync(fakeHome, { recursive: true, force: true })
})

// ── cursor ────────────────────────────────────────────────────────────────────

describe('verifyInstall({ agent: "cursor" })', () => {
  it('returns ok:true after installCursor()', async () => {
    await installCursor({ dryRun: false, targetDir: tmpDir })

    const result: VerifyResult = verifyInstall({ agent: 'cursor', targetDir: tmpDir })

    expect(result.ok).toBe(true)
    expect(result.agent).toBe('cursor')
    expect(result.checks.every(c => c.present)).toBe(true)
  })

  it('returns ok:false when .cursor/ is empty', () => {
    // No install — directory does not even exist
    const result = verifyInstall({ agent: 'cursor', targetDir: tmpDir })

    expect(result.ok).toBe(false)
    expect(result.checks.some(c => !c.present)).toBe(true)
  })

  it('checks sentinel files: mcp.json, fulcrum-core.mdc, hooks.json', async () => {
    await installCursor({ dryRun: false, targetDir: tmpDir })

    const result = verifyInstall({ agent: 'cursor', targetDir: tmpDir })
    const paths = result.checks.map(c => c.path)

    expect(paths).toContain('.cursor/mcp.json')
    expect(paths).toContain('.cursor/rules/fulcrum-core.mdc')
    expect(paths).toContain('.cursor/hooks.json')
  })
})

// ── windsurf ──────────────────────────────────────────────────────────────────

describe('verifyInstall({ agent: "windsurf" })', () => {
  it('returns ok:true after installWindsurf()', async () => {
    await installWindsurf({ dryRun: false, targetDir: tmpDir })

    const result = verifyInstall({ agent: 'windsurf', targetDir: tmpDir })

    expect(result.ok).toBe(true)
  })

  it('returns ok:false when .windsurf/ is absent', () => {
    const result = verifyInstall({ agent: 'windsurf', targetDir: tmpDir })

    expect(result.ok).toBe(false)
  })

  it('checks sentinel files: mcp.json, fulcrum-core.md, hooks.json', async () => {
    await installWindsurf({ dryRun: false, targetDir: tmpDir })

    const result = verifyInstall({ agent: 'windsurf', targetDir: tmpDir })
    const paths = result.checks.map(c => c.path)

    expect(paths).toContain('.windsurf/mcp.json')
    expect(paths).toContain('.windsurf/rules/fulcrum-core.md')
    expect(paths).toContain('.windsurf/hooks.json')
  })
})

// ── opencode ──────────────────────────────────────────────────────────────────

describe('verifyInstall({ agent: "opencode" })', () => {
  it('returns ok:true after installOpencode() in local mode', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir, mode: 'manual' })

    const result = verifyInstall({ agent: 'opencode', targetDir: tmpDir })

    expect(result.ok).toBe(true)
  })

  it('returns ok:false when .opencode/ is absent', () => {
    const result = verifyInstall({ agent: 'opencode', targetDir: tmpDir })

    expect(result.ok).toBe(false)
  })

  it('checks sentinel files: opencode.jsonc, opencode.md', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir, mode: 'manual' })

    const result = verifyInstall({ agent: 'opencode', targetDir: tmpDir })
    const paths = result.checks.map(c => c.path)

    expect(paths).toContain('.opencode/opencode.jsonc')
    expect(paths).toContain('.opencode/opencode.md')
  })
})

// ── copilot ───────────────────────────────────────────────────────────────────

describe('verifyInstall({ agent: "copilot" })', () => {
  it('returns ok:true after installCopilot()', async () => {
    await installCopilot({ dryRun: false, targetDir: tmpDir })

    const result = verifyInstall({ agent: 'copilot', targetDir: tmpDir })

    expect(result.ok).toBe(true)
  })

  it('returns ok:false when .mcp.json is absent', () => {
    const result = verifyInstall({ agent: 'copilot', targetDir: tmpDir })

    expect(result.ok).toBe(false)
  })

  it('checks sentinel files: .mcp.json, copilot-instructions.md, fulcrum.json hook', async () => {
    await installCopilot({ dryRun: false, targetDir: tmpDir })

    const result = verifyInstall({ agent: 'copilot', targetDir: tmpDir })
    const paths = result.checks.map(c => c.path)

    expect(paths).toContain('.mcp.json')
    expect(paths).toContain('.github/copilot-instructions.md')
    expect(paths).toContain('.github/hooks/fulcrum.json')
  })
})

// ── codex ─────────────────────────────────────────────────────────────────────
// Codex is global (~/.codex/) + project-level AGENTS.md.
// Tests use fakeHome to avoid touching real ~/.codex.

describe('verifyInstall({ agent: "codex" })', () => {
  it('returns ok:false when ~/.codex/ does not exist', () => {
    const result = verifyInstall({ agent: 'codex', targetDir: tmpDir, homeDir: fakeHome })

    expect(result.ok).toBe(false)
  })

  it('returns ok:true after manually seeding minimal codex layout', () => {
    // Seed the minimal global layout that installCodex() would produce
    const codexDir = path.join(fakeHome, '.codex')
    fs.mkdirSync(path.join(codexDir, 'skills', 'fulcrum-start-every-task'), { recursive: true })
    fs.writeFileSync(path.join(codexDir, 'config.toml'), '[mcp_servers.fulcrum]\ncommand = "fulcrum"\n', 'utf8')
    fs.writeFileSync(path.join(codexDir, 'hooks.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ command: 'fulcrum hook codex session-start' }] }] } }), 'utf8')
    fs.writeFileSync(path.join(codexDir, 'skills', 'fulcrum-start-every-task', 'SKILL.md'), '# skill', 'utf8')
    fs.mkdirSync(path.join(codexDir, 'rules'), { recursive: true })
    fs.writeFileSync(path.join(codexDir, 'rules', 'fulcrum-core.md'), '# rules', 'utf8')
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# agents', 'utf8')

    const result = verifyInstall({ agent: 'codex', targetDir: tmpDir, homeDir: fakeHome })

    expect(result.ok).toBe(true)
  })
})

// ── unknown agent ─────────────────────────────────────────────────────────────

describe('verifyInstall({ agent: "unknown" })', () => {
  it('throws for unknown agent slug', () => {
    expect(() =>
      verifyInstall({ agent: 'unknown' as never, targetDir: tmpDir })
    ).toThrow(/unknown agent/)
  })
})
