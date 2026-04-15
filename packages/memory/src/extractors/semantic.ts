// packages/memory/src/extractors/semantic.ts
// Track 2 — LLM async extraction
// Extracts semantic edges (ABOUT, CRITIQUES, RECOMMENDS, AVOIDS, CAUSES, PREVENTS)
// from memory content using the Anthropic Messages API.

export interface SemanticEdge {
  fromId: string
  toEntityId: string
  edgeType: 'ABOUT' | 'CRITIQUES' | 'RECOMMENDS' | 'AVOIDS' | 'CAUSES' | 'PREVENTS'
  confidence: number
  source: 'llm'
}

interface LLMEntity {
  name: string
  type: string
  description: string
}

interface LLMRelationship {
  subject: string
  predicate: 'ABOUT' | 'CRITIQUES' | 'RECOMMENDS' | 'AVOIDS' | 'CAUSES' | 'PREVENTS'
  object: string
}

interface LLMResponse {
  entities: LLMEntity[]
  relationships: LLMRelationship[]
}

const VALID_EDGE_TYPES = new Set(['ABOUT', 'CRITIQUES', 'RECOMMENDS', 'AVOIDS', 'CAUSES', 'PREVENTS'])

function buildPrompt(content: string): string {
  return `Extract entities and relationships from the following text.

Return ONLY valid JSON with this structure:
{
  "entities": [
    { "name": "string", "type": "technology|concept|pattern|library|tool|person|organization", "description": "string" }
  ],
  "relationships": [
    { "subject": "entity name", "predicate": "ABOUT|CRITIQUES|RECOMMENDS|AVOIDS|CAUSES|PREVENTS", "object": "entity name" }
  ]
}

Guidelines:
- "subject" and "object" must match entity names from the entities list
- Use ABOUT for general topics, CRITIQUES for negative assessments, RECOMMENDS for positive endorsements
- Use AVOIDS for things to steer clear of, CAUSES for causal relationships, PREVENTS for preventative relationships
- Only include relationships where both subject and object appear in the entities list
- Keep entity names concise and canonical

Text:
${content}`
}

/**
 * Extract semantic edges from memory content using the Anthropic Messages API.
 * Returns [] if ANTHROPIC_API_KEY is not set, the API call fails, or parsing fails.
 * Never throws.
 */
export async function extractSemantic(
  memoryId: string,
  content: string,
  _workspaceId: string
): Promise<SemanticEdge[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return []
  }

  if (!content || content.length < 50) {
    return []
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    let response: Response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: buildPrompt(content),
            },
          ],
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      console.error(`[semantic-extractor] Anthropic API error: ${response.status} ${response.statusText}`)
      return []
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any
    const rawText: string = data?.content?.[0]?.text ?? ''

    // Extract JSON from the response (may be wrapped in markdown code blocks)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('[semantic-extractor] Could not find JSON in LLM response')
      return []
    }

    let parsed: LLMResponse
    try {
      parsed = JSON.parse(jsonMatch[0]) as LLMResponse
    } catch {
      console.error('[semantic-extractor] Failed to parse JSON from LLM response')
      return []
    }

    if (!Array.isArray(parsed.relationships)) {
      return []
    }

    const entityNames = new Set<string>(
      (parsed.entities ?? []).map((e: LLMEntity) => e.name)
    )

    const edges: SemanticEdge[] = []
    for (const rel of parsed.relationships) {
      if (
        typeof rel.subject !== 'string' ||
        typeof rel.object !== 'string' ||
        !VALID_EDGE_TYPES.has(rel.predicate)
      ) {
        continue
      }

      // subject must be in the entities list (the memory itself is the "from" node)
      // We use the subject name as the toEntityId and let the pipeline resolve it
      if (!entityNames.has(rel.subject) && !entityNames.has(rel.object)) {
        continue
      }

      // The "object" entity is what the memory edge points to
      edges.push({
        fromId: memoryId,
        toEntityId: rel.object,
        edgeType: rel.predicate,
        confidence: 0.75,
        source: 'llm',
      })
    }

    return edges
  } catch (err) {
    console.error('[semantic-extractor] Extraction failed:', (err as Error).message)
    return []
  }
}
