import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('code index utilization', () => {
  const root = process.cwd()

  it('routes batch and PCI consumers through the shared file-level primitive', () => {
    const ingest = readFileSync(join(root, 'src/ingest.ts'), 'utf8')
    const pci = readFileSync(join(root, 'src/pci/syncer.ts'), 'utf8')
    const primitive = readFileSync(join(root, 'src/l2/code.ts'), 'utf8')

    expect(primitive).toContain('export async function indexCodeFile')
    expect(ingest).toMatch(/indexCodeFile/)
    expect(pci).toMatch(/indexCodeFile/)
  })
})
