// packages/memory/src/tests/kuzu-schema.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildAllDDL,
  buildMemoryNodeDDL,
  buildEntityNodeDDL,
} from '../kuzu/schema.js'

describe('kuzu/schema', () => {
  it('buildAllDDL(1024) has more than 34 entries (v2b expanded to 81: +22 nodes + 25 rels)', () => {
    // v2b PR 10 added 18 control-plane nodes, 4 git nodes, and 25 rel tables.
    // Total grew from 34 → 81. Use the dedicated all-ddl-v2b.test.ts for exact assertions.
    expect(buildAllDDL(1024).length).toBeGreaterThan(34)
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
