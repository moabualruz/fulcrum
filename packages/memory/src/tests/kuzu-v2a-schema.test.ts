import { describe, it, expect } from 'vitest'
import {
  buildAllDDL,
  buildFileNodeDDL,
  buildCodeChunkNodeDDL,
  buildSymbolNodeDDL,
  EDITS_DDL,
  ABOUT_FILE_DDL,
  ABOUT_SYMBOL_DDL,
  MENTIONS_SYMBOL_DDL,
  IMPORTS_DDL,
  CALLS_DDL,
  DEFINES_DDL,
  CONTAINED_IN_DDL,
  CODE_CHUNK_VECTOR_INDEX_DDL,
} from '../kuzu/schema.js'

describe('Kuzu v2a schema — PR 7 Task 35 (nodes)', () => {
  it('File node has the §3.3c columns', () => {
    const ddl = buildFileNodeDDL()
    expect(ddl).toContain('CREATE NODE TABLE IF NOT EXISTS File')
    for (const col of ['file_id', 'workspace_id', 'project_id', 'rel_path', 'language', 'sha256', 'mtime_ns', 'size_bytes', 'indexed_at']) {
      expect(ddl, `File column ${col} missing`).toContain(col)
    }
    expect(ddl).toContain('PRIMARY KEY (file_id)')
  })

  it('CodeChunk node carries embedding sized to the configured dims', () => {
    const ddl = buildCodeChunkNodeDDL(1024)
    expect(ddl).toContain('CREATE NODE TABLE IF NOT EXISTS CodeChunk')
    expect(ddl).toContain('embedding FLOAT[1024]')
    expect(ddl).toContain('PRIMARY KEY (chunk_id)')
  })

  it('Symbol node has composite-discriminator fields (file_id, name, kind, line)', () => {
    const ddl = buildSymbolNodeDDL()
    expect(ddl).toContain('CREATE NODE TABLE IF NOT EXISTS Symbol')
    for (const col of ['symbol_id', 'file_id', 'name', 'kind', 'line']) {
      expect(ddl, `Symbol column ${col} missing`).toContain(col)
    }
  })
})

describe('Kuzu v2a schema — PR 7 Task 36 (rel tables)', () => {
  const checks: Array<[string, string, string]> = [
    [EDITS_DDL, 'EDITS', 'FROM Memory TO File'],
    [ABOUT_FILE_DDL, 'ABOUT_FILE', 'FROM Memory TO File'],
    [ABOUT_SYMBOL_DDL, 'ABOUT_SYMBOL', 'FROM Memory TO Symbol'],
    [MENTIONS_SYMBOL_DDL, 'MENTIONS_SYMBOL', 'FROM Memory TO Symbol'],
    [IMPORTS_DDL, 'IMPORTS', 'FROM File TO File'],
    [CALLS_DDL, 'CALLS', 'FROM Symbol TO Symbol'],
    [DEFINES_DDL, 'DEFINES', 'FROM File TO Symbol'],
    [CONTAINED_IN_DDL, 'CONTAINED_IN', 'FROM CodeChunk TO File'],
  ]

  for (const [ddl, name, fromTo] of checks) {
    it(`${name} rel table targets ${fromTo}`, () => {
      expect(ddl).toContain(`CREATE REL TABLE IF NOT EXISTS ${name}`)
      expect(ddl).toContain(fromTo)
    })
  }
})

describe('buildAllDDL — v2a integration', () => {
  it('includes all v2a node + rel + vector-index DDLs', () => {
    const all = buildAllDDL(1024)
    const hasNode = (n: string) => all.some(d => d.includes(`NODE TABLE IF NOT EXISTS ${n}`))
    const hasRel = (n: string) => all.some(d => d.includes(`REL TABLE IF NOT EXISTS ${n}`))

    for (const n of ['Memory', 'Entity', 'File', 'CodeChunk', 'Symbol']) expect(hasNode(n), `node ${n} missing`).toBe(true)
    for (const n of ['EDITS', 'ABOUT_FILE', 'ABOUT_SYMBOL', 'MENTIONS_SYMBOL', 'IMPORTS', 'CALLS', 'DEFINES', 'CONTAINED_IN']) {
      expect(hasRel(n), `rel ${n} missing`).toBe(true)
    }
    expect(all).toContain(CODE_CHUNK_VECTOR_INDEX_DDL)
  })

  it('vector indexes run after node tables', () => {
    const all = buildAllDDL(1024)
    const codeChunkIdx = all.indexOf(CODE_CHUNK_VECTOR_INDEX_DDL)
    const codeChunkNode = all.findIndex(d => d.includes('NODE TABLE IF NOT EXISTS CodeChunk'))
    expect(codeChunkIdx).toBeGreaterThan(codeChunkNode)
  })
})
