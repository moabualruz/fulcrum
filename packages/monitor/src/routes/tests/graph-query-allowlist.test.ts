import { describe, it, expect } from 'vitest'
import { validateCypher, CypherDeniedError } from '../graph-query.js'

describe('Cypher allowlist — disallowed patterns return 400', () => {
  const disallowed = [
    'CREATE (n:Foo {x: 1})',
    'MERGE (n:Memory {id: "x"}) SET n.content = "injected"',
    'DELETE (n)',
    'SET n.title = "pwned"',
    'LOAD CSV FROM "file:///etc/passwd" AS row RETURN row',
    'CALL { CREATE (n:Evil) }',
    'CALL apoc.util.sleep(5000)',
    "CALL java.lang.Runtime.exec('rm -rf /')",
  ]

  for (const cypher of disallowed) {
    it(`rejects: ${cypher.slice(0, 50)}`, () => {
      expect(() => validateCypher(cypher)).toThrow(CypherDeniedError)
    })
  }
})

describe('Cypher allowlist — allowed read patterns pass', () => {
  const allowed = [
    'MATCH (n:Memory) RETURN n LIMIT 10',
    'MATCH (n:File {path: $path})<-[:ABOUT_FILE]-(c:CodeChunk) RETURN c LIMIT 5',
    'MATCH (s:Symbol {name: $name})<-[:CALLS]-(caller) RETURN caller LIMIT 10',
    'MATCH (m:Memory)-[:ABOUT]->(f:File) RETURN m, f LIMIT 20',
    'RETURN 1 AS ok',
  ]

  for (const cypher of allowed) {
    it(`allows: ${cypher.slice(0, 50)}`, () => {
      expect(() => validateCypher(cypher)).not.toThrow()
    })
  }
})

describe('validateCypher', () => {
  it('is case-insensitive for keywords', () => {
    expect(() => validateCypher('create (n)')).toThrow(CypherDeniedError)
    expect(() => validateCypher('delete (n)')).toThrow(CypherDeniedError)
    expect(() => validateCypher('merge (n)')).toThrow(CypherDeniedError)
  })

  it('rejects empty query', () => {
    expect(() => validateCypher('')).toThrow(CypherDeniedError)
    expect(() => validateCypher('  ')).toThrow(CypherDeniedError)
  })

  it('rejects overly long queries (>2000 chars)', () => {
    expect(() => validateCypher('MATCH (n) RETURN n ' + 'x'.repeat(2000))).toThrow(CypherDeniedError)
  })

  // TEST-E: red-team corpus. Prior allowlist missed these vectors.
  describe('red-team (TEST-E)', () => {
    it('rejects COPY FROM (filesystem read)', () => {
      expect(() => validateCypher(`COPY mytable FROM '/etc/passwd' (HEADER=false)`)).toThrow(CypherDeniedError)
    })
    it('rejects COPY TO (filesystem write)', () => {
      expect(() => validateCypher(`COPY (MATCH (n) RETURN n) TO '/tmp/leak.csv'`)).toThrow(CypherDeniedError)
    })
    it('rejects REMOVE (property removal)', () => {
      expect(() => validateCypher(`MATCH (n) REMOVE n.secret RETURN n`)).toThrow(CypherDeniedError)
    })
    it('rejects DROP (schema wipe)', () => {
      expect(() => validateCypher(`DROP TABLE Memory`)).toThrow(CypherDeniedError)
    })
    it('rejects DETACH DELETE', () => {
      expect(() => validateCypher(`MATCH (n) DETACH DELETE n`)).toThrow(CypherDeniedError)
    })
    it('rejects LOAD EXTENSION', () => {
      expect(() => validateCypher(`LOAD EXTENSION httpfs`)).toThrow(CypherDeniedError)
    })
    it('rejects INSTALL / IMPORT / EXPORT DATABASE', () => {
      expect(() => validateCypher(`INSTALL httpfs`)).toThrow(CypherDeniedError)
      expect(() => validateCypher(`IMPORT DATABASE '/tmp/x'`)).toThrow(CypherDeniedError)
      expect(() => validateCypher(`EXPORT DATABASE '/tmp/x'`)).toThrow(CypherDeniedError)
    })
    it('rejects Unicode-fullwidth lookalike keywords', () => {
      // NFKD folds ＣＲＥＡＴＥ → CREATE → deny.
      expect(() => validateCypher('ＣＲＥＡＴＥ (n:Pwn)')).toThrow(CypherDeniedError)
    })
    it('rejects block-comment injection that buries CREATE', () => {
      expect(() => validateCypher(`MATCH (n) /* harmless */ CREATE (m) RETURN n`)).toThrow(CypherDeniedError)
    })
    it('rejects line-comment injection', () => {
      expect(() => validateCypher(`// decoy\nCREATE (n)`)).toThrow(CypherDeniedError)
    })
    it('rejects semicolon multi-statement', () => {
      expect(() => validateCypher(`MATCH (n) RETURN n; DROP TABLE Memory`)).toThrow(CypherDeniedError)
    })
    it('rejects when query does not start with an allowlisted lead keyword', () => {
      expect(() => validateCypher(`ORDER BY n RETURN n`)).toThrow(CypherDeniedError)
      expect(() => validateCypher(`LIMIT 5`)).toThrow(CypherDeniedError)
    })
    it('accepts exactly 2000 chars', () => {
      const q = 'MATCH (n) RETURN n ' + 'x'.repeat(2000 - 'MATCH (n) RETURN n '.length)
      expect(q.length).toBe(2000)
      expect(() => validateCypher(q)).not.toThrow()
    })
  })
})
