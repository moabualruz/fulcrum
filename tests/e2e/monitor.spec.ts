import { expect, test } from '@playwright/test'

test('monitor exposes health and dashboard shell', async ({ page, request }) => {
  const status = await request.get('/status')
  expect(status.ok()).toBe(true)

  const body = await status.json() as { status?: string }
  expect(body.status).toBe('ok')

  await page.goto('/')
  await expect(page).toHaveTitle(/Fulcrum/)
  await expect(page.getByText('PM Dashboard')).toBeVisible()
  await expect(page.locator('#pm-active-work')).toBeVisible()
  await expect(page.locator('#token-input')).toBeVisible()
})
