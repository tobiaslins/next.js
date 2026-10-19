describe('io-utils', () => {
  it('does not load rendering modules until a render calls io()', () => {
    const loaded: string[] = []
    jest.isolateModules(() => {
      jest.doMock('../app-render/dynamic-rendering', () => {
        loaded.push('dynamic-rendering')
        return { abortOnSynchronousPlatformIOAccess: jest.fn() }
      })
      jest.doMock('../dynamic-rendering-utils', () => {
        loaded.push('dynamic-rendering-utils')
        return { applyOwnerStack: jest.fn() }
      })

      const { io } = require('./io-utils') as typeof import('./io-utils')
      expect(loaded).toEqual([])

      // Outside of a render there is no work store, so nothing is loaded.
      io('`Date.now()`', 'time')
      expect(loaded).toEqual([])
    })
  })
})
