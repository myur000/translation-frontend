import { afterEach, describe, expect, it, vi } from 'vitest'
import { login } from '../api/auth.ts'
import { ApiClient, ApiClientError } from '../api/client.ts'
import { getDocumentHistory, uploadDocument } from '../api/documents.ts'
import { getProfile } from '../api/profile.ts'
import {
  downloadTranslation,
  getTranslationStatus,
} from '../api/translations.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('API client', () => {
  it('serializes JSON and adds a Bearer token', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = new ApiClient({
      baseUrl: 'https://api.example.test/api/',
      fetchImplementation,
    })

    await client.request('/protected', {
      method: 'POST',
      accessToken: 'test-token',
      json: { value: 42 },
    })

    const [url, init] = fetchImplementation.mock.calls[0]
    const headers = init.headers as Headers
    expect(url).toBe('https://api.example.test/api/protected')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"value":42}')
    expect(headers.get('Authorization')).toBe('Bearer test-token')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('normalizes backend errors and retry metadata', async () => {
    const backendError = {
      timestamp: '2026-10-04T00:00:00Z',
      status: 429,
      message: 'Слишком много запросов',
      path: '/api/auth/login',
      fieldErrors: {},
      correlation_id: 'correlation-42',
    }
    const client = new ApiClient({
      fetchImplementation: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(backendError), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '5',
          },
        }),
      ),
    })

    try {
      await client.request('/auth/login')
      throw new Error('Expected ApiClientError')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError)
      const apiError = error as ApiClientError
      expect(apiError.status).toBe(429)
      expect(apiError.message).toBe('Слишком много запросов')
      expect(apiError.correlationId).toBe('correlation-42')
      expect(apiError.retryAfterSeconds).toBe(5)
      expect(apiError.details).toEqual(backendError)
    }
  })
})

describe('domain API modules', () => {
  it('uses the login endpoint and returns the typed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'jwt-token',
          tokenType: 'Bearer',
          expiresIn: 900,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await login({
      email: 'reader@example.com',
      password: 'password123',
    })

    expect(response.accessToken).toBe('jwt-token')
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/login')
  })

  it('loads the authenticated user profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          user_id: '00000000-0000-0000-0000-000000000001',
          email: 'reader@example.com',
          username: 'reader',
          display_name: 'Reader',
          nickname: null,
          profession: null,
          bio: null,
          has_avatar: false,
          created_at: '2026-10-07T00:00:00Z',
          updated_at: '2026-10-07T00:00:00Z',
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const profile = await getProfile({ accessToken: 'jwt-token' })

    expect(profile.display_name).toBe('Reader')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/profile')
    expect((init.headers as Headers).get('Authorization')).toBe(
      'Bearer jwt-token',
    )
  })

  it('uploads a document as multipart without overriding its content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job_id: 'job-1' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['document'], 'book.pdf', {
      type: 'application/pdf',
    })

    await uploadDocument(
      { file, source_lang: 'en', target_lang: 'ru' },
      { accessToken: 'jwt-token' },
    )

    const [url, init] = fetchMock.mock.calls[0]
    const headers = init.headers as Headers
    const body = init.body as FormData
    expect(url).toBe('/api/documents/upload')
    expect(headers.get('Authorization')).toBe('Bearer jwt-token')
    expect(headers.has('Content-Type')).toBe(false)
    expect(body.get('file')).toBe(file)
    expect(body.get('source_lang')).toBe('en')
    expect(body.get('target_lang')).toBe('ru')
  })

  it('builds history and translation URLs from the contract', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [],
            page: 2,
            size: 10,
            total_elements: 0,
            total_pages: 0,
            first: false,
            last: true,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            job_id: 'job/with space',
            status: 'PROCESSING',
            progress: 45,
            error_code: null,
            error_message: null,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await getDocumentHistory({ accessToken: 'jwt-token' }, { page: 2, size: 10 })
    await getTranslationStatus('job/with space', {
      accessToken: 'jwt-token',
    })

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/documents/history?page=2&size=10',
    )
    expect(fetchMock.mock.calls[1][0]).toBe(
      '/api/documents/job%2Fwith%20space/status',
    )
  })

  it('returns a translated file together with response metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Blob(['translated']), {
        headers: {
          'Content-Disposition': "attachment; filename*=UTF-8''book_ru.pdf",
          'Content-Type': 'application/pdf',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await downloadTranslation('job-1', {
      accessToken: 'jwt-token',
    })

    expect(result.fileName).toBe('book_ru.pdf')
    expect(result.contentType).toBe('application/pdf')
    expect(result.blob.size).toBeGreaterThan(0)
  })
})
