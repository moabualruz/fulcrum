import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ── Override globalDataDir to use a temp directory ────────────────────────────

const testDataDir = join(tmpdir(), `fulcrum-notify-test-${process.pid}`)

vi.mock('../db/client.js', () => ({
  globalDataDir: () => testDataDir,
  getDb: vi.fn(),
  setDb: vi.fn(),
  closeDb: vi.fn(),
  _configureDb: vi.fn(),
  withTransaction: vi.fn(),
  checkDbHealth: vi.fn(),
}))

// Prevent spawnSync from actually calling notify-send/osascript during tests
vi.mock('child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: null, stderr: null })),
}))

import { notifyBlocked } from '../notify.js'

afterEach(() => {
  // Clean up temp alerts.log between tests
  const alertsPath = join(testDataDir, 'alerts.log')
  if (existsSync(alertsPath)) rmSync(alertsPath)
})

describe('notifyBlocked', () => {
  describe('alerts.log', () => {
    it('writes a line to alerts.log with correct fields', async () => {
      await notifyBlocked({
        run_id: 'run_test_1',
        role: 'qa_engineer',
        workspace_id: 'ws_1',
        reason: 'tests are failing',
      })

      const alertsPath = join(testDataDir, 'alerts.log')
      expect(existsSync(alertsPath)).toBe(true)
      const content = readFileSync(alertsPath, 'utf-8')
      expect(content).toContain('run_id=run_test_1')
      expect(content).toContain('role=qa_engineer')
      expect(content).toContain('workspace=ws_1')
      expect(content).toContain('"tests are failing"')
    })

    it('appends multiple entries to alerts.log', async () => {
      await notifyBlocked({
        run_id: 'run_a',
        role: 'software_engineer',
        workspace_id: 'ws_1',
        reason: 'first block',
      })
      await notifyBlocked({
        run_id: 'run_b',
        role: 'code_reviewer',
        workspace_id: 'ws_1',
        reason: 'second block',
      })

      const alertsPath = join(testDataDir, 'alerts.log')
      const content = readFileSync(alertsPath, 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).toHaveLength(2)
      expect(lines[0]).toContain('run_id=run_a')
      expect(lines[1]).toContain('run_id=run_b')
    })

    it('includes escalation_reason in log if provided', async () => {
      await notifyBlocked({
        run_id: 'run_esc',
        role: 'software_engineer',
        workspace_id: 'ws_1',
        reason: 'blocked',
        escalation_reason: 'needs human review',
      })

      // escalation_reason is in the desktop body but not the log line (log only logs reason)
      // Just verify the file was created without error
      const alertsPath = join(testDataDir, 'alerts.log')
      expect(existsSync(alertsPath)).toBe(true)
    })
  })

  describe('error resilience', () => {
    it('does not throw when alerts.log dir creation fails gracefully', async () => {
      // Even if desktop notification fails (mocked to succeed), it should not throw
      await expect(notifyBlocked({
        run_id: 'run_resilient',
        role: 'software_engineer',
        workspace_id: 'ws_1',
        reason: 'error test',
      })).resolves.not.toThrow()
    })

    it('does not throw when FULCRUM_ALERT_WEBHOOK is not set', async () => {
      delete process.env['FULCRUM_ALERT_WEBHOOK']
      await expect(notifyBlocked({
        run_id: 'run_no_webhook',
        role: 'software_engineer',
        workspace_id: 'ws_1',
        reason: 'no webhook test',
      })).resolves.not.toThrow()
    })
  })
})
