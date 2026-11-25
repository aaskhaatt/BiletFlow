import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const API_URL = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')
const languages = [
  ['en', 'English'],
  ['kk', 'Қазақша'],
  ['ru', 'Русский'],
] as const

test.use({ locale: 'en-US' })

test.beforeEach(async ({ page }) => {
  const headers = { 'Access-Control-Allow-Origin': '*' }
  await page.route(`${API_URL}/health`, (route) =>
    route.fulfill({ json: { status: 'ok', database: 'ok' }, headers }),
  )
  await page.route(`${API_URL}/events?*`, (route) =>
    route.fulfill({ json: { items: [], total: 0 }, headers }),
  )
})

for (const width of [360, 1280]) {
  for (const [language, name] of languages) {
    test(`UI kit accessibility at ${width}px in ${language}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/dev/ui')
      await page.getByTestId('language-switcher').click()
      await page.getByRole('option', { name, exact: true }).click()
      await expect(page.getByRole('listbox')).toHaveCount(0)
      await expect(page.locator('html')).toHaveAttribute('lang', language)
      await expect(page.getByTestId('events-total')).toHaveText('0')
      await page.evaluate(() => document.fonts.ready)

      const { violations } = await new AxeBuilder({ page }).analyze()
      const serious = violations
        .filter(({ impact }) => impact === 'serious' || impact === 'critical')
        .map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))
      expect(serious).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    })
  }
}

test('confirmation traps and restores focus and announces the confirmed action', async ({
  page,
}) => {
  await page.goto('/dev/ui')
  const examples = page.getByRole('region', { name: 'Notifications and confirmation' })
  const trigger = examples.getByRole('button', { name: 'Confirm the refund' })
  await trigger.press('Enter')

  const dialog = page.getByRole('alertdialog', { name: 'Refund this order?' })
  const cancel = dialog.getByRole('button', { name: 'Cancel' })
  const confirm = dialog.getByRole('button', { name: 'Confirm the refund' })
  await expect(dialog.getByText('This action cannot be undone.')).toBeVisible()
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(confirm).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()

  await trigger.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(trigger).toBeFocused()
  await expect(
    page.locator('[aria-live="polite"]').getByText('Demo refund confirmed.', { exact: true }),
  ).toBeVisible()
})

test('mobile navigation, table, chart data, and skip link remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/dev/ui')
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.locator('[data-slot="skeleton"]').first()).toHaveCSS('animation-name', 'none')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await expect(skip).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('main')).toBeFocused()

  const tab = page.getByRole('tab', { name: /^Upcoming.*2$/ })
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const table = page.getByRole('table', { name: 'Upcoming' })
  await expect(table.getByRole('columnheader')).toHaveCount(6)
  await expect(table.getByRole('cell').first()).toHaveCSS('display', 'grid')
  await tab.press('ArrowRight')
  await expect(page.getByRole('tab', { name: /^Past events.*1$/ })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  await expect(page.getByRole('progressbar', { name: 'Ticket capacity' })).toHaveAttribute(
    'value',
    '152',
  )
  await page.getByText('Show data table', { exact: true }).click()
  await expect(page.getByRole('table', { name: 'Sales by day' }).getByRole('row')).toHaveCount(6)

  await page.getByRole('link', { name: 'Public layout' }).click()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Attendee navigation' })
    .getByRole('link', { name: 'Tickets' })
    .click()
  await expect(page).toHaveURL((url) => {
    return url.pathname === '/login' && url.searchParams.get('returnTo') === '/my/tickets'
  })

  const headers = { 'Access-Control-Allow-Origin': '*' }
  await page.route(`${API_URL}/auth/refresh`, (route) =>
    route.fulfill({
      headers,
      json: { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer' },
    }),
  )
  await page.route(`${API_URL}/auth/me`, (route) =>
    route.fulfill({
      headers,
      json: {
        email_verified: true,
        is_platform_admin: true,
        organizer: { id: 10, user_id: 1, status: 'approved' },
      },
    }),
  )
  await page.route(`${API_URL}/support/cases/inbox`, (route) =>
    route.fulfill({ headers, json: [] }),
  )
  await page.evaluate(() => localStorage.setItem('biletflow.refresh-token', 'saved-refresh'))

  await page.goto('/organizer/support')
  await expect(
    page.getByRole('navigation', { name: 'Organizer' }).getByRole('link', { name: 'Support' }),
  ).toHaveAttribute('aria-current', 'page')
  await page.goto('/admin/payments')
  await expect(
    page
      .getByRole('navigation', { name: 'Platform administration' })
      .getByRole('link', { name: 'Payments' }),
  ).toHaveAttribute('aria-current', 'page')
})

test('cover upload previews a valid image and rejects an oversized selection', async ({ page }) => {
  await page.goto('/dev/ui')
  const input = page.getByLabel('Event cover')
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP9sAAAAASUVORK5CYII=',
    'base64',
  )
  await input.setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByRole('img', { name: 'Selected cover image' })).toBeVisible()
  await expect(page.getByText('Cover image uploaded.', { exact: true })).toBeVisible()
  await input.setInputFiles({
    name: 'big.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  })
  await expect(page.locator('[data-slot="image-upload"]').getByRole('alert')).toHaveText(
    'The image is larger than 5 MB.',
  )
  await expect(page.getByRole('img', { name: 'Selected cover image' })).toBeVisible()
})
