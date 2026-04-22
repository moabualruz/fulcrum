import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const port = Number.parseInt(process.env['FULCRUM_E2E_PORT'] ?? '49217', 10)
const baseURL = `http://127.0.0.1:${port}`
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const reportDir = process.env['FULCRUM_E2E_REPORT_DIR'] ?? 'sandbox-reports'
const reportShellPath = reportDir.startsWith('/') ? reportDir : `$PWD/${reportDir}`

export default defineConfig({
  testDir: '.',
  testMatch: ['*.spec.ts'],
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${reportDir}/playwright-html`, open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: { mode: 'only-on-failure', fullPage: true },
    video: 'on-first-retry',
  },
  webServer: {
    cwd: repoRoot,
    command: [
      `mkdir -p ${reportShellPath}/playwright-home ${reportShellPath}/playwright-data ${reportShellPath}/playwright-vault`,
      [
        `HOME="${reportShellPath}/playwright-home"`,
        `XDG_DATA_HOME="${reportShellPath}/playwright-data"`,
        `FULCRUM_DATA_DIR="${reportShellPath}/playwright-data/fulcrum"`,
        `FULCRUM_VAULT_PATH="${reportShellPath}/playwright-vault"`,
        'FULCRUM_DISABLE_PCI=1',
        `./fulcrum serve monitor --port ${port}`,
      ].join(' '),
    ].join(' && '),
    url: `${baseURL}/status`,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
