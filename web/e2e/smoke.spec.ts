import { expect, test } from '@playwright/test'

// Same default as src/lib/env.ts
const API_URL = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

test('the home page opens', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('BiletFlow')
  await expect(page.locator('[data-route-id="catalog"]')).toBeVisible()
})

test('the app shows the events of the real backend', async ({ page, request }) => {
  const health = await request.get(`${API_URL}/health`)
  expect(health.ok(), `No backend at ${API_URL}: start it first (see README)`).toBe(true)
  const { total } = (await (await request.get(`${API_URL}/events`)).json()) as { total: number }

  await page.goto('/dev/ui')

  await expect(page.getByTestId('events-total')).toHaveText(String(total))
})
