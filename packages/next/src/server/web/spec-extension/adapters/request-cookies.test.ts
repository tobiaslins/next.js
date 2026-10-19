import type { RequestStore } from '../../../app-render/work-unit-async-storage.external'
import { RequestCookies, ResponseCookies } from '../cookies'
import {
  ReadonlyRequestCookiesError,
  RequestCookiesAdapter,
  MutableRequestCookiesAdapter,
} from './request-cookies'

describe('RequestCookiesAdapter', () => {
  it('should be able to create a new instance from a RequestCookies', () => {
    const headers = new Headers({ cookie: 'foo=bar; bar=foo' })
    const cookies = new RequestCookies(headers)

    const sealed = RequestCookiesAdapter.seal(cookies)
    expect(sealed).toBeInstanceOf(RequestCookies)

    expect(sealed.get('foo')).toEqual({ name: 'foo', value: 'bar' })
    expect(sealed.get('bar')).toEqual({ name: 'bar', value: 'foo' })

    // These methods are not available on the sealed instance
    expect(() => (sealed as any).set('foo', 'bar2')).toThrow(
      ReadonlyRequestCookiesError
    )
    expect(() => (sealed as any).delete('foo')).toThrow(
      ReadonlyRequestCookiesError
    )
    expect(() => (sealed as any).clear()).toThrow(ReadonlyRequestCookiesError)

    // Ensure nothing was actually changed.
    expect(sealed.get('foo')).toEqual({ name: 'foo', value: 'bar' })
    expect(sealed.get('bar')).toEqual({ name: 'bar', value: 'foo' })
  })
  it('should be able to create a new instance from an empty RequestCookies', () => {
    const headers = new Headers({})
    const cookies = new RequestCookies(headers)

    const sealed = RequestCookiesAdapter.seal(cookies)
    expect(sealed).toBeInstanceOf(RequestCookies)

    expect(sealed.get('foo')).toEqual(undefined)
    expect(sealed.get('bar')).toEqual(undefined)

    // These methods are not available on the sealed instance
    expect(() => (sealed as any).set('foo', 'bar2')).toThrow(
      ReadonlyRequestCookiesError
    )
    expect(() => (sealed as any).delete('foo')).toThrow(
      ReadonlyRequestCookiesError
    )
    expect(() => (sealed as any).clear()).toThrow(ReadonlyRequestCookiesError)

    // Ensure nothing was actually changed.
    expect(sealed.get('foo')).toEqual(undefined)
    expect(sealed.get('bar')).toEqual(undefined)
  })
})

describe('MutableRequestCookiesAdapter', () => {
  it('supports chained set calls and preserves wrapping', () => {
    const headers = new Headers({})
    const underlyingCookies = new RequestCookies(headers)
    const onUpdateCookies = jest.fn<void, [string[]]>()

    const wrappedCookies = MutableRequestCookiesAdapter.wrap(
      underlyingCookies,
      onUpdateCookies
    )

    const returned = wrappedCookies.set('foo', '1').set('bar', '2')

    expect(returned).toBe(wrappedCookies)
    expect(onUpdateCookies).toHaveBeenCalledWith([
      expect.stringContaining('foo=1'),
    ])
    expect(onUpdateCookies).toHaveBeenCalledWith([
      expect.stringContaining('foo=1'),
      expect.stringContaining('bar=2'),
    ])
  })

  it('supports chained delete calls and preserves wrapping', () => {
    const headers = new Headers({})
    const underlyingCookies = new RequestCookies(headers)
    underlyingCookies.set('foo', '1').set('bar', '2')

    const onUpdateCookies = jest.fn<void, [string[]]>()
    const wrappedCookies = MutableRequestCookiesAdapter.wrap(
      underlyingCookies,
      onUpdateCookies
    )

    const returned = wrappedCookies.delete('foo').delete('bar')

    expect(returned).toBe(wrappedCookies)
    expect(onUpdateCookies).toHaveBeenCalledWith([
      expect.stringContaining('foo=;'),
    ])
    expect(onUpdateCookies).toHaveBeenCalledWith([
      expect.stringContaining('foo=;'),
      expect.stringContaining('bar=;'),
    ])
  })
})

describe('wrapWithMutableAccessCheck', () => {
  let workUnitAsyncStorage: typeof import('../../../app-render/work-unit-async-storage.external').workUnitAsyncStorage
  let createCookiesWithMutableAccessCheck: typeof import('./request-cookies').createCookiesWithMutableAccessCheck

  beforeAll(() => {
    ;(globalThis as any).AsyncLocalStorage ??= (
      require('node:async_hooks') as typeof import('node:async_hooks')
    ).AsyncLocalStorage
    jest.resetModules()
    workUnitAsyncStorage = (
      require('../../../app-render/work-unit-async-storage.external') as typeof import('../../../app-render/work-unit-async-storage.external')
    ).workUnitAsyncStorage
    createCookiesWithMutableAccessCheck = (
      require('./request-cookies') as typeof import('./request-cookies')
    ).createCookiesWithMutableAccessCheck
  })

  const createMockRequestStore = (phase: RequestStore['phase']) => {
    const headers = new Headers({})
    const underlyingCookies = new ResponseCookies(headers)

    return {
      type: 'request',
      phase,
      mutableCookies: underlyingCookies,
    } as RequestStore
  }

  it('prevents setting cookies in the render phase', () => {
    const requestStore = createMockRequestStore('action')
    workUnitAsyncStorage.run(requestStore, () => {
      const cookies = createCookiesWithMutableAccessCheck(requestStore)

      // simulate changing phases
      requestStore.phase = 'render'

      const EXPECTED_ERROR =
        /Cookies can only be modified in a Server Action or Route Handler\./

      expect(() => {
        cookies.set('foo', '1')
      }).toThrow(EXPECTED_ERROR)

      expect(cookies.get('foo')).toBe(undefined)
    })
  })

  it('prevents deleting cookies in the render phase', () => {
    const requestStore = createMockRequestStore('action')
    workUnitAsyncStorage.run(requestStore, () => {
      const cookies = createCookiesWithMutableAccessCheck(requestStore)
      cookies.set('foo', '1')

      // simulate changing phases
      requestStore.phase = 'render'

      const EXPECTED_ERROR =
        /Cookies can only be modified in a Server Action or Route Handler\./

      expect(() => {
        cookies.delete('foo')
      }).toThrow(EXPECTED_ERROR)
      expect(cookies.get('foo')?.value).toEqual('1')
    })
  })
})

describe('MutableRequestCookiesAdapter.wrap copying request cookies', () => {
  const header = [
    'plain=1',
    'empty=',
    'equals=a=b=c',
    'spaces=hello%20world',
    'percent=100%25',
    'unicode=%E2%9C%93',
    'quoted="abc"',
    'jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
    `long=${'x'.repeat(500)}`,
  ].join('; ')

  // How the request cookies used to be copied: one `set` per cookie.
  function copyOneByOne(cookies: RequestCookies) {
    const responseCookies = new ResponseCookies(new Headers())
    for (const cookie of cookies.getAll()) {
      responseCookies.set(cookie)
    }
    return responseCookies
  }

  it('produces the same cookies as setting them one by one', () => {
    const requestCookies = new RequestCookies(new Headers({ cookie: header }))

    const expected = copyOneByOne(requestCookies)
    const actual = MutableRequestCookiesAdapter.wrap(requestCookies)

    expect(actual.getAll()).toEqual(expected.getAll())
    expect(actual.toString()).toEqual(expected.toString())
    expect((actual as any)._headers.getSetCookie()).toEqual(
      (expected as any)._headers.getSetCookie()
    )
  })

  it('still tracks cookies set after copying', () => {
    const requestCookies = new RequestCookies(new Headers({ cookie: header }))
    const actual = MutableRequestCookiesAdapter.wrap(requestCookies)

    actual.set('plain', '2')

    expect(actual.get('plain')?.value).toBe('2')
    expect(actual.get('equals')?.value).toBe('a=b=c')
  })
})
