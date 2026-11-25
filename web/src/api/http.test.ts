// @vitest-environment node
// The request layer needs no DOM, and Node's fetch needs Node's FormData and Blob.
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setRequestSession } from '@/api/access-token'
import { ApiError } from '@/api/errors'
import { apiBlob, apiCsv, apiFetch, apiUpload } from '@/api/http'
import { apiUrl, server } from '@/test/msw-server'

afterEach(() => setRequestSession(null))

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected the request to fail')
}

describe('apiFetch', () => {
  it('turns a 409 error body into an ApiError', async () => {
    server.use(
      http.post(apiUrl('/auth/register'), () =>
        HttpResponse.json(
          { error: 'UserAlreadyExistsError', message: 'User already exists', fields: null },
          { status: 409 },
        ),
      ),
    )

    const error = await caught(apiFetch('/auth/register', { method: 'POST', body: '{}' }))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      error: 'UserAlreadyExistsError',
      message: 'User already exists',
      fields: null,
    })
  })

  it('keeps the fields of a 422 VALIDATION_ERROR', async () => {
    server.use(
      http.post(apiUrl('/auth/register'), () =>
        HttpResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'Invalid data',
            fields: { email: 'value is not a valid email address' },
          },
          { status: 422 },
        ),
      ),
    )

    const error = await caught(apiFetch('/auth/register', { method: 'POST', body: '{}' }))

    expect(error).toMatchObject({
      status: 422,
      error: 'VALIDATION_ERROR',
      fields: { email: 'value is not a valid email address' },
    })
  })

  it('reports a body that is not our error format as UNKNOWN_ERROR', async () => {
    server.use(
      http.get(
        apiUrl('/events'),
        () => new HttpResponse('<html>Bad gateway</html>', { status: 502 }),
      ),
    )

    const error = await caught(apiFetch('/events'))

    expect(error).toMatchObject({ status: 502, error: 'UNKNOWN_ERROR' })
  })

  it('reports a failed connection as NETWORK_ERROR with status 0', async () => {
    server.use(http.get(apiUrl('/events'), () => HttpResponse.error()))

    const error = await caught(apiFetch('/events'))

    expect(error).toMatchObject({ status: 0, error: 'NETWORK_ERROR' })
  })

  it('sends the access token as a Bearer header', async () => {
    let authorization: string | null = null
    server.use(
      http.get(apiUrl('/auth/me'), ({ request }) => {
        authorization = request.headers.get('Authorization')
        return HttpResponse.json({ id: 1 })
      }),
    )
    setRequestSession({
      getCredentials: () => ({
        generation: 0,
        accessToken: 'token-123',
        expiresAt: null,
        canRefresh: false,
      }),
      refresh: vi.fn(),
      expire: vi.fn(),
    })

    const me = await apiFetch<{ id: number }>('/auth/me')

    expect(me).toEqual({ id: 1 })
    expect(authorization).toBe('Bearer token-123')
  })

  it('sends no Authorization header without a token', async () => {
    let hasAuthorization = true
    server.use(
      http.get(apiUrl('/events'), ({ request }) => {
        hasAuthorization = request.headers.has('Authorization')
        return HttpResponse.json({ items: [], total: 0 })
      }),
    )

    await apiFetch('/events')

    expect(hasAuthorization).toBe(false)
  })
})

describe('helpers for non-JSON requests', () => {
  it('apiUpload sends multipart form data with the browser-made boundary', async () => {
    let contentType = ''
    let fileName: string | undefined
    server.use(
      http.put(apiUrl('/events/1/image'), async ({ request }) => {
        contentType = request.headers.get('Content-Type') ?? ''
        const file = (await request.formData()).get('file')
        fileName = file instanceof File ? file.name : undefined
        return HttpResponse.json({ id: 1, image_url: 'https://example.test/cover.png' })
      }),
    )
    const form = new FormData()
    form.append('file', new File(['png'], 'cover.png', { type: 'image/png' }))

    await apiUpload('/events/1/image', form)

    expect(contentType).toMatch(/^multipart\/form-data; boundary=/)
    expect(fileName).toBe('cover.png')
  })

  it('apiBlob returns the PNG as a Blob', async () => {
    server.use(
      http.get(
        apiUrl('/tickets/7/qr'),
        () =>
          new HttpResponse(new Uint8Array([137, 80, 78, 71]), {
            headers: { 'Content-Type': 'image/png' },
          }),
      ),
    )

    const blob = await apiBlob('/tickets/7/qr')

    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(4)
  })

  it('apiCsv asks for format=csv and keeps the parameters', async () => {
    let search = ''
    server.use(
      http.get(apiUrl('/admin/users'), ({ request }) => {
        search = new URL(request.url).search
        return new HttpResponse('﻿id,email\n1,a@example.test\n', {
          headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        })
      }),
    )

    const blob = await apiCsv('/admin/users?q=a')

    expect(search).toBe('?q=a&format=csv')
    expect(blob.type).toBe('text/csv;charset=utf-8')
    expect(await blob.text()).toContain('a@example.test')
  })
})
