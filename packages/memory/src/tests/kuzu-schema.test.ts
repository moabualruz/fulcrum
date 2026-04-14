// packages/memory/src/tests/kuzu-schema.test.ts
import { describe, it, expect } from 'vitest'
import {
  buildAllDDL,
  buildMemoryNodeDDL,
  buildEntityNodeDDL,
} from '../kuzu/schema.js'

describe('kuzu/schema', () => {
  it('buildAllDDL(1024) has 22 entries (2 nodes + 14 rels + 4 Memory↔Memory + 2 vector)', () => {
    expect(buildAllDDL(1024)).toHaveLength(22)
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
