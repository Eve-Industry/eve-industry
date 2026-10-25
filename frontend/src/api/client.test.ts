import { ApiError, unwrap } from './client'

describe('unwrap', () => {
  it('returns data on success', () => {
    expect(unwrap({ data: { ok: 1 }, response: new Response() })).toEqual({ ok: 1 })
  })

  it('throws ApiError carrying the code and validation errors', () => {
    const response = new Response(null, { status: 422 })
    const error = { message: 'Invalid', code: 'validation_failed', errors: { q: ['required'] } }
    try {
      unwrap({ error, response })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError)
      expect((e as ApiError).status).toBe(422)
      expect((e as ApiError).code).toBe('validation_failed')
      expect((e as ApiError).errors).toEqual({ q: ['required'] })
    }
  })
})
