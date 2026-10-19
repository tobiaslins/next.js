import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

// A route handler doesn't render React, so it must not pull in the app-page
// runtime. It used to, because the patched `fetch` imported React for
// `React.cache`, which is only scoped to a request during a render.
describe('route-handler-no-page-runtime', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should respond from the route handler', async () => {
    const res = await next.fetch('/api/hello')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello from route handler')
  })

  it('should not trace the app-page runtime into the route handler', async () => {
    const nft = JSON.parse(
      await fs.promises.readFile(
        path.join(next.testDir, '.next/server/app/api/hello/route.js.nft.json'),
        'utf8'
      )
    )
    const files: string[] = nft.files
    expect(files.filter((file) => /app-page.*\.runtime\./.test(file))).toEqual(
      []
    )
  })
})
