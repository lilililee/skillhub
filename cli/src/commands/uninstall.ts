import { resolveRegistry } from '../services/registry-service'
import { ConfigStore } from '../stores/config-store'
import { InventoryStore, type InventoryItem } from '../stores/inventory-store'
import { CliError } from '../shared/errors'
import { EXIT } from '../shared/constants'
import { removeCommand, type RemoveCommandOptions } from './remove'

export type UninstallCommandOptions = Pick<
  RemoveCommandOptions,
  'agent' | 'all' | 'namespace' | 'registry' | 'header' | 'json'
>

export async function uninstallCommand(
  coordinate: string | undefined,
  options: UninstallCommandOptions
): Promise<string> {
  if (coordinate) return removeCommand(coordinate, options)
  if (options.all) {
    throw new CliError('--all requires a coordinate', EXIT.usage)
  }

  const selected = await selectInstalledSkills(options)
  if (selected.length === 0) {
    return options.json ? JSON.stringify({ ok: true, scope: 'local', removed: [] }) : 'No installed skills selected.'
  }

  const outputs: string[] = []
  for (const item of selected) {
    outputs.push(await removeCommand(`@${item.namespace}/${item.slug}`, {
      ...options,
      all: options.agent?.length ? undefined : true
    }))
  }
  if (!options.json) return outputs.filter(Boolean).join('\n')

  const removed = outputs.flatMap(output => {
    const payload = JSON.parse(output) as { removed?: unknown[] }
    return payload.removed ?? []
  })
  return JSON.stringify({ ok: true, scope: 'local', removed })
}

async function selectInstalledSkills(options: UninstallCommandOptions): Promise<InventoryItem[]> {
  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true && !options.json
  if (!interactive) {
    throw new CliError('provide an installed skill coordinate outside an interactive terminal', EXIT.usage)
  }

  const configStore = new ConfigStore()
  const registry = resolveRegistry(options, process.env, await configStore.read())
  const inventory = await new InventoryStore().read()
  const candidates = inventory.items.filter(item =>
    normalizeRegistry(item.registry) === normalizeRegistry(registry) &&
    (!options.namespace || item.namespace === options.namespace) &&
    (!options.agent?.length || item.targets.some(target => options.agent!.includes(target.agent)))
  )
  if (candidates.length === 0) return []

  const prompts = await import('prompts')
  const { selected } = await prompts.default({
    type: 'multiselect',
    name: 'selected',
    message: 'Select installed skills to uninstall',
    choices: candidates.map(item => ({
      title: `@${item.namespace}/${item.slug}@${item.version} (${item.targets.length} target${item.targets.length === 1 ? '' : 's'})`,
      value: `${item.namespace}\u0000${item.slug}`
    }))
  })
  const keys = new Set(Array.isArray(selected) ? selected as string[] : [])
  return candidates.filter(item => keys.has(`${item.namespace}\u0000${item.slug}`))
}

function normalizeRegistry(value: string): string {
  return value.replace(/\/+$/, '')
}
