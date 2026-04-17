// packages/memory/src/entities.ts
import { getDb, FulcrumError, Db} from 'fulcrum-agent-core'
import type { MemoryEntity, LinkMemoryToEntityInput } from './types.js'

export async function linkMemoryToEntity(input: LinkMemoryToEntityInput, db: Db = getDb()): Promise<MemoryEntity> {
  const { memory_id, entity_type, entity_id, relation_type = 'subject_of' } = input

  // Verify memory exists
  const exists = db.prepare('SELECT 1 FROM memories WHERE memory_id = ?').get(memory_id)
  if (!exists) throw new FulcrumError(`Memory ${memory_id} not found`, 'not_found')

  db.prepare(`
    INSERT OR IGNORE INTO memory_entities (memory_id, entity_type, entity_id, relation_type)
    VALUES (?, ?, ?, ?)
  `).run(memory_id, entity_type, entity_id, relation_type)

  const row = db.prepare(
    'SELECT * FROM memory_entities WHERE memory_id = ? AND entity_type = ? AND entity_id = ?'
  ).get(memory_id, entity_type, entity_id) as Record<string, unknown>

  return {
    memory_id: row.memory_id as string,
    entity_type: row.entity_type as string,
    entity_id: row.entity_id as string,
    relation_type: row.relation_type as string,
  }
}

export async function getMemoryEntities(memory_id: string, db: Db = getDb()): Promise<MemoryEntity[]> {
  const rows = db.prepare(
    'SELECT * FROM memory_entities WHERE memory_id = ?'
  ).all(memory_id) as Record<string, unknown>[]
  return rows.map(row => ({
    memory_id: row.memory_id as string,
    entity_type: row.entity_type as string,
    entity_id: row.entity_id as string,
    relation_type: row.relation_type as string,
  }))
}
