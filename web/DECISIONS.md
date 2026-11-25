# Web frontend decisions

Tool and design choices for `web/`. Each entry says what we use and, where it matters, why.

## Base stack (decided before T1–T8)

- **Build:** Vite + React + TypeScript (`strict`). The dev server runs on port 5173 only (`strictPort`), because the backend's default `CORS_ORIGINS` allows `http://localhost:5173`.
- **Styling:** Tailwind CSS. Colors, radii and type come from the Figma variables ("BiletFlow tokens") as CSS variables in `src/styles/tokens.css`.
- **Routing:** React Router.
- **Server state:** TanStack Query.

## T1. API client

`orval` generates TypeScript types and TanStack Query hooks from the backend's `/openapi.json` (`npm run api:gen`). The generated code lives in `src/api/generated` and is committed, so builds and CI never need a running backend.

Components don't call generated hooks directly. They use our own wrappers (`useEvents`, later `useCreateOrder`, ...) in `src/api/hooks`, because the backend's operation IDs (`events-get_events`) follow function names that may still be renamed.

## T2. Forms

`react-hook-form` + `zod`. Server validation errors (422 `fields`) are mapped onto form fields with one helper.

## T3. Components

`shadcn/ui` (Radix primitives) on top of Tailwind. The components are copied into `src/components/ui` and styled with our tokens only.

## T4. Localization

`react-i18next` with three languages: `kk`, `ru`, `en`. The server's English `message` is never shown: every error code has its own translated text.

## T5. Tests

- Unit and component tests: Vitest + Testing Library + MSW (mocked API).
- End-to-end: Playwright against the real local backend. Accessibility checks with axe come later (W2.17, W14).

## T6. Login tokens in the browser

The access token lives only in memory; the refresh token is kept in `localStorage`. Implemented in W3.

Trade-off: a page reload keeps the user signed in, at the cost of a refresh token that a script injected into the page could read. The risk is limited because the backend makes refresh tokens single-use and rotates them on every refresh.

## T7. Default language

The browser's language if it is `kk`, `ru` or `en`, otherwise `ru`. The user's choice is remembered on the device.

## T8. Mobile stack

Postponed together with the mobile app. Nothing in `web/` depends on it.

## Other conventions

- **Time zone:** event times are shown in `Asia/Almaty` (UTC+5) with the label "Astana time (UTC+5)", whatever the viewer's own time zone.
- **Money:** whole KZT, shown as `5 000 ₸`; `0` is shown as "Free".
- **Heading font (temporary):** Unbounded has no Kazakh letters Ә Ғ Қ Ң Ө Ұ Ү Һ, so headings take those letters from Golos Text. The heading font may change later.
