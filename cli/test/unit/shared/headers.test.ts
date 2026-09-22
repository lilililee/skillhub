import { describe, expect, test } from 'bun:test'
import { parseHeaders } from '../../../src/shared/headers'

describe('parseHeaders', () => {
  test('supports single and repeated headers, colons, empty values, and case-insensitive replacement', () => {
    expect(parseHeaders()).toEqual({})
    expect(parseHeaders('SystemId: 206')).toEqual({ systemid: '206' })
    expect(parseHeaders(['SystemId: 100', 'systemid: 206', 'X-URL: https://example.com', 'X-Empty:']))
      .toEqual({ systemid: '206', 'x-url': 'https://example.com', 'x-empty': '' })
  })
  test('rejects malformed headers without exposing their values', () => {
    for (const value of ['secret', ': secret', 'Bad Name: secret', 'X: secret\r\nY: injected', 'X: secret\0']) {
      expect(() => parseHeaders(value)).toThrow('invalid --header')
      try { parseHeaders(value) } catch (error) {
        expect((error as Error).message).not.toContain('secret')
      }
    }
  })
})
