// packages/memory/src/tests/kuzu-schema.test.ts
import { describe, it, expect } from 'vitest'
import {
  ALL_DDL,
  MEMORY_NODE_DDL,
  ENTITY_NODE_DDL,
  SCHEMA_DDL_WITHOUT_INDEXES,
} from '../kuzu/schema.js'

describe('kuzu/schema', () => {
  it('ALL_DDL has 22 entries (2 nodes + 14 rels + 4 Memory↔Memory + 2 vector)', () => {
    expect(ALL_DDL).toHaveLength(22)
  })

  it('MEMORY_NODE_DDL defines id as PRIMARY KEY', () => {
    expect(MEMORY_NODE_DDL).toContain('PRIMARY KEY (id)')
    expect(MEMORY_NODE_DDL).toContain('embedding FLOAT[1536]')
  })

  it('ENTITY_NODE_DDL defines aliases as STRING[]', () => {
    expect(ENTITY_NODE_DDL).toContain('aliases STRING[]')
    expect(ENTITY_NODE_DDL).toContain('mention_count INT64')
  })

  it('SCHEMA_DDL_WITHOUT_INDEXES excludes CREATE_VECTOR_INDEX calls', () => {
    for (const ddl of SCHEMA_DDL_WITHOUT_INDEXES) {
      expect(ddl).not.toContain('CREATE_VECTOR_INDEX')
    }
  })

  it('all DDL strings are non-empty', () => {
    for (const ddl of ALL_DDL) {
      expect(ddl.trim().length).toBeGreaterThan(0)
    }
  })
})
