import { CliError } from './errors'
import { EXIT } from './constants'

/** Parse repeatable CLI headers without including potentially secret values in errors. */
export function parseHeaders(input?: string | string[]): Record<string, string> {
  const headers = new Headers()
  for (const entry of input === undefined ? [] : Array.isArray(input) ? input : [input]) {
    const separator = typeof entry === 'string' ? entry.indexOf(':') : -1
    if (separator <= 0 || /[\r\n\0]/.test(entry)) {
      throw new CliError('invalid --header; expected "Name: value"', EXIT.usage)
    }
    try {
      headers.set(entry.slice(0, separator).trim(), entry.slice(separator + 1).trim())
    } catch {
      throw new CliError('invalid --header name or value', EXIT.usage)
    }
  }
  return Object.fromEntries(headers.entries())
}
