// packages/memory/src/tests/kuzu-schema.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildAllDDL,
  buildMemoryNodeDDL,
  buildEntityNodeDDL,
} from '../kuzu/schema.js'

describe('kuzu/schema', () => {
  it('buildAllDDL(1024) has 34 entries (v2a expansion: 5 nodes + 22 rels + 3 vec indexes)', () => {
    // v2a PR 7 added 3 nodes (File, CodeChunk, Symbol), 8 rels (EDITS,
    // ABOUT_FILE, ABOUT_SYMBOL, MENTIONS_SYMBOL, IMPORTS, CALLS, DEFINES,
    // CONTAINED_IN), and 1 vector index (CodeChunk). Total grew from 22 → 34.
    expect(buildAllDDL(1024)).toHaveLength(34)
  })

  it('buildMemoryNodeDDL uses the given dimensions', () => {
    expect(buildMemoryNodeDDL(1024)).toContain('PRIMARY KEY (id)')
    expect(buildMemoryNodeDDL(1024)).toContain('embedding FLOAT[1024]')
    expect(buildMemoryNodeDDL(1536)).toContain('embedding FLOAT[1536]')
  })

  it('buildEntityNodeDDL defines aliases as STRING[]', () => {
    expect(buildEntityNodeDDL(1024)).toContain('aliases STRING[]')
    expect(buildEntityNodeDDL(1024)).toContain('mention_count INT64')
    expect(buildEntityNodeDDL(1024)).toContain('embedding FLOAT[1024]')
  })

  it('buildAllDDL excludes CREATE_VECTOR_INDEX from non-index entries', () => {
    const allDdl = buildAllDDL(1024)
    const schemaDdl = allDdl.filter(d => !d.includes('CREATE_VECTOR_INDEX'))
    for (const ddl of schemaDdl) {
      expect(ddl).not.toContain('CREATE_VECTOR_INDEX')
    }
  })

  it('all DDL strings are non-empty', () => {
    for (const ddl of buildAllDDL(1024)) {
      expect(ddl.trim().length).toBeGreaterThan(0)
    }
  })
})
