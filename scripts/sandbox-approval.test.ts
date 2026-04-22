import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  approveGoldBaseline,
  compareGoldBaseline,
  collectCurrentScreenshots,
  type ApprovalManifest,
} from './sandbox-approval.js'

function makeReport(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fulcrum-sandbox-report-'))
  writeFileSync(path.join(root, 'summary.txt'), 'PASS all\n')
  const cliDir = path.join(root, 'cli-scenarios', 'screenshots')
  const uiDir = path.join(root, 'ui-crawl')
  mkdirSync(cliDir, { recursive: true })
  mkdirSync(uiDir, { recursive: true })
  writeFileSync(path.join(cliDir, 'cli-help.png'), 'cli-help-v1')
  writeFileSync(path.join(uiDir, 'dashboard-home.png'), 'dashboard-v1')
  return root
}

describe('sandbox approval and gold baseline', () => {
  it('collects CLI and UI screenshots from a sandbox report', () => {
    const reportDir = makeReport()
    const screenshots = collectCurrentScreenshots(reportDir)

    expect(screenshots.map((item) => item.relativePath)).toEqual([
      'cli-scenarios/screenshots/cli-help.png',
      'ui-crawl/dashboard-home.png',
    ])
  })

  it('approves current screenshots into a durable gold baseline', () => {
    const reportDir = makeReport()
    const goldDir = mkdtempSync(path.join(tmpdir(), 'fulcrum-sandbox-gold-'))
    const manifest = approveGoldBaseline({
      reportDir,
      goldDir,
      approvedBy: 'test',
      note: 'first gold',
    })

    expect(manifest.counts.total).toBe(2)
    expect(manifest.approvedBy).toBe('test')
    expect(existsSync(path.join(goldDir, 'cli-scenarios', 'screenshots', 'cli-help.png'))).toBe(true)
    expect(existsSync(path.join(goldDir, 'ui-crawl', 'dashboard-home.png'))).toBe(true)
    expect(existsSync(path.join(goldDir, 'approval.json'))).toBe(true)
    expect(existsSync(path.join(goldDir, 'review.html'))).toBe(true)
  })

  it('compares current report screenshots against gold and reports drift', () => {
    const reportDir = makeReport()
    const goldDir = mkdtempSync(path.join(tmpdir(), 'fulcrum-sandbox-gold-'))
    approveGoldBaseline({ reportDir, goldDir, approvedBy: 'test', note: 'first gold' })

    const changedReport = makeReport()
    writeFileSync(path.join(changedReport, 'cli-scenarios', 'screenshots', 'cli-help.png'), 'cli-help-v2')
    writeFileSync(path.join(changedReport, 'cli-scenarios', 'screenshots', 'new.png'), 'new-screenshot')
    const comparison = compareGoldBaseline({ reportDir: changedReport, goldDir })

    expect(comparison.counts.changed).toBe(1)
    expect(comparison.counts.newCurrent).toBe(1)
    expect(comparison.counts.matched).toBe(1)
    expect(comparison.ok).toBe(false)
    expect(existsSync(path.join(changedReport, 'gold-compare.json'))).toBe(true)

    const saved = JSON.parse(readFileSync(path.join(goldDir, 'approval.json'), 'utf8')) as ApprovalManifest
    expect(saved.items).toHaveLength(2)
  })
})
