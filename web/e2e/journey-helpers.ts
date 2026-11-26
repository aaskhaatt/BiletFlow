import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'

/*
 * Shared tools of the core-journey tests (core-journey.spec.ts). They talk to a real
 * backend, so they assume the disposable database filled by backend/scripts/seed_demo.py.
 */

export const api = (process.env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '')

/** Seeded accounts (backend/scripts/seed_demo.py). They share one password, see DEMO.md. */
export const demoOrganizer = 'organizer@demo.example.com'
export const demoStaff = 'staff@demo.example.com'

export type Credentials = { email: string; password: string }

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

/** The time as the event form and the ticket-type form want it: Astana clock, UTC+5. */
export const astanaTime = (time: number) =>
  new Date(time + 5 * 3_600_000).toISOString().slice(0, 16)

export async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.status()} from ${new URL(response.url()).pathname}`).toBe(true)
  return response.json() as Promise<T>
}

export async function tokenFor(request: APIRequestContext, credentials: Credentials) {
  const { access_token } = await json<{ access_token: string }>(
    await request.post(`${api}/auth/login`, { data: credentials }),
  )
  return access_token
}

export function seedPassword() {
  const password = process.env.BILETFLOW_E2E_SEED_PASSWORD
  if (!password) throw new Error('Set BILETFLOW_E2E_SEED_PASSWORD to the seeded demo password')
  return password
}

/** Signs in through the login form and waits for the page the form returns to. */
export async function signIn(page: Page, credentials: Credentials, destination: string) {
  await page.goto('/login?' + new URLSearchParams({ returnTo: destination }))
  await page.getByLabel('Email', { exact: true }).fill(credentials.email)
  await page.getByLabel('Password', { exact: true }).fill(credentials.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const target = new URL(destination, 'http://localhost')
  await expect(page).toHaveURL((url) => url.pathname === target.pathname)
}

/** Signs out through the account menu, as a person would, and waits for the signed-out header. */
export async function signOut(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Account navigation' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
}

const recording = process.env.BILETFLOW_E2E_RECORD === '1'

/** Puts a caption over the page while the demo is recorded; does nothing in ordinary runs. */
export async function installCaptions(page: Page) {
  if (!recording) return
  const label = process.env.BILETFLOW_E2E_LABEL ?? ''
  await page.addInitScript((label) => {
    const draw = () => {
      let bar = document.getElementById('demo-caption')
      if (!bar) {
        bar = document.createElement('div')
        bar.id = 'demo-caption'
        bar.setAttribute('aria-hidden', 'true')
        bar.style.cssText =
          'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;' +
          'background:#111827;color:#fff;font:600 15px/1.35 system-ui,sans-serif;padding:8px 16px;' +
          'display:flex;justify-content:space-between;gap:16px;'
        document.documentElement.append(bar)
      }
      const text = sessionStorage.getItem('demo-caption') ?? ''
      bar.innerHTML = ''
      const left = document.createElement('span')
      left.textContent = text
      const right = document.createElement('span')
      right.style.opacity = '0.75'
      right.textContent = label
      bar.append(left, right)
    }
    document.addEventListener('DOMContentLoaded', draw)
    window.addEventListener('storage', draw)
    window.__drawDemoCaption = draw
  }, label)
}

declare global {
  interface Window {
    __drawDemoCaption?: () => void
  }
}

/** What the demo is showing right now, as a caption on the recording. */
export async function caption(page: Page, text: string) {
  if (!recording) return
  // A blank page has no storage to keep the caption in
  if (page.url() === 'about:blank') await page.goto('/')
  await page.evaluate((text) => {
    sessionStorage.setItem('demo-caption', text)
    window.__drawDemoCaption?.()
  }, text)
  await page.waitForTimeout(1200)
}

/**
 * Saves a screenshot for the demo recording when BILETFLOW_E2E_SHOT_DIR is set, and lets the
 * moment stay on screen while recording. In ordinary runs it does nothing, so no files are left.
 */
export async function shot(page: Page, name: string) {
  if (recording) await page.waitForTimeout(2500)
  const dir = process.env.BILETFLOW_E2E_SHOT_DIR
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: false })
}

/**
 * A published event with one paid ticket type and activated paid sales, made through the API
 * as the seeded organizer: setup for tests that do not walk through these screens.
 */
export async function createPaidEvent(
  request: APIRequestContext,
  organizerToken: string,
  { title, quantity, price }: { title: string; quantity: number; price: number },
) {
  const headers = bearer(organizerToken)
  const now = Date.now()
  const start = now + 3 * 86_400_000
  const event = await json<{ id: number }>(
    await request.post(`${api}/events`, {
      headers,
      data: {
        title,
        start_time: new Date(start).toISOString(),
        end_time: new Date(start + 3 * 3_600_000).toISOString(),
        venue_name: 'Astana Hall',
        venue_address: 'Abay 1, Astana',
        capacity: quantity * 2,
      },
    }),
  )
  const ticketType = await json<{ id: number }>(
    await request.post(`${api}/events/${event.id}/ticket-type`, {
      headers,
      data: {
        name: 'Standard',
        price,
        quantity,
        sales_start: new Date(now - 3_600_000).toISOString(),
        sales_end: new Date(start - 3_600_000).toISOString(),
      },
    }),
  )
  const paidSales = `${api}/events/${event.id}/paid-sales`
  await json(await request.post(`${paidSales}/accept-terms`, { headers }))
  await json(await request.post(`${paidSales}/pay-fee`, { headers, data: {} }))
  await json(await request.post(`${paidSales}/activate`, { headers }))
  await json(await request.patch(`${api}/events/${event.id}/publish`, { headers }))
  return { eventId: event.id, ticketTypeId: ticketType.id }
}

export type Order = {
  id: number
  status: string
  total_amount: number
  discount_amount: number
  promo_code: string | null
  created_at: string
  expires_at: string | null
  tickets: { id: number; code: string; status: string }[]
}
