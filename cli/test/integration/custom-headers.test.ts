import { rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'bun:test'
import { startFakeRegistry } from '../helpers/fake-registry'
import { createTempHome } from '../helpers/temp-env'
import { runCli } from '../helpers/run-cli'

test('repeatable --header reaches authentication, resolve, download, search, and upgrade without being persisted', async () => {
  const env = await createTempHome()
  const upstream = await startFakeRegistry({ token: 'test-token', user: { handle: 'test', displayName: 'Test' }, skills: [{ namespace: 'global', slug: 'demo', version: '1.0.0' }] })
  const paths: string[] = []
  const proxy = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      paths.push(url.pathname)
      if (request.headers.get('systemid') !== '206' || request.headers.get('x-test') !== 'with:colon') {
        return Response.json({ msg: 'missing custom headers' }, { status: 403 })
      }
      return fetch(new URL(url.pathname + url.search, upstream.url), { headers: request.headers })
    }
  })
  try {
    const shared = ['--registry', proxy.url.toString(), '--header', 'SystemId: 100', '--header', 'systemid: 206', '--header', 'X-Test: with:colon', '--json']
    const home = { HOME: env.home, USERPROFILE: env.home }
    const login = await runCli(['login', '--token', 'test-token', ...shared], home)
    expect(login.exitCode).toBe(0)
    const dir = join(env.cwd, 'skills')
    for (const args of [['install', 'demo', '--dir', dir], ['search', 'demo'], ['upgrade', 'demo', '--dir', dir, '--check']]) {
      const result = await runCli([...args, ...shared], home)
      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
    }
    expect(paths).toContain('/api/cli/v1/auth/whoami')
    expect(paths).toContain('/api/cli/v1/skills/global/demo/resolve')
    expect(paths).toContain('/api/cli/v1/skills/global/demo/versions/1.0.0/download')
    const config = await readFile(join(env.home, '.skillhub', 'config.json'), 'utf8')
    const credentials = await readFile(join(env.home, '.skillhub', 'credentials.json'), 'utf8')
    expect(config + credentials).not.toContain('with:colon')
  } finally {
    proxy.stop(true)
    upstream.stop()
    await rm(env.home, { recursive: true, force: true })
    await rm(env.cwd, { recursive: true, force: true })
  }
})

test('invalid --header fails with a usage error and does not echo its value', async () => {
  const result = await runCli(['search', '--header', 'secret-without-colon', '--json'])
  expect(result.exitCode).toBe(5)
  expect(result.stderr).toContain('invalid --header')
  expect(result.stderr).not.toContain('secret-without-colon')
})
