import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts; each file covers Latin, Cyrillic and Cyrillic Extended.
// Unbounded has no Kazakh letters (Ә Ғ Қ Ң Ө Ұ Ү Һ), so headings fall back to
// Golos Text for them: 700 is loaded for that fallback (see --font-display).
import '@fontsource/golos-text/400.css'
import '@fontsource/golos-text/500.css'
import '@fontsource/golos-text/700.css'
import '@fontsource/unbounded/500.css'
import '@fontsource/unbounded/700.css'
import '@/i18n'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
