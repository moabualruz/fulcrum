// packages/cli/src/tests/install-checkpoint.test.ts
//
// Smoke tests for Unit 4: install-to-value checkpoint.
// Tests run install.ts in dry-run mode and inspect stdout to confirm
// the doctor gate and seed data steps are wired correctly.
// Full end-to-end validation requires `fulcrum` in PATH so these are
// kept as fast dry-run checks only.

import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../../../')
const INSTALL_SCRIPT = resolve(REPO_ROOT, 'agent-integration/install.ts')

function runInstall(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(
    'node',
    ['--import', 'tsx/esm', INSTALL_SCRIPT, ...args],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }
  )
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  }
}

describe('install.ts doctor gate (dry-run)', () => {
  it('shows doctor gate step in dry-run output', () => {
    const { stdout } = runInstall(['claude', '--dry-run'])
    expect(stdout).toContain('Doctor gate')
    expect(stdout).toContain('dry-run')
  })

  it('bypasses doctor gate when --no-doctor-gate flag is set', () => {
    const { stdout } = runInstall(['claude', '--dry-run', '--no-doctor-gate'])
    // With bypass flag, doctor gate step should appear but be skipped/bypassed
    expect(stdout).toContain('Doctor gate')
    // Should not run fulcrum doctor in dry-run regardless
    expect(stdout).not.toContain('would run: fulcrum doctor --json')
    // Instead shows bypass message
    expect(stdout).toContain('bypassed')
  })

  it('shows seed task and memory step in dry-run output', () => {
    const { stdout } = runInstall(['claude', '--dry-run'])
    expect(stdout).toContain('Seed task and memory')
    expect(stdout).toContain("seed task: 'Fulcrum setup verified'")
    expect(stdout).toContain('seed memory entry via MCP write_memory')
  })
})

describe('install.ts doctor gate bypass via env var (dry-run)', () => {
  it('bypasses when FULCRUM_SETUP_NO_GATE=1 env var is set', () => {
    const result = spawnSync(
      'node',
      ['--import', 'tsx/esm', INSTALL_SCRIPT, 'claude', '--dry-run'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
        env: { ...process.env, FULCRUM_SETUP_NO_GATE: '1' },
      }
    )
    const stdout = result.stdout ?? ''
    expect(stdout).toContain('Doctor gate')
    expect(stdout).toContain('bypassed')
  })
})
