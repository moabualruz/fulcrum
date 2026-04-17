// v2b PR 9 follow-up — installs a 24h cron job that runs
// `fulcrum memory sweep-expired`. Platform-specific:
//   - darwin  → ~/Library/LaunchAgents/dev.fulcrum.sweep.plist (launchd daemon)
//   - linux   → ~/.config/systemd/user/fulcrum-sweep.{service,timer} (systemd --user)
//   - other   → print manual cron instructions
//
// Idempotent. Writes the unit files but does not enable them — operator runs
// the register command the CLI prints. This avoids surprising users with
// active background jobs on first install.

import { platform, homedir } from 'node:os'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export interface InstallResult {
  platform: string
  files: string[]
  nextSteps: string[]
}

export interface InstallOptions {
  fulcrumBin?: string
  // Override for tests — lets us redirect ~ and the platform string.
  home?: string
  platform?: NodeJS.Platform
}

export function installSweepCron(opts: InstallOptions = {}): InstallResult {
  const fulcrumBin = opts.fulcrumBin ?? 'fulcrum'
  const plat = opts.platform ?? platform()
  const home = opts.home ?? homedir()

  if (plat === 'darwin') {
    const dir = join(home, 'Library', 'LaunchAgents')
    mkdirSync(dir, { recursive: true })
    const plistPath = join(dir, 'dev.fulcrum.sweep.plist')
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.fulcrum.sweep</string>
  <key>ProgramArguments</key>
  <array>
    <string>${fulcrumBin}</string>
    <string>memory</string>
    <string>sweep-expired</string>
  </array>
  <key>StartInterval</key>
  <integer>86400</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${home}/.local/share/fulcrum/logs/sweep.log</string>
  <key>StandardErrorPath</key>
  <string>${home}/.local/share/fulcrum/logs/sweep.err</string>
</dict>
</plist>
`
    writeFileSync(plistPath, plist, 'utf8')
    return {
      platform: 'darwin',
      files: [plistPath],
      nextSteps: [
        `Enable with: launchctl load -w ${plistPath}`,
        `Disable with: launchctl unload -w ${plistPath}`,
      ],
    }
  }

  if (plat === 'linux') {
    const dir = join(home, '.config', 'systemd', 'user')
    mkdirSync(dir, { recursive: true })
    const servicePath = join(dir, 'fulcrum-sweep.service')
    const timerPath = join(dir, 'fulcrum-sweep.timer')
    const service = `[Unit]
Description=Fulcrum memory expiration sweep
Documentation=https://github.com/moabualruz/pi-stack-plan

[Service]
Type=oneshot
ExecStart=${fulcrumBin} memory sweep-expired
`
    const timer = `[Unit]
Description=Fulcrum memory sweep — 24h cadence
Requires=fulcrum-sweep.service

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
`
    writeFileSync(servicePath, service, 'utf8')
    writeFileSync(timerPath, timer, 'utf8')
    return {
      platform: 'linux',
      files: [servicePath, timerPath],
      nextSteps: [
        'Reload systemd units: systemctl --user daemon-reload',
        'Enable + start timer:  systemctl --user enable --now fulcrum-sweep.timer',
        'Check status:          systemctl --user list-timers fulcrum-sweep.timer',
      ],
    }
  }

  return {
    platform: plat,
    files: [],
    nextSteps: [
      'No platform-specific installer for this OS.',
      'Manual cron (run daily): 0 4 * * * ' + fulcrumBin + ' memory sweep-expired',
    ],
  }
}

/** CLI entry point — called when the user passes `--install`. */
export function runSweepInstall(): void {
  const r = installSweepCron()
  if (r.files.length > 0) {
    console.log(`[sweep] wrote ${r.files.length} unit file(s) for platform=${r.platform}:`)
    for (const f of r.files) console.log('  ' + f)
  } else {
    console.log(`[sweep] unsupported platform=${r.platform} — see manual instructions:`)
  }
  console.log(`[sweep] next steps:`)
  for (const s of r.nextSteps) console.log('  ' + s)
}

// Check if the user's platform file(s) exist.
export function isSweepCronInstalled(): boolean {
  const plat = platform()
  const home = homedir()
  if (plat === 'darwin') return existsSync(join(home, 'Library', 'LaunchAgents', 'dev.fulcrum.sweep.plist'))
  if (plat === 'linux') return existsSync(join(home, '.config', 'systemd', 'user', 'fulcrum-sweep.timer'))
  return false
}
