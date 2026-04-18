// packages/memory/src/tests/vault-raw-curated.test.ts
//
// Memory v3 PR 1 unit 1.2 — writeRawFile + writeCuratedFile primitives.
// These are low-level filesystem primitives; frontmatter shape / validation
// live in PR 2 (L1 page) and are tested separately.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, statSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { writeRawFile, writeCuratedFile } from '../vault/client.js'

let tmpVault: string

beforeEach(() => {
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-vault-split-'))
})

afterEach(() => {
  rmSync(tmpVault, { recursive: true, force: true })
})

describe('writeRawFile', () => {
  it('writes under raw/ with 0600 file perms', () => {
    const rel = 'raw/bash_trace/2026/04/18/l0src_test.md'
    const full = writeRawFile(tmpVault, rel, 'hello world')
    expect(full).toBe(join(tmpVault, rel))
    expect(readFileSync(full, 'utf-8')).toBe('hello world')
    if (process.platform !== 'win32') {
      expect(statSync(full).mode & 0o777).toBe(0o600)
    }
  })

  it('rejects relativePath that does not start with raw/', () => {
    expect(() => writeRawFile(tmpVault, 'curated/x.md', 'x')).toThrow(/must start with 'raw\/'/)
    expect(() => writeRawFile(tmpVault, 'memories/x.md', 'x')).toThrow(/must start with 'raw\/'/)
  })

  it('rejects path escape attempts', () => {
    expect(() => writeRawFile(tmpVault, 'raw/../../etc/passwd', 'x')).toThrow(/escapes vault root/)
  })

  it('creates missing parent directories', () => {
    const rel = 'raw/tool_trace/2026/04/18/deeply/nested/file.md'
    writeRawFile(tmpVault, rel, 'content')
    expect(existsSync(join(tmpVault, rel))).toBe(true)
  })
})

describe('writeCuratedFile', () => {
  it('writes under curated/', () => {
    const rel = 'curated/pages/page_test.md'
    const full = writeCuratedFile(tmpVault, rel, '---\nschema: v3\n---\nbody')
    expect(full).toBe(join(tmpVault, rel))
    expect(readFileSync(full, 'utf-8')).toContain('body')
  })

  it('rejects relativePath that does not start with curated/', () => {
    expect(() => writeCuratedFile(tmpVault, 'raw/x.md', 'x')).toThrow(/must start with 'curated\/'/)
  })

  it('rejects path escape attempts', () => {
    expect(() => writeCuratedFile(tmpVault, 'curated/../../etc/passwd', 'x')).toThrow(/escapes vault root/)
  })
})
