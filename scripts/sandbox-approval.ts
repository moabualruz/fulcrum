import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ScreenshotArtifact {
  area: 'cli' | 'ui'
  relativePath: string
  absolutePath: string
  bytes: number
  sha256: string
}

export interface ApprovalManifest {
  schemaVersion: 1
  generatedAt: string
  sourceReportDir: string
  goldDir: string
  approvedBy: string | undefined
  note: string | undefined
  counts: {
    total: number
    cli: number
    ui: number
  }
  items: ScreenshotArtifact[]
}

export interface CompareDiff {
  relativePath: string
  status: 'matched' | 'changed' | 'missing-current' | 'new-current'
  goldSha256?: string
  currentSha256?: string
}

export interface CompareReport {
  generatedAt: string
  reportDir: string
  goldDir: string
  ok: boolean
  counts: {
    totalGold: number
    totalCurrent: number
    matched: number
    changed: number
    missingCurrent: number
    newCurrent: number
  }
  diffs: CompareDiff[]
}

interface ApprovalOptions {
  reportDir: string
  goldDir: string
  approvedBy?: string
  note?: string
}

const CLI_SCREENSHOT_DIR = path.join('cli-scenarios', 'screenshots')
const UI_SCREENSHOT_DIR = 'ui-crawl'

export function collectCurrentScreenshots(reportDir: string): ScreenshotArtifact[] {
  const roots = [
    { area: 'cli' as const, root: path.join(reportDir, CLI_SCREENSHOT_DIR), prefix: CLI_SCREENSHOT_DIR },
    { area: 'ui' as const, root: path.join(reportDir, UI_SCREENSHOT_DIR), prefix: UI_SCREENSHOT_DIR },
  ]
  const items: ScreenshotArtifact[] = []

  for (const root of roots) {
    if (!existsSync(root.root)) continue
    for (const filePath of walkPngFiles(root.root)) {
      const relativePath = normalizePath(path.join(root.prefix, path.relative(root.root, filePath)))
      items.push({
        area: root.area,
        relativePath,
        absolutePath: filePath,
        bytes: statSync(filePath).size,
        sha256: sha256File(filePath),
      })
    }
  }

  return items.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

export function approveGoldBaseline(options: ApprovalOptions): ApprovalManifest {
  const reportDir = path.resolve(options.reportDir)
  const goldDir = path.resolve(options.goldDir)
  const items = collectCurrentScreenshots(reportDir)
  if (items.length === 0) {
    throw new Error(`No screenshots found under ${reportDir}`)
  }

  for (const item of items) {
    const destination = path.join(goldDir, item.relativePath)
    mkdirSync(path.dirname(destination), { recursive: true })
    copyFileSync(item.absolutePath, destination)
  }

  const manifest: ApprovalManifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceReportDir: reportDir,
    goldDir,
    approvedBy: options.approvedBy,
    note: options.note,
    counts: {
      total: items.length,
      cli: items.filter((item) => item.area === 'cli').length,
      ui: items.filter((item) => item.area === 'ui').length,
    },
    items: items.map((item) => ({
      ...item,
      absolutePath: path.join(goldDir, item.relativePath),
    })),
  }

  mkdirSync(goldDir, { recursive: true })
  writeFileSync(path.join(goldDir, 'approval.json'), JSON.stringify(manifest, null, 2))
  writeFileSync(path.join(goldDir, 'README.md'), approvalMarkdown(manifest))
  writeFileSync(path.join(goldDir, 'review.html'), approvalHtml(manifest))
  return manifest
}

export function compareGoldBaseline(options: Pick<ApprovalOptions, 'reportDir' | 'goldDir'>): CompareReport {
  const reportDir = path.resolve(options.reportDir)
  const goldDir = path.resolve(options.goldDir)
  const manifestPath = path.join(goldDir, 'approval.json')
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing gold baseline manifest: ${manifestPath}`)
  }

  const gold = JSON.parse(readFileSync(manifestPath, 'utf8')) as ApprovalManifest
  const current = collectCurrentScreenshots(reportDir)
  const currentByPath = new Map(current.map((item) => [item.relativePath, item]))
  const goldByPath = new Map(gold.items.map((item) => [item.relativePath, item]))
  const diffs: CompareDiff[] = []

  for (const item of gold.items) {
    const currentItem = currentByPath.get(item.relativePath)
    if (!currentItem) {
      diffs.push({ relativePath: item.relativePath, status: 'missing-current', goldSha256: item.sha256 })
    } else if (currentItem.sha256 !== item.sha256) {
      diffs.push({
        relativePath: item.relativePath,
        status: 'changed',
        goldSha256: item.sha256,
        currentSha256: currentItem.sha256,
      })
    } else {
      diffs.push({
        relativePath: item.relativePath,
        status: 'matched',
        goldSha256: item.sha256,
        currentSha256: currentItem.sha256,
      })
    }
  }

  for (const item of current) {
    if (!goldByPath.has(item.relativePath)) {
      diffs.push({ relativePath: item.relativePath, status: 'new-current', currentSha256: item.sha256 })
    }
  }

  const report: CompareReport = {
    generatedAt: new Date().toISOString(),
    reportDir,
    goldDir,
    ok: diffs.every((item) => item.status === 'matched'),
    counts: {
      totalGold: gold.items.length,
      totalCurrent: current.length,
      matched: diffs.filter((item) => item.status === 'matched').length,
      changed: diffs.filter((item) => item.status === 'changed').length,
      missingCurrent: diffs.filter((item) => item.status === 'missing-current').length,
      newCurrent: diffs.filter((item) => item.status === 'new-current').length,
    },
    diffs,
  }

  writeFileSync(path.join(reportDir, 'gold-compare.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(reportDir, 'gold-compare.md'), compareMarkdown(report))
  writeFileSync(path.join(reportDir, 'gold-compare.html'), compareHtml(report))
  return report
}

function approvalMarkdown(manifest: ApprovalManifest): string {
  return [
    '# Fulcrum Sandbox Gold Baseline',
    '',
    `Approved: ${manifest.generatedAt}`,
    `Approved by: ${manifest.approvedBy ?? 'unspecified'}`,
    `Source report: ${manifest.sourceReportDir}`,
    `Note: ${manifest.note ?? ''}`,
    '',
    `Total screenshots: ${manifest.counts.total}`,
    `CLI screenshots: ${manifest.counts.cli}`,
    `UI screenshots: ${manifest.counts.ui}`,
    '',
    '| Screenshot | SHA-256 |',
    '|---|---|',
    ...manifest.items.map((item) => `| ${item.relativePath} | ${item.sha256} |`),
  ].join('\n')
}

function compareMarkdown(report: CompareReport): string {
  return [
    '# Fulcrum Sandbox Gold Compare',
    '',
    `Generated: ${report.generatedAt}`,
    `Result: ${report.ok ? 'pass' : 'fail'}`,
    '',
    `Matched: ${report.counts.matched}`,
    `Changed: ${report.counts.changed}`,
    `Missing current: ${report.counts.missingCurrent}`,
    `New current: ${report.counts.newCurrent}`,
    '',
    '| Screenshot | Status |',
    '|---|---:|',
    ...report.diffs.map((item) => `| ${item.relativePath} | ${item.status} |`),
  ].join('\n')
}

function approvalHtml(manifest: ApprovalManifest): string {
  const cards = manifest.items.map((item) => `<article>
  <h2>${escapeHtml(item.relativePath)}</h2>
  <p>${item.bytes} bytes<br>${escapeHtml(item.sha256)}</p>
  <label><input type="checkbox" checked disabled> approved gold</label>
  <img src="${escapeHtml(item.relativePath)}" alt="${escapeHtml(item.relativePath)}">
</article>`).join('\n')
  return galleryHtml('Fulcrum Sandbox Gold Baseline', [
    `Approved: ${manifest.generatedAt}`,
    `Approved by: ${manifest.approvedBy ?? 'unspecified'}`,
    `Source: ${manifest.sourceReportDir}`,
    `Total: ${manifest.counts.total}`,
  ], cards)
}

function compareHtml(report: CompareReport): string {
  const cards = report.diffs.map((item) => `<article class="${item.status === 'matched' ? 'pass' : 'fail'}">
  <h2>${escapeHtml(item.relativePath)}</h2>
  <p>${escapeHtml(item.status)}</p>
  <p>gold: ${escapeHtml(item.goldSha256 ?? '')}<br>current: ${escapeHtml(item.currentSha256 ?? '')}</p>
</article>`).join('\n')
  return galleryHtml('Fulcrum Sandbox Gold Compare', [
    `Result: ${report.ok ? 'pass' : 'fail'}`,
    `Matched: ${report.counts.matched}`,
    `Changed: ${report.counts.changed}`,
    `Missing current: ${report.counts.missingCurrent}`,
    `New current: ${report.counts.newCurrent}`,
  ], cards)
}

function galleryHtml(title: string, summary: string[], cards: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f4f6f8; color: #172026; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0 24px; }
    .summary span { background: #fff; border: 1px solid #d7dee5; padding: 8px 10px; border-radius: 6px; }
    section { display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 16px; }
    article { background: #fff; border: 1px solid #d7dee5; border-left: 6px solid #16794c; border-radius: 8px; padding: 14px; }
    article.fail { border-left-color: #bd352c; }
    h2 { font-size: 16px; margin: 0 0 8px; word-break: break-word; }
    p { word-break: break-word; }
    img { width: 100%; border: 1px solid #d7dee5; border-radius: 4px; background: #111; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <div class="summary">${summary.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>
    <section>${cards}</section>
  </main>
</body>
</html>`
}

function walkPngFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkPngFiles(absolutePath))
    } else if (entry.isFile() && entry.name.endsWith('.png')) {
      files.push(absolutePath)
    }
  }
  return files
}

function sha256File(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function parseArgs(argv: string[]): { mode: 'approve' | 'check', reportDir: string, goldDir: string, approvedBy?: string, note?: string } {
  const args = [...argv]
  const first = args.shift()
  const mode = first === 'check' ? 'check' : 'approve'
  if (first && first !== 'approve' && first !== 'check') {
    args.unshift(first)
  }
  let reportDir = process.env['FULCRUM_E2E_REPORT_DIR'] ?? 'sandbox-reports/dagger-e2e-smoke-latest'
  let goldDir = process.env['FULCRUM_SANDBOX_GOLD_DIR'] ?? 'tests/golden/sandbox'
  let approvedBy: string | undefined
  let note: string | undefined

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--') {
      continue
    } else if (arg === '--from' || arg === '--report') {
      reportDir = requireValue(args, ++index, arg)
    } else if (arg.startsWith('--from=')) {
      reportDir = arg.slice('--from='.length)
    } else if (arg.startsWith('--report=')) {
      reportDir = arg.slice('--report='.length)
    } else if (arg === '--gold') {
      goldDir = requireValue(args, ++index, arg)
    } else if (arg.startsWith('--gold=')) {
      goldDir = arg.slice('--gold='.length)
    } else if (arg === '--approved-by') {
      approvedBy = requireValue(args, ++index, arg)
    } else if (arg.startsWith('--approved-by=')) {
      approvedBy = arg.slice('--approved-by='.length)
    } else if (arg === '--note') {
      note = requireValue(args, ++index, arg)
    } else if (arg.startsWith('--note=')) {
      note = arg.slice('--note='.length)
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`Unknown sandbox approval option: ${arg}`)
    }
  }

  return { mode, reportDir, goldDir, approvedBy, note }
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function printUsage(): void {
  console.log(`fulcrum sandbox approval

Usage:
  pnpm run sandbox:approve -- [--from <report-dir>] [--gold <gold-dir>] [--approved-by <name>] [--note <text>]
  pnpm run sandbox:gold:check -- [--from <report-dir>] [--gold <gold-dir>]

Defaults:
  report-dir  sandbox-reports/dagger-e2e-smoke-latest
  gold-dir    tests/golden/sandbox
`)
}

const entrypoint = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === entrypoint) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.mode === 'approve') {
      const manifest = approveGoldBaseline(options)
      console.log(JSON.stringify({
        approved: manifest.counts.total,
        cli: manifest.counts.cli,
        ui: manifest.counts.ui,
        gold: manifest.goldDir,
        review: path.join(manifest.goldDir, 'review.html'),
      }, null, 2))
    } else {
      const report = compareGoldBaseline(options)
      console.log(JSON.stringify({
        ok: report.ok,
        counts: report.counts,
        report: path.join(report.reportDir, 'gold-compare.md'),
        review: path.join(report.reportDir, 'gold-compare.html'),
      }, null, 2))
      process.exitCode = report.ok ? 0 : 1
    }
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
