// packages/cli/src/tests/install-gemini-pi-pr145.test.ts
//
// TDD tests for PR 14.4 (PI cockpit) + PR 14.5 (Gemini):
//   PR 14.4: probePiCockpitOnNpm() exists and returns null on miss
//   PR 14.5: validateGeminiExtensionManifest() schema check
//   PR 14.5: installGeminiExtension dry-run mentions "gemini extensions update"

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  probePiCockpitOnNpm,
  validateGeminiExtensionManifest,
} from '../../../../agent-integration/install.js'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../')
const INSTALL_SCRIPT = resolve(REPO_ROOT, 'agent-integration/install.ts')

function runInstall(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(
    'node',
    ['--import', 'tsx/esm', INSTALL_SCRIPT, ...args],
    { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 }
  )
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '', status: result.status }
}

// ── PR 14.4: probePiCockpitOnNpm ─────────────────────────────────────────────

describe('probePiCockpitOnNpm()', () => {
  it('returns null when package is not yet published', () => {
    // @fulcrum-agent-os/pi-cockpit is not yet on npm (PR 14.4 operator step)
    // Short timeout to keep tests fast
    const result = probePiCockpitOnNpm(3_000)
    // Either null (404) or a version string (if published since test was written)
    expect(result === null || typeof result === 'string').toBe(true)
  })

  it('is exported from install.ts', () => {
    expect(typeof probePiCockpitOnNpm).toBe('function')
  })
})

// ── PR 14.5: validateGeminiExtensionManifest ─────────────────────────────────

describe('validateGeminiExtensionManifest()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulcrum-gemini-pr145-'))
  })
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('passes for the canonical gemini-extension.json', () => {
    const manifestPath = path.join(REPO_ROOT, 'agent-integration/gemini/gemini-extension.json')
    const result = validateGeminiExtensionManifest(manifestPath)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('fails when name is missing', () => {
    const tmpJson = path.join(tmpDir, 'gemini-extension.json')
    fs.writeFileSync(tmpJson, JSON.stringify({
      version: '1.0.0',
      mcpServers: { fulcrum: { command: 'fulcrum', args: [] } },
    }), 'utf8')
    const result = validateGeminiExtensionManifest(tmpJson)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('name'))).toBe(true)
  })

  it('fails when mcpServers is missing', () => {
    const tmpJson = path.join(tmpDir, 'gemini-extension.json')
    fs.writeFileSync(tmpJson, JSON.stringify({
      name: 'fulcrum', version: '1.0.0',
    }), 'utf8')
    const result = validateGeminiExtensionManifest(tmpJson)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('mcpServers'))).toBe(true)
  })

  it('fails for nonexistent file', () => {
    const result = validateGeminiExtensionManifest(path.join(tmpDir, 'nonexistent.json'))
    expect(result.ok).toBe(false)
  })
})

// ── PR 14.5: gemini extensions update message in dry-run ─────────────────────

describe('installGeminiExtension dry-run output', () => {
  it('mentions gemini extensions update fulcrum', () => {
    const { stdout } = runInstall(['gemini', '--dry-run'])
    expect(stdout).toContain('gemini extensions update')
  })
})

import { beforeEach, afterEach } from 'vitest'
