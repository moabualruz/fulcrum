import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installSweepCron } from '../commands/sweep-cron-install.js'

describe('installSweepCron', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'fulcrum-sweep-install-'))
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('writes a launchd plist on darwin', () => {
    const r = installSweepCron({ home, platform: 'darwin' })
    expect(r.platform).toBe('darwin')
    const plistPath = join(home, 'Library', 'LaunchAgents', 'dev.fulcrum.sweep.plist')
    expect(r.files).toContain(plistPath)
    expect(existsSync(plistPath)).toBe(true)
    const body = readFileSync(plistPath, 'utf8')
    expect(body).toContain('<key>Label</key>')
    expect(body).toContain('<string>dev.fulcrum.sweep</string>')
    expect(body).toContain('<integer>86400</integer>')
    expect(r.nextSteps.some(s => s.includes('launchctl load'))).toBe(true)
  })

  it('writes systemd service + timer on linux', () => {
    const r = installSweepCron({ home, platform: 'linux' })
    expect(r.platform).toBe('linux')
    const svc = join(home, '.config', 'systemd', 'user', 'fulcrum-sweep.service')
    const timer = join(home, '.config', 'systemd', 'user', 'fulcrum-sweep.timer')
    expect(existsSync(svc)).toBe(true)
    expect(existsSync(timer)).toBe(true)
    expect(readFileSync(timer, 'utf8')).toContain('OnCalendar=daily')
    expect(r.nextSteps.some(s => s.includes('systemctl --user enable'))).toBe(true)
  })

  it('prints manual instructions on unsupported platform', () => {
    const r = installSweepCron({ home, platform: 'win32' })
    expect(r.platform).toBe('win32')
    expect(r.files).toEqual([])
    expect(r.nextSteps.some(s => s.includes('0 4 * * *'))).toBe(true)
  })
})
