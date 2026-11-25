import { expect, it } from 'vitest'
import { safeReturnTo } from '@/auth/return-to'

it('keeps the path, query and hash of an in-app destination', () => {
  expect(safeReturnTo('/orders/12?tab=history#tickets')).toBe('/orders/12?tab=history#tickets')
})

it.each([
  null,
  'https://example.test',
  '//example.test',
  '/\\example.test',
  '/%2Fexample.test',
  '/one/..//example.test',
  '/login?returnTo=/orders/12',
  '/%72egister',
  '/bad-%',
])('rejects an unsafe or circular return destination (%s)', (path) => {
  expect(safeReturnTo(path)).toBeNull()
})
