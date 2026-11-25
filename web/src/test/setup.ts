import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import i18n from '@/i18n'
import { server } from '@/test/msw-server'

// A request without a handler fails the test instead of reaching the network
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Every test starts in Russian, with a fresh DOM
beforeEach(async () => {
  await i18n.changeLanguage('ru')
})
afterEach(() => cleanup())
