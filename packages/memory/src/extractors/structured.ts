// packages/memory/src/extractors/structured.ts

export type EntityType =
  | 'technology' | 'concept' | 'pattern' | 'bug_class' | 'library'
  | 'language_feature' | 'person' | 'tool' | 'organization'
  | 'project' | 'file' | 'symbol' | 'task' | 'run'

export interface ExtractedMention {
  raw: string
  type: EntityType
  canonical: string
  confidence: number
  edgeType: 'MENTIONS' | 'PRODUCED_IN'
}

// Rule 1: [[type/name]] wikilinks
function extractWikilinks(content: string): ExtractedMention[] {
  const results: ExtractedMention[] = []
  const regex = /\[\[([^\]]+)\]\]/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const inner = match[1]!
    const slashIdx = inner.indexOf('/')
    const type = slashIdx === -1 ? 'concept' : inner.slice(0, slashIdx)
    const name = slashIdx === -1 ? inner : inner.slice(slashIdx + 1)
    results.push({
      raw: match[0],
      type: type as EntityType,
      canonical: name.toLowerCase().trim(),
      confidence: 0.9,
      edgeType: 'MENTIONS',
    })
  }
  return results
}

// Rule 2: ID prefixes
function extractIdPrefixes(content: string): ExtractedMention[] {
  const results: ExtractedMention[] = []
  const prefixRules: Array<[RegExp, EntityType]> = [
    [/\btsk_[a-zA-Z0-9_-]+/g, 'task'],
    [/\brun_[a-zA-Z0-9_-]+/g, 'run'],
    [/\bws_[a-zA-Z0-9_-]+/g, 'project'],
    [/\bsym_[a-zA-Z0-9_.-]+/g, 'symbol'],
    [/\bmem_[a-zA-Z0-9_-]+/g, 'concept'],
    [/\bfile_[a-zA-Z0-9_/.-]+/g, 'file'],
  ]
  for (const [regex, type] of prefixRules) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      results.push({
        raw: match[0],
        type,
        canonical: match[0].toLowerCase(),
        confidence: 0.85,
        edgeType: 'MENTIONS',
      })
    }
  }
  return results
}

// Rule 3: File paths — /path/to/file.ext or src/... relative paths
function extractFilePaths(content: string): ExtractedMention[] {
  const results: ExtractedMention[] = []
  const absRegex = /\/(?:[\w.-]+\/)*[\w.-]+\.(?:ts|js|py|rs|go|json|yaml|yml|md)\b/g
  const relRegex = /\b(?:src|packages|lib|dist)\/(?:[\w.-]+\/)*[\w.-]+\.(?:ts|js|py|rs|go)\b/g

  for (const regex of [absRegex, relRegex]) {
    let match: RegExpExecArray | null
    while ((match = regex.exec(content)) !== null) {
      results.push({
        raw: match[0],
        type: 'file',
        canonical: match[0].toLowerCase(),
        confidence: 0.8,
        edgeType: 'MENTIONS',
      })
    }
  }
  return results
}

// Rule 4: PRODUCED_IN edges from context
function extractProducedIn(context: {
  task_id?: string | null
  run_id?: string | null
}): ExtractedMention[] {
  const results: ExtractedMention[] = []
  if (context.task_id) {
    results.push({
      raw: context.task_id,
      type: 'task',
      canonical: context.task_id,
      confidence: 1.0,
      edgeType: 'PRODUCED_IN',
    })
  }
  if (context.run_id) {
    results.push({
      raw: context.run_id,
      type: 'run',
      canonical: context.run_id,
      confidence: 1.0,
      edgeType: 'PRODUCED_IN',
    })
  }
  return results
}

export function extractStructured(
  content: string,
  context: { task_id?: string | null; run_id?: string | null }
): ExtractedMention[] {
  const seen = new Set<string>()
  const results: ExtractedMention[] = []

  const all = [
    ...extractWikilinks(content),
    ...extractIdPrefixes(content),
    ...extractFilePaths(content),
    ...extractProducedIn(context),
  ]

  for (const mention of all) {
    const key = `${mention.edgeType}:${mention.type}:${mention.canonical}`
    if (!seen.has(key)) {
      seen.add(key)
      results.push(mention)
    }
  }

  return results
}
