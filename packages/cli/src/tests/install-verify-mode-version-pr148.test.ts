// packages/cli/src/tests/install-verify-mode-version-pr148.test.ts
//
// TDD tests for PR 14.8: verifyInstall() extended with installMode + pluginVersion.
//   - Rules-only agents (cursor, windsurf, copilot) → installMode: "manual"
//   - Codex → installMode: "marketplace"
//   - opencode → installMode from mode parameter; canonicalVersion from source package.json
//   - VerifyResult now carries installMode (string) and pluginVersion / canonicalVersion (string | null)

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
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulcrum-verify148-'))
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fulcrum-verify148-home-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.rmSync(fakeHome, { recursive: true, force: true })
})

// ── installMode field exists ──────────────────────────────────────────────────

describe('VerifyResult.installMode', () => {
  it('is present on cursor result', async () => {
    await installCursor({ dryRun: false, targetDir: tmpDir })
    const result = verifyInstall({ agent: 'cursor', targetDir: tmpDir })
    expect('installMode' in result).toBe(true)
    expect(typeof result.installMode).toBe('string')
  })

  it('is present on codex result', () => {
    const result = verifyInstall({ agent: 'codex', targetDir: tmpDir, homeDir: fakeHome })
    expect('installMode' in result).toBe(true)
    expect(typeof result.installMode).toBe('string')
  })
})

// ── rules-only agents → installMode: "manual" ────────────────────────────────

describe('installMode for rules-only agents', () => {
  it('cursor → "manual"', async () => {
    await installCursor({ dryRun: false, targetDir: tmpDir })
    const result = verifyInstall({ agent: 'cursor', targetDir: tmpDir })
    expect(result.installMode).toBe('manual')
  })

  it('windsurf → "manual"', async () => {
    await installWindsurf({ dryRun: false, targetDir: tmpDir })
    const result = verifyInstall({ agent: 'windsurf', targetDir: tmpDir })
    expect(result.installMode).toBe('manual')
  })

  it('copilot → "manual"', async () => {
    await installCopilot({ dryRun: false, targetDir: tmpDir })
    const result = verifyInstall({ agent: 'copilot', targetDir: tmpDir })
    expect(result.installMode).toBe('manual')
  })
})

// ── codex → installMode: "marketplace" ───────────────────────────────────────

describe('installMode for codex', () => {
  it('codex → "marketplace" (no CLI install command; TUI-only activation)', () => {
    const result = verifyInstall({ agent: 'codex', targetDir: tmpDir, homeDir: fakeHome })
    expect(result.installMode).toBe('marketplace')
  })
})

// ── opencode installMode ──────────────────────────────────────────────────────

describe('installMode for opencode', () => {
  it('opencode manual → "manual"', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir, mode: 'manual' })
    const result = verifyInstall({ agent: 'opencode', targetDir: tmpDir })
    expect(result.installMode).toBe('manual')
  })

  it('opencode without prior install → "unknown"', () => {
    const result = verifyInstall({ agent: 'opencode', targetDir: tmpDir })
    expect(result.installMode).toBe('unknown')
  })
})

// ── pluginVersion field ───────────────────────────────────────────────────────

describe('VerifyResult.pluginVersion', () => {
  it('is present (possibly null) on all agents', async () => {
    await installCursor({ dryRun: false, targetDir: tmpDir })
    const result = verifyInstall({ agent: 'cursor', targetDir: tmpDir })
    expect('pluginVersion' in result).toBe(true)
    // cursor has no versioned plugin manifest
    expect(result.pluginVersion).toBeNull()
  })

  it('codex pluginVersion is null when not installed', () => {
    const result = verifyInstall({ agent: 'codex', targetDir: tmpDir, homeDir: fakeHome })
    expect('pluginVersion' in result).toBe(true)
    expect(result.pluginVersion).toBeNull()
  })
})

// ── canonicalVersion field ────────────────────────────────────────────────────

describe('VerifyResult.canonicalVersion', () => {
  it('opencode canonicalVersion matches source package.json version', async () => {
    await installOpencode({ dryRun: false, targetDir: tmpDir, mode: 'manual' })
    const result = verifyInstall({ agent: 'opencode', targetDir: tmpDir })
    expect(result.canonicalVersion).toBeTruthy()
    // Source version is 0.0.1 as of authoring time — any semver string is valid
    expect(typeof result.canonicalVersion).toBe('string')
    expect(result.canonicalVersion).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('cursor canonicalVersion is null (no versioned plugin)', async () => {
    await installCursor({ dryRun: false, targetDir: tmpDir })
    const result = verifyInstall({ agent: 'cursor', targetDir: tmpDir })
    expect(result.canonicalVersion).toBeNull()
  })
})
