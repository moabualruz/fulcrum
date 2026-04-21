// packages/cli/src/tests/install-codex-pr14.test.ts
//
// TDD tests for PR 14.2 Codex plugin-packaging additions:
//   1. validateCodexPluginManifest() — schema check against core-plugins fields
//   2. installCodex() dry-run includes marketplace add step
//   3. Stray marketplace.json entry cleanup (old {"host":"codex"} format)
//   4. Post-install message string present in install output

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  installCodex,
  validateCodexPluginManifest,
} from '../../../../agent-integration/install.js'

let tmpDir: string
let fakeHome: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fulcrum-codex-pr14-'))
  fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'fulcrum-codex-home-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.rmSync(fakeHome, { recursive: true, force: true })
})

// ── validateCodexPluginManifest ───────────────────────────────────────────────

describe('validateCodexPluginManifest()', () => {
  it('passes for the canonical plugin.json', () => {
    const repoRoot = path.resolve(
      new URL(import.meta.url).pathname,
      '../../../../../'
    )
    const pluginJsonPath = path.join(
      repoRoot,
      'agent-integration/codex/plugin/.codex-plugin/plugin.json'
    )
    const result = validateCodexPluginManifest(pluginJsonPath)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('fails when name is missing', () => {
    const tmpJson = path.join(tmpDir, 'plugin.json')
    fs.writeFileSync(tmpJson, JSON.stringify({
      version: '0.1.0',
      description: 'test',
      interface: { displayName: 'Test', shortDescription: 'test' },
    }), 'utf8')
    const result = validateCodexPluginManifest(tmpJson)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('name'))).toBe(true)
  })

  it('fails when interface.displayName is missing', () => {
    const tmpJson = path.join(tmpDir, 'plugin.json')
    fs.writeFileSync(tmpJson, JSON.stringify({
      name: 'test', version: '0.1.0', description: 'test',
      interface: { shortDescription: 'test' },
    }), 'utf8')
    const result = validateCodexPluginManifest(tmpJson)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('displayName'))).toBe(true)
  })

  it('fails when file does not exist', () => {
    const result = validateCodexPluginManifest(path.join(tmpDir, 'nonexistent.json'))
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('fails when interface block is absent', () => {
    const tmpJson = path.join(tmpDir, 'plugin.json')
    fs.writeFileSync(tmpJson, JSON.stringify({
      name: 'test', version: '0.1.0', description: 'test',
    }), 'utf8')
    const result = validateCodexPluginManifest(tmpJson)
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('interface'))).toBe(true)
  })
})

// ── dry-run output ────────────────────────────────────────────────────────────

describe('installCodex() dry-run', () => {
  it('includes codex marketplace add step in dry-run output', async () => {
    const lines: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => lines.push(args.join(' '))
    try {
      await installCodex({ dryRun: true, targetDir: tmpDir, globalHome: fakeHome })
    } finally {
      console.log = orig
    }
    const output = lines.join('\n')
    expect(output).toContain('codex marketplace add moabualruz/fulcrum')
  })
})

// ── stray marketplace entry cleanup ──────────────────────────────────────────

describe('installCodex() stray marketplace.json cleanup', () => {
  it('removes stray {host:"codex"} entries with no name field when writing', async () => {
    const marketplaceDir = path.join(fakeHome, '.agents', 'plugins')
    fs.mkdirSync(marketplaceDir, { recursive: true })
    const marketplacePath = path.join(marketplaceDir, 'marketplace.json')
    // Seed a stray entry (old format: host-only, no name)
    fs.writeFileSync(marketplacePath, JSON.stringify({
      version: 1,
      plugins: [
        { host: 'codex', source: 'moabualruz/fulcrum', installedAt: '2026-01-01' },
      ],
    }), 'utf8')

    await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })

    const final = JSON.parse(fs.readFileSync(marketplacePath, 'utf8')) as {
      plugins: Array<{ name?: string; host?: string }>
    }
    // Stray entry (no name) should be gone; proper entry (name + host) should be present
    const stray = final.plugins.filter(p => !p.name)
    expect(stray).toHaveLength(0)
    const proper = final.plugins.filter(p => p.name === 'fulcrum' && p.host === 'codex')
    expect(proper).toHaveLength(1)
  })
})

// ── post-install message ──────────────────────────────────────────────────────

describe("installCodex() post-install message", () => {
  it("prints TUI guidance after install", async () => {
    const lines: string[] = []
    const orig = console.log
    console.log = (...args: unknown[]) => lines.push(args.join(' '))
    try {
      await installCodex({ dryRun: false, targetDir: tmpDir, globalHome: fakeHome })
    } finally {
      console.log = orig
    }
    const output = lines.join('\n')
    expect(output).toContain("/plugins")
    expect(output).toContain("codex")
  })
})
