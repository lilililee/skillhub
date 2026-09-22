import { describe, expect, mock, test } from 'bun:test'
import { SkillHubClient } from '../../../src/clients/skillhub-client'

describe('custom Registry headers', () => {
  test('supports raw token authentication for registries that do not accept Bearer', async () => {
    const calls: Array<{ headers: Headers }> = []
    const fetchImpl = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push({ headers: new Headers(init?.headers) })
      return Response.json({ handle: 'tester', displayName: 'Tester' })
    }) as unknown as typeof fetch

    const client = new SkillHubClient('https://registry.example.com', 'office-token', fetchImpl, {}, 'raw')
    await client.whoami()

    expect(calls[0]?.headers.get('Authorization')).toBe('office-token')
  })

  test('applies headers to JSON, download, multipart, metadata, and device flow requests', async () => {
    const requests: Request[] = []
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push(new Request(input, init))
      return Response.json({ data: {} })
    }) as typeof fetch
    const client = new SkillHubClient('https://registry.test/api/skillhub', 'test-token', fetchImpl, { SystemId: '206' })
    await client.whoami()
    await client.resolve('global', 'demo')
    await client.search('demo', 20)
    await client.download('global', 'demo', '1.0.0')
    await client.publish('global', new Blob(['zip']), 'PUBLIC')
    await client.validatePublish('global', new Blob(['zip']), 'PUBLIC')
    await client.deleteRemote('global', 'demo')
    await client.serverMetadata()
    await client.requestDeviceCode()
    await client.pollDeviceToken('device')
    await client.suiteDetail('global', 'demo')
    await client.suiteInstallPlan('global', 'demo')
    for (const request of requests) expect(request.headers.get('systemid')).toBe('206')
    expect(requests[0]!.headers.get('authorization')).toBe('Bearer test-token')
    expect(requests[4]!.headers.get('content-type')).toContain('multipart/form-data; boundary=')
    expect(requests[9]!.headers.get('content-type')).toBe('application/json')
    expect(requests[8]!.headers.get('authorization')).toBeNull()
  })

  test('explicit Authorization replaces the generated Bearer header', async () => {
    const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('raw-test-token')
      return Response.json({ data: {} })
    }) as typeof fetch
    await new SkillHubClient('https://registry.test', 'test-token', fetchImpl, { authorization: 'raw-test-token' }).whoami()
  })

  test('retains custom headers on same-registry redirects but strips them outside the registry', async () => {
    const requests: Request[] = []
    const fetchImpl = (async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push(new Request(input, init))
      if (requests.length === 1) return new Response(null, { status: 302, headers: { location: '/api/skillhub/archive' } })
      if (requests.length === 2) return new Response(null, { status: 302, headers: { location: 'https://storage.test/archive' } })
      return new Response('zip')
    }) as typeof fetch
    const client = new SkillHubClient('https://registry.test/api/skillhub', 'test-token', fetchImpl, { SystemId: '206', 'X-Secret': 'test-secret' })
    await client.download('global', 'demo')
    expect(requests[1]!.headers.get('systemid')).toBe('206')
    for (const key of ['systemid', 'authorization', 'x-secret']) expect(requests[2]!.headers.get(key)).toBeNull()
  })

  test('does not attach custom headers to a directly supplied external download URL', async () => {
    const fetchImpl = (async (_input: URL | RequestInfo, init?: RequestInit) => {
      expect([...new Headers(init?.headers)]).toEqual([])
      return new Response('zip')
    }) as typeof fetch
    await new SkillHubClient('https://registry.test', 'test-token', fetchImpl, { SystemId: '206' })
      .downloadFromUrl('https://storage.test/archive')
  })
})
