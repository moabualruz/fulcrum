import { createHash } from 'crypto'
import type { KuzuClient } from './client.js'
// MEM-009: EntityType is the single source of truth in structured.ts — import, don't redefine
import type { EntityType } from '../extractors/structured.js'
export type { EntityType }

const WORKSPACE_SCOPED_TYPES: ReadonlySet<EntityType> = new Set<EntityType>([
  'project', 'file', 'symbol', 'task', 'run',
])

export interface ResolvedEntity {
  id: string
  canonical_name: string
  type: EntityType
  scope: string   // 'global' | 'workspace:<id>'
  isNew: boolean
}

function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/[^\w/-]/g, '')
}

function parseWikilink(mention: string): { type: string; name: string } | null {
  // [[type/name]] format
  const match = mention.match(/^\[\[([^\]]+)\]\]$/)
  if (!match) return null
  const inner = match[1]!
  const slashIdx = inner.indexOf('/')
  if (slashIdx === -1) return { type: 'concept', name: inner }
  return { type: inner.slice(0, slashIdx), name: inner.slice(slashIdx + 1) }
}

function inferType(mention: string): EntityType {
  if (mention.startsWith('tsk_')) return 'task'
  if (mention.startsWith('run_')) return 'run'
  if (mention.startsWith('ws_')) return 'project'
  if (mention.startsWith('file_') || (mention.includes('/') && mention.endsWith('.ts'))) return 'file' // MEM-010: explicit precedence
  if (mention.startsWith('sym_')) return 'symbol'
  return 'concept'
}

function makeEntityId(type: string, canonicalName: string, scope: string): string {
  const key = scope === 'global'
    ? `${type}:${canonicalName}`
    : `${scope}:${type}:${canonicalName}`
  return createHash('sha256').update(key).digest('hex').slice(0, 32)
}

export async function resolveEntity(
  client: KuzuClient,
  mention: string,
  workspaceId: string
): Promise<ResolvedEntity> {
  // Step 1: Parse wikilink format or infer type from text
  const wikilink = parseWikilink(mention)
  let rawType: string
  let rawName: string

  if (wikilink) {
    rawType = wikilink.type
    rawName = wikilink.name
  } else {
    rawType = inferType(mention)
    rawName = mention
  }

  const canonicalName = normalizeText(rawName)
  const entityType = rawType as EntityType
  const isWorkspaceScoped = WORKSPACE_SCOPED_TYPES.has(entityType)
  const scope = isWorkspaceScoped ? `workspace:${workspaceId}` : 'global'
  const id = makeEntityId(entityType, canonicalName, scope)

  // Step 2: Check if entity already exists in Kuzu
  const existing = await client.query<{ e: { id: string } }>(
    `MATCH (e:Entity {id: $id}) RETURN e LIMIT 1`,
    { id }
  )

  if (existing.length > 0) {
    return {
      id,
      canonical_name: canonicalName,
      type: entityType,
      scope,
      isNew: false,
    }
  }

  // Step 3: Create new entity node
  const now = new Date().toISOString()
  await client.query(
    `CREATE (e:Entity {
      id: $id,
      canonical_name: $canonical_name,
      type: $type,
      scope: $scope,
      aliases: $aliases,
      description: $description,
      mention_count: 0,
      created_at: CAST($created_at AS TIMESTAMP),
      last_seen_at: CAST($last_seen_at AS TIMESTAMP)
    })`,
    {
      id,
      canonical_name: canonicalName,
      type: entityType,
      scope,
      aliases: [],
      description: '',
      created_at: now,
      last_seen_at: now,
    }
  )

  return { id, canonical_name: canonicalName, type: entityType, scope, isNew: true }
}

export async function incrementMentionCount(client: KuzuClient, entityId: string): Promise<void> {
  const now = new Date().toISOString()
  await client.query(
    `MATCH (e:Entity {id: $id})
     SET e.mention_count = e.mention_count + 1,
         e.last_seen_at = CAST($now AS TIMESTAMP)`,
    { id: entityId, now }
  )
}
