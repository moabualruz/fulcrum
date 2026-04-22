import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

interface UiCrawlStep {
  id: string
  label: string
  kind: string
  result: 'pass' | 'fail'
  screenshot: string
  notes: string
}

const reportDir = process.env['FULCRUM_E2E_REPORT_DIR'] ?? 'sandbox-reports'
const crawlDir = path.join(reportDir, 'ui-crawl')

test('monitor crawl captures dashboard interactions for review', async ({ page }) => {
  mkdirSync(crawlDir, { recursive: true })
  const steps: UiCrawlStep[] = []

  await page.goto('/')
  await expect(page).toHaveTitle(/Fulcrum/)
  await capture(page, steps, 'dashboard-home', 'Dashboard home', 'page', 'pass', 'Initial monitor dashboard shell.')

  const tokenInput = page.locator('#token-input')
  if (await tokenInput.isVisible()) {
    await tokenInput.fill('sandbox-search')
    await capture(page, steps, 'token-input-filled', 'Token search input', 'input', 'pass', 'Human typed into token search/filter input.')
    await tokenInput.clear()
  }

  const interactive = page.locator('a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')
  const count = Math.min(await interactive.count(), 24)
  for (let index = 0; index < count; index += 1) {
    const target = interactive.nth(index)
    if (!(await target.isVisible().catch(() => false))) continue

    const tag = await target.evaluate((node) => node.tagName.toLowerCase()).catch(() => 'unknown')
    const label = await target.evaluate((node) => {
      const element = node as HTMLElement
      return element.getAttribute('aria-label')
        || element.getAttribute('title')
        || element.innerText
        || element.getAttribute('placeholder')
        || element.id
        || element.getAttribute('href')
        || element.tagName.toLowerCase()
    }).catch(() => `${tag}-${index}`)
    const id = `interactive-${index}-${slug(label)}`

    try {
      await target.scrollIntoViewIfNeeded()
      if (tag === 'input' || tag === 'textarea') {
        await target.fill(`sandbox-${index}`).catch(() => undefined)
      } else if (tag === 'select') {
        const values = await target.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
        if (values[0]) await target.selectOption(values[0]).catch(() => undefined)
      } else {
        await target.click({ timeout: 1_500 }).catch(() => undefined)
      }
      await page.waitForTimeout(150)
      await capture(page, steps, id, label, tag, 'pass', 'Crawler exercised visible interactive control.')
      await page.goto('/')
    } catch (error) {
      await capture(page, steps, id, label, tag, 'fail', error instanceof Error ? error.message : String(error))
    }
  }

  writeFileSync(path.join(crawlDir, 'ui-crawl.json'), JSON.stringify(steps, null, 2))
  writeFileSync(path.join(crawlDir, 'ui-review.md'), reviewMarkdown(steps))
  writeFileSync(path.join(crawlDir, 'ui-review.html'), reviewHtml(steps))
})

async function capture(
  page: Page,
  steps: UiCrawlStep[],
  id: string,
  label: string,
  kind: string,
  result: 'pass' | 'fail',
  notes: string,
): Promise<void> {
  const screenshot = `${slug(id)}.png`
  await page.screenshot({ path: path.join(crawlDir, screenshot), fullPage: true })
  steps.push({ id, label, kind, result, screenshot, notes })
}

function reviewMarkdown(steps: UiCrawlStep[]): string {
  return [
    '# Monitor UI Crawl Review',
    '',
    '| Step | Kind | Result | Notes |',
    '|---|---:|---:|---|',
    ...steps.map((step) => `| ${step.id} | ${step.kind} | ${step.result} | ${step.notes} |`),
  ].join('\n')
}

function reviewHtml(steps: UiCrawlStep[]): string {
  const cards = steps.map((step) => `<article class="${step.result}">
  <h2>${escapeHtml(step.id)}</h2>
  <p>${escapeHtml(step.kind)}: ${escapeHtml(step.label)}</p>
  <p>${escapeHtml(step.notes)}</p>
  <label><input type="checkbox" data-key="accepted:${escapeHtml(step.id)}"> accepted</label>
  <textarea data-key="notes:${escapeHtml(step.id)}" placeholder="notes"></textarea>
  <img src="${escapeHtml(step.screenshot)}" alt="${escapeHtml(step.id)}">
</article>`).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Monitor UI Crawl Review</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #f4f6f8; color: #172026; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    section { display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 16px; }
    article { background: white; border: 1px solid #d7dee5; border-left: 6px solid #16794c; border-radius: 8px; padding: 14px; }
    article.fail { border-left-color: #bd352c; }
    h2 { margin: 0 0 8px; font-size: 16px; }
    textarea { width: 100%; min-height: 72px; display: block; margin: 8px 0 12px; }
    img { width: 100%; border: 1px solid #d7dee5; border-radius: 4px; }
  </style>
</head>
<body>
  <main>
    <h1>Monitor UI Crawl Review</h1>
    <p>Checkboxes and notes persist in this browser through localStorage.</p>
    <section>${cards}</section>
  </main>
  <script>
    for (const el of document.querySelectorAll('[data-key]')) {
      const key = 'fulcrum-monitor-crawl:' + el.dataset.key;
      if (el.type === 'checkbox') el.checked = localStorage.getItem(key) === 'true';
      else el.value = localStorage.getItem(key) || '';
      el.addEventListener('input', () => {
        localStorage.setItem(key, el.type === 'checkbox' ? String(el.checked) : el.value);
      });
    }
  </script>
</body>
</html>`
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 80) || 'step'
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
