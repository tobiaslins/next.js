import type { IncomingHttpHeaders } from 'node:http'
import { createRequestStoreForAPI } from './request-store'

function createStore(headers: IncomingHttpHeaders) {
  return createRequestStoreForAPI(
    { headers } as any,
    { pathname: '/api/test', search: '' } as any,
    { tags: [], expirationsByCacheKind: new Map() } as any,
    undefined,
    undefined,
    undefined
  )
}

describe('RequestStore mayHaveModifiedCookies', () => {
  it('is false until mutable cookies are read', () => {
    const store = createStore({ cookie: 'a=1; b=2' })

    expect(store.mayHaveModifiedCookies).toBe(false)

    store.mutableCookies.set('c', '3')
    expect(store.mayHaveModifiedCookies).toBe(true)
  })

  it('is true when middleware set cookies, which get merged in', () => {
    const store = createStore({
      cookie: 'a=1',
      'x-middleware-set-cookie': 'b=2; Path=/',
    })

    expect(store.mayHaveModifiedCookies).toBe(true)
  })
})
