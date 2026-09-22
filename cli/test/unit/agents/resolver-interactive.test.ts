import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { AgentCandidate } from '../../../src/agents/types'

interface PromptChoice {
  title: string
  value: AgentCandidate
}

interface PromptOptions {
  choices?: PromptChoice[]
  onRender?: (this: { cursor?: number }) => void
  format?: (selectedTargets: AgentCandidate[]) => AgentCandidate[]
}

const defaultSelectedTargets = (options: PromptOptions): AgentCandidate[] => options.format?.([]) ?? []
let selectPromptTargets = defaultSelectedTargets
let renderedChoices: PromptChoice[] = []

mock.module('prompts', () => ({
  default: (options: PromptOptions) => {
    renderedChoices = options.choices ?? []
    options.onRender?.call({ cursor: 1 })
    return { selected: selectPromptTargets(options) }
  }
}))

afterEach(() => {
  selectPromptTargets = defaultSelectedTargets
  renderedChoices = []
})

const { resolveInstallTargets } = await import('../../../src/agents/resolver')

describe('resolveInstallTargets interactive prompt', () => {
  test('offers supported project agents even when their directories do not exist yet', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skillhub-empty-project-'))

    try {
      await resolveInstallTargets({
        cwd: root,
        home: '/home/u',
        agents: [],
        scope: 'project',
        json: false,
        interactive: true
      })

      expect(renderedChoices.some(choice => choice.value.agent === 'kiro-cli')).toBe(true)
      expect(renderedChoices.some(choice => choice.value.agent === 'codex')).toBe(true)
      expect(renderedChoices.some(choice => choice.value.agent === 'claude-code')).toBe(true)
      expect(renderedChoices.map(choice => choice.value.agent)).toEqual(['kiro-cli', 'codex', 'claude-code'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('treats repeatable explicit agents as the final selection', async () => {
    const targets = await resolveInstallTargets({
      cwd: '/repo',
      home: '/home/u',
      agents: ['codex', 'claude-code'],
      scope: 'project',
      json: false,
      interactive: true
    })

    expect(targets.map(target => target.agent)).toEqual(['codex', 'claude-code'])
    expect(renderedChoices).toEqual([])
  })

  test('offers only the three preferred user agents even when other agents are installed', async () => {
    const home = await mkdtemp(join(tmpdir(), 'skillhub-astudio-resolver-'))
    const nativeRootDir = join(home, '.acode', 'skills')

    try {
      await mkdir(nativeRootDir, { recursive: true })
      await resolveInstallTargets({
        cwd: '/repo',
        home,
        agents: [],
        scope: 'user',
        json: false,
        interactive: true
      })

      expect(renderedChoices.map(choice => choice.value.agent)).toEqual(['kiro-cli', 'codex', 'claude-code'])
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('excludes an occupied preferred skill directory', async () => {
    const home = await mkdtemp(join(tmpdir(), 'skillhub-astudio-file-'))
    const rootDir = join(home, '.kiro', 'skills')

    try {
      await mkdir(join(home, '.kiro'), { recursive: true })
      await writeFile(rootDir, 'not a directory')
      await resolveInstallTargets({
        cwd: '/repo',
        home,
        agents: [],
        scope: 'user',
        json: false,
        interactive: true
      })

      expect(renderedChoices.some(choice => choice.value.agent === 'kiro-cli')).toBe(false)
      expect(renderedChoices.some(choice => choice.value.agent === 'generic')).toBe(false)
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  test('uses the highlighted target when Enter submits an empty multiselect', async () => {
    const detected: AgentCandidate[] = [
      { agent: 'codex', rootDir: '/repo/.codex/skills', scope: 'project', source: 'detected' },
      { agent: 'claude-code', rootDir: '/repo/.claude/skills', scope: 'project', source: 'detected' }
    ]
    const highlighted = detected[1]!

    const targets = await resolveInstallTargets({
      cwd: '/repo',
      agents: [],
      json: false,
      interactive: true,
      detected
    })

    expect(targets).toEqual([highlighted])
  })

  test('does not append generic to detected user targets', async () => {
    selectPromptTargets = options => options.choices?.map(choice => choice.value) ?? []
    const codex: AgentCandidate = {
      agent: 'codex',
      rootDir: '/home/u/.codex/skills',
      scope: 'user',
      source: 'detected'
    }
    const targets = await resolveInstallTargets({
      cwd: '/repo',
      home: '/home/u',
      agents: [],
      scope: 'user',
      json: false,
      interactive: true,
      detected: [codex]
    })

    expect(targets).toEqual([codex])
  })
})
