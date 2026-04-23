import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url))

function readRepoFile(path: string): string {
  return readFileSync(`${repoRoot}/${path}`, 'utf8')
}

describe('RAG lifecycle quickstart command coverage', () => {
  it('documents the implemented operator commands from quickstart.md', () => {
    const quickstart = readRepoFile('specs/001-rag-lifecycle-hardening/quickstart.md')
    const cli = readRepoFile('packages/cli/src/index.ts')

    for (const command of [
      'fulcrum memory rebuild --all --mode plan --json',
      'fulcrum memory rebuild --all --mode dry-run --json',
      'fulcrum memory rebuild --all --execute --json',
      'fulcrum memory embed --scope memories --json',
      'fulcrum jobs status job_... --json',
      'fulcrum memory recall "why did rebuild fail" --explain --json',
      'fulcrum memory doctor --json',
      'fulcrum memory eval --suite rag-lifecycle --json',
    ]) {
      expect(quickstart).toContain(command)
    }

    for (const cliFragment of [
      "command === 'rebuild'",
      "args.includes('--execute')",
      "modeArg === 'dry-run'",
      "command === 'embed'",
      "scope as 'memories' | 'l1-pages' | 'code'",
      "command === 'doctor' || command === 'health'",
      "command === 'eval'",
      "input.explain = true",
      "command === 'status'",
      "command === 'retry'",
    ]) {
      expect(cli).toContain(cliFragment)
    }
  })
})
