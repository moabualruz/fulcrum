// packages/core/src/notify.ts
// Cross-platform notification for blocked agent runs.
//
// Fire-and-forget — errors are logged to stderr only, never thrown.
// Callers (blockAgentRun, etc.) must not await if they want non-blocking behavior.

import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'
import { globalDataDir } from './db/client.js'

export interface BlockedNotification {
  run_id: string
  role: string
  workspace_id: string
  reason: string
  escalation_reason?: string | null
}

/**
 * Deliver a blocked-run notification via all available channels:
 *  1. Desktop notification (macOS: osascript, Linux: notify-send, Windows: PowerShell toast)
 *  2. Append to ~/.local/share/fulcrum/alerts.log
 *  3. POST to FULCRUM_ALERT_WEBHOOK (Slack-compatible JSON) if env var is set
 *
 * All channels are best-effort — failure in one never prevents the others.
 */
export async function notifyBlocked(n: BlockedNotification): Promise<void> {
  const title = `Fulcrum: agent blocked`
  const body = `[${n.role}] ${n.reason}${n.escalation_reason ? ` — ${n.escalation_reason}` : ''}`

  // 1. Desktop notification
  try {
    desktopNotify(title, body)
  } catch (err) {
    process.stderr.write(`[fulcrum/notify] desktop notification failed: ${(err as Error).message}\n`)
  }

  // 2. Alerts log
  try {
    const alertsDir = join(globalDataDir(), '')
    const alertsPath = join(alertsDir, 'alerts.log')
    const line = `${new Date().toISOString()} run_id=${n.run_id} role=${n.role} workspace=${n.workspace_id} reason=${JSON.stringify(n.reason)}\n`
    mkdirSync(alertsDir, { recursive: true })
    appendFileSync(alertsPath, line, 'utf8')
  } catch (err) {
    process.stderr.write(`[fulcrum/notify] alerts.log write failed: ${(err as Error).message}\n`)
  }

  // 3. Webhook
  const webhookUrl = process.env['FULCRUM_ALERT_WEBHOOK']
  if (webhookUrl) {
    try {
      const payload = {
        text: `*Fulcrum agent blocked*`,
        attachments: [{
          color: 'danger',
          fields: [
            { title: 'Run', value: n.run_id, short: true },
            { title: 'Role', value: n.role, short: true },
            { title: 'Reason', value: n.reason },
            ...(n.escalation_reason ? [{ title: 'Escalation', value: n.escalation_reason }] : []),
          ],
        }],
      }
      // Fire and forget — do not await, do not retry
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err: Error) => {
        process.stderr.write(`[fulcrum/notify] webhook POST failed: ${err.message}\n`)
      })
    } catch (err) {
      process.stderr.write(`[fulcrum/notify] webhook setup failed: ${(err as Error).message}\n`)
    }
  }
}

function desktopNotify(title: string, body: string): void {
  const platform = process.platform

  if (platform === 'darwin') {
    // macOS: osascript (always available)
    spawnSync('osascript', [
      '-e',
      `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`,
    ], { timeout: 3000, stdio: 'pipe' })
  } else if (platform === 'linux') {
    // Linux: notify-send (libnotify)
    spawnSync('notify-send', [title, body, '--urgency=normal', '--expire-time=10000'], {
      timeout: 3000,
      stdio: 'pipe',
    })
  } else if (platform === 'win32') {
    // Windows: PowerShell toast notification
    const script = [
      `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null`,
      `$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)`,
      `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode(${JSON.stringify(title)})) | Out-Null`,
      `$xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode(${JSON.stringify(body)})) | Out-Null`,
      `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Fulcrum').Show((New-Object Windows.UI.Notifications.ToastNotification($xml)))`,
    ].join('; ')
    spawnSync('powershell.exe', ['-Command', script], { timeout: 5000, stdio: 'pipe' })
  }
  // Other platforms: silently skip
}
