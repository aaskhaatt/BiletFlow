import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import i18n from '@/i18n'
import { server } from '@/test/msw-server'

// jsdom has no ResizeObserver; Radix (switch, select) measures with it
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ...and none of the pointer and scroll methods Radix select calls
if (typeof Element !== 'undefined') {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
}

// A request without a handler fails the test instead of reaching the network
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Every test starts in Russian, with a fresh DOM
beforeEach(async () => {
  await i18n.changeLanguage('ru')
})
afterEach(() => cleanup())
