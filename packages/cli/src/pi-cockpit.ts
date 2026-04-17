// v2a PR 9 cluster Task 51 — `fulcrum pi cockpit start|stop|status` CLI.
//
// The cockpit itself lives at agent-integration/pi/cockpit/index.ts (a Pi
// extension). This CLI wraps the process lifecycle around it so operators
// have a single command surface for start / stop / status without having
// to know the Pi invocation dance.

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { globalDataDir } from 'fulcrum-core'

export interface CockpitStatus {
  running: boolean
  pid: number | null
  started_at: string | null
  last_event_at: string | null
}

function pidFilePath(): string {
  const dir = join(globalDataDir(), 'pi')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'cockpit.pid')
}

function metaFilePath(): string {
  const dir = join(globalDataDir(), 'pi')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'cockpit.meta.json')
}

function processIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true }
  catch { return false }
}

export function getCockpitStatus(): CockpitStatus {
  const pidFile = pidFilePath()
  if (!existsSync(pidFile)) return { running: false, pid: null, started_at: null, last_event_at: null }
  try {
    const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10)
    if (Number.isNaN(pid) || !processIsAlive(pid)) {
      // Stale pidfile — clean it.
      try { unlinkSync(pidFile) } catch { /* already gone */ }
      return { running: false, pid: null, started_at: null, last_event_at: null }
    }
    let started_at: string | null = null
    let last_event_at: string | null = null
    try {
      const meta = JSON.parse(readFileSync(metaFilePath(), 'utf8')) as Record<string, unknown>
      if (typeof meta['started_at'] === 'string') started_at = meta['started_at']
      if (typeof meta['last_event_at'] === 'string') last_event_at = meta['last_event_at']
    } catch { /* meta optional */ }
    return { running: true, pid, started_at, last_event_at }
  } catch {
    return { running: false, pid: null, started_at: null, last_event_at: null }
  }
}

export interface CockpitStartOptions {
  cockpitEntry?: string
  extraArgs?: string[]
}

export async function startCockpit(opts: CockpitStartOptions = {}): Promise<CockpitStatus> {
  const status = getCockpitStatus()
  if (status.running) return status

  // Default to the local cockpit TypeScript entry when pi is installed in
  // the monorepo checkout. Operators deploying the npm package can override
  // via opts.cockpitEntry or env FULCRUM_PI_COCKPIT_ENTRY.
  const entry = opts.cockpitEntry
    ?? process.env['FULCRUM_PI_COCKPIT_ENTRY']
    ?? 'agent-integration/pi/cockpit/index.ts'
  const child = spawn('node', ['--import', 'tsx/esm', entry, ...(opts.extraArgs ?? [])], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd(),
    env: { ...process.env },
  })
  if (!child.pid) {
    return { running: false, pid: null, started_at: null, last_event_at: null }
  }
  child.unref()

  writeFileSync(pidFilePath(), String(child.pid), 'utf8')
  const now = new Date().toISOString()
  writeFileSync(metaFilePath(), JSON.stringify({ started_at: now, last_event_at: null }), 'utf8')

  return { running: true, pid: child.pid, started_at: now, last_event_at: null }
}

export function stopCockpit(): { stopped: boolean; pid: number | null } {
  const status = getCockpitStatus()
  if (!status.running || !status.pid) return { stopped: false, pid: null }
  try {
    process.kill(status.pid, 'SIGTERM')
    try { unlinkSync(pidFilePath()) } catch { /* already gone */ }
    try { unlinkSync(metaFilePath()) } catch { /* already gone */ }
    return { stopped: true, pid: status.pid }
  } catch {
    return { stopped: false, pid: status.pid }
  }
}

export async function runPiCockpit(subcommand: string | undefined, args: string[] = []): Promise<void> {
  if (!subcommand) {
    console.error('Usage: fulcrum pi cockpit start|stop|status')
    process.exit(1)
  }
  switch (subcommand) {
    case 'start': {
      const status = await startCockpit({ extraArgs: args })
      console.log(JSON.stringify(status, null, 2))
      return
    }
    case 'stop': {
      const result = stopCockpit()
      console.log(JSON.stringify(result, null, 2))
      if (!result.stopped) process.exit(1)
      return
    }
    case 'status': {
      const status = getCockpitStatus()
      console.log(JSON.stringify(status, null, 2))
      return
    }
    default:
      console.error(`Unknown pi cockpit subcommand: ${subcommand}`)
      console.error('Usage: fulcrum pi cockpit start|stop|status')
      process.exit(1)
  }
}
