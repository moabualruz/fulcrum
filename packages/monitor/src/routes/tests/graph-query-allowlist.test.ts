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
})
