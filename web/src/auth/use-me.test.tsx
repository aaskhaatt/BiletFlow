import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import { setRequestSession } from '@/api/access-token'
import type { CurrentUserResponse } from '@/api/generated/model'
import { sessionStore } from '@/auth/session-store'
import { useMe } from '@/auth/use-me'
import { apiUrl, server } from '@/test/msw-server'
import { renderWithProviders } from '@/test/render'

const attendee: CurrentUserResponse = {
  id: 1,
  email: 'attendee@example.test',
  email_verified: true,
  is_platform_admin: false,
  is_event_staff: false,
  organizer: null,
}

function CurrentProfile() {
  const { data } = useMe()
  return (
    <output>
      {data
        ? [data.id, data.organizer?.id ?? 'none', data.roles.showScanner, data.roles.isAdmin].join(
            ' / ',
          )
        : 'No profile'}
    </output>
  )
}

afterEach(() => {
  sessionStore.clearSession()
  setRequestSession(null)
})

it('derives scanner access independently from admin access and isolates each sign-in', async () => {
  const profiles: CurrentUserResponse[] = [
    { ...attendee, is_event_staff: true },
    {
      ...attendee,
      id: 2,
      is_platform_admin: true,
      organizer: { id: 25, user_id: 2, status: 'approved' },
    },
    { ...attendee, id: 3, is_platform_admin: true },
  ]
  let logins = 0
  let releaseLastProfile!: () => void
  const lastProfileReady = new Promise<void>((resolve) => {
    releaseLastProfile = resolve
  })
  setRequestSession(sessionStore)
  server.use(
    http.post(apiUrl('/auth/login'), () => {
      logins++
      return HttpResponse.json({
        access_token: 'access-' + logins,
        refresh_token: 'refresh-' + logins,
      })
    }),
    http.get(apiUrl('/auth/me'), async ({ request }) => {
      const index = Number(request.headers.get('Authorization')?.slice('Bearer access-'.length))
      if (index === 3) await lastProfileReady
      return HttpResponse.json(profiles[index - 1])
    }),
  )

  renderWithProviders(<CurrentProfile />)
  const signIn = () =>
    act(() => sessionStore.login({ email: attendee.email, password: 'test-password' }))

  await signIn()
  await screen.findByText('1 / none / true / false')
  await signIn()
  await screen.findByText('2 / 25 / true / true')
  try {
    await signIn()
    expect(screen.getByRole('status')).toHaveTextContent('No profile')
  } finally {
    releaseLastProfile()
  }
  await screen.findByText('3 / none / false / true')
})
