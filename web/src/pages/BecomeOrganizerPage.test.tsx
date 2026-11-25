import { fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setRequestSession } from '@/api/access-token'
import type { CurrentUserResponse, OrganizerResponse } from '@/api/generated/model'
import { routes } from '@/app/routes'
import { sessionStore } from '@/auth/session-store'
import i18n from '@/i18n'
import { apiUrl, server } from '@/test/msw-server'
import { renderRoutes } from '@/test/render'

const user: CurrentUserResponse = {
  id: 1,
  email: 'tester@example.test',
  email_verified: true,
  is_platform_admin: false,
  is_event_staff: false,
  organizer: null,
}

function withOrganizer(organizer: Partial<OrganizerResponse>): CurrentUserResponse {
  return { ...user, organizer: { id: 7, user_id: 1, status: 'pending', ...organizer } }
}

/** Signs in and lets GET /auth/me answer with `profile()`, whatever it is at the time. */
async function signIn(profile: () => CurrentUserResponse) {
  server.use(
    http.post(apiUrl('/auth/login'), () =>
      HttpResponse.json({
        access_token: 'test-access',
        refresh_token: 'test-refresh',
        token_type: 'bearer',
      }),
    ),
    http.get(apiUrl('/auth/me'), () => HttpResponse.json(profile())),
  )
  await sessionStore.login({ email: user.email, password: 'test-password' })
}

function openPage(route = '/become-organizer') {
  return renderRoutes(routes, { route })
}

const nameField = () => screen.findByLabelText('Публичное название (необязательно)')

describe('become-organizer page', () => {
  beforeEach(() => {
    sessionStore.clearSession()
    setRequestSession(sessionStore)
  })
  afterEach(() => {
    sessionStore.clearSession()
    setRequestSession(null)
  })

  it('shows the application form with what an organizer gets', async () => {
    await signIn(() => user)
    openPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Стать организатором' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Промокоды и QR-кампании для афиш')).toBeInTheDocument()
    expect(screen.getByText(/Заявку проверяет администратор платформы/)).toBeInTheDocument()
    expect(await nameField()).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Подать заявку' })).toBeEnabled()
  })

  it('sends the application without a name and then shows the pending state', async () => {
    let profile = user
    const bodies: unknown[] = []
    await signIn(() => profile)
    server.use(
      http.post(apiUrl('/organizers/apply'), async ({ request }) => {
        bodies.push(await request.json())
        profile = withOrganizer({ status: 'pending' })
        return HttpResponse.json(profile.organizer)
      }),
    )
    openPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Подать заявку' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Заявка на рассмотрении' }),
    ).toBeInTheDocument()
    expect(bodies).toEqual([{ display_name: null }])
    expect(screen.queryByRole('button', { name: 'Подать заявку' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Перейти в каталог' })).toHaveAttribute('href', '/')
    // the yellow status badge: color, icon and text together
    const badge = document.querySelector('[data-kind="organizerApplication"]')
    expect(badge).toHaveAttribute('data-status', 'pending')
    expect(badge).toHaveTextContent('На рассмотрении')
  })

  it('sends the public name without the spaces around it', async () => {
    let profile = user
    const bodies: unknown[] = []
    await signIn(() => profile)
    server.use(
      http.post(apiUrl('/organizers/apply'), async ({ request }) => {
        bodies.push(await request.json())
        profile = withOrganizer({ status: 'pending', display_name: 'Almaty Jazz Club' })
        return HttpResponse.json(profile.organizer)
      }),
    )
    openPage()

    fireEvent.change(await nameField(), { target: { value: '  Almaty Jazz Club ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подать заявку' }))

    await screen.findByRole('heading', { level: 1, name: 'Заявка на рассмотрении' })
    expect(bodies).toEqual([{ display_name: 'Almaty Jazz Club' }])
  })

  it.each(['A', 'x'.repeat(101)])(
    'refuses a public name of the wrong length (%s) before sending',
    async (value) => {
      let requests = 0
      await signIn(() => user)
      server.use(
        http.post(apiUrl('/organizers/apply'), () => {
          requests++
          return HttpResponse.json({})
        }),
      )
      openPage()

      const field = await nameField()
      fireEvent.change(field, { target: { value } })
      fireEvent.click(screen.getByRole('button', { name: 'Подать заявку' }))

      await waitFor(() => expect(field).toBeInvalid())
      expect(field).toHaveAccessibleDescription('От 2 до 100 символов.')
      expect(requests).toBe(0)
    },
  )

  it("puts the server's field problem under the name", async () => {
    await signIn(() => user)
    server.use(
      http.post(apiUrl('/organizers/apply'), () =>
        HttpResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'Invalid data',
            fields: { display_name: 'String should have at least 2 characters' },
          },
          { status: 422 },
        ),
      ),
    )
    openPage()

    const field = await nameField()
    fireEvent.change(field, { target: { value: 'Ok' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подать заявку' }))

    await waitFor(() => expect(field).toBeInvalid())
    expect(field).toHaveAccessibleDescription('Проверьте это поле')
  })

  it('shows an unexpected error and keeps the form', async () => {
    await signIn(() => user)
    server.use(
      http.post(apiUrl('/organizers/apply'), () =>
        HttpResponse.json(
          { error: 'DatabaseUnavailableError', message: 'down', fields: null },
          { status: 503 },
        ),
      ),
    )
    openPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Подать заявку' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/.+/)
    expect(screen.getByRole('button', { name: 'Подать заявку' })).toBeEnabled()
  })

  it('reads the real status again when the application already exists (409)', async () => {
    let profile = user
    await signIn(() => profile)
    server.use(
      http.post(apiUrl('/organizers/apply'), () => {
        // sent from another device in the meantime
        profile = withOrganizer({ status: 'pending' })
        return HttpResponse.json(
          {
            error: 'OrganizerProfileAlreadyExistsError',
            message: 'exists',
            fields: null,
          },
          { status: 409 },
        )
      }),
    )
    openPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Подать заявку' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Заявка на рассмотрении' }),
    ).toBeInTheDocument()
  })

  it('shows the rejection reason and lets the user apply again with the same name', async () => {
    let profile = withOrganizer({
      status: 'rejected',
      display_name: 'Almaty Jazz Club',
      rejection_reason: 'Не удалось подтвердить организацию.',
    })
    const bodies: unknown[] = []
    await signIn(() => profile)
    server.use(
      http.post(apiUrl('/organizers/apply'), async ({ request }) => {
        bodies.push(await request.json())
        profile = withOrganizer({ status: 'pending', display_name: 'Almaty Jazz Club' })
        return HttpResponse.json(profile.organizer)
      }),
    )
    openPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Заявка отклонена' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Не удалось подтвердить организацию.')).toBeInTheDocument()
    expect(document.querySelector('[data-kind="organizerApplication"]')).toHaveAttribute(
      'data-status',
      'rejected',
    )
    expect(await nameField()).toHaveValue('Almaty Jazz Club')

    fireEvent.click(screen.getByRole('button', { name: 'Подать снова' }))

    await screen.findByRole('heading', { level: 1, name: 'Заявка на рассмотрении' })
    expect(bodies).toEqual([{ display_name: 'Almaty Jazz Club' }])
  })

  it('shows a rejection without a reason', async () => {
    await signIn(() => withOrganizer({ status: 'rejected', rejection_reason: null }))
    openPage()

    await screen.findByRole('heading', { level: 1, name: 'Заявка отклонена' })
    expect(screen.queryByText('Причина отказа')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Подать снова' })).toBeInTheDocument()
  })

  it('shows the approved state with a way into the workspace', async () => {
    await signIn(() => withOrganizer({ status: 'approved' }))
    openPage()

    await screen.findByRole('heading', { level: 1, name: 'Заявка одобрена' })
    expect(screen.getByRole('link', { name: 'Открыть кабинет организатора' })).toHaveAttribute(
      'href',
      '/organizer',
    )
    expect(screen.queryByRole('button', { name: 'Подать заявку' })).not.toBeInTheDocument()
  })

  it.each([
    ['kk', 'Ұйымдастырушы болу', 'Өтінім беру'],
    ['en', 'Become an organizer', 'Apply'],
  ])('shows the page in %s', async (language, heading, submit) => {
    await i18n.changeLanguage(language)
    await signIn(() => user)
    openPage()

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: submit })).toBeInTheDocument()
  })

  it('shows an error with a retry button when the profile cannot be read', async () => {
    let failing = true
    await signIn(() => user)
    server.use(
      http.get(apiUrl('/auth/me'), () =>
        failing
          ? HttpResponse.json(
              { error: 'DatabaseUnavailableError', message: 'down', fields: null },
              { status: 503 },
            )
          : HttpResponse.json(user),
      ),
    )
    openPage()

    const retry = await screen.findByRole('button', { name: 'Повторить' })
    failing = false
    fireEvent.click(retry)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Стать организатором' }),
    ).toBeInTheDocument()
  })
})

describe('organizer workspace and the application status', () => {
  beforeEach(() => {
    sessionStore.clearSession()
    setRequestSession(sessionStore)
  })
  afterEach(() => {
    sessionStore.clearSession()
    setRequestSession(null)
  })

  it.each([
    ['without an application', user],
    ['with a rejected application', withOrganizer({ status: 'rejected' })],
  ])('sends a user %s from /organizer to /become-organizer', async (_name, profile) => {
    await signIn(() => profile)
    const { container } = openPage('/organizer')

    await screen.findByRole('heading', { level: 1 })
    await waitFor(() =>
      expect(container.querySelector('[data-route-id]')).toHaveAttribute(
        'data-route-id',
        'become-organizer',
      ),
    )
  })

  it('lets a rejected user reach the application page from the account menu', async () => {
    await signIn(() => withOrganizer({ status: 'rejected' }))
    openPage('/my/orders')

    const link = await screen.findByRole('link', { name: 'Заявка организатора отклонена' })
    expect(link).toHaveAttribute('href', '/become-organizer')
  })
})
