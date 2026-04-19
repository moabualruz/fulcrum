// packages/memory/src/l1/curator.ts
//
// Memory v3 PR 3 unit 3.1 — curator runtime (prompt, schema, parser, dispatcher).
//
// Three responsibilities, one module:
//   1. composePrompt — builds the structured XML prompt for GPT-5.4-style
//      models. Every L0 body is wrapped in `<USER_CONTENT>` (constraint §14
//      delimiter isolation); correction entries are wrapped in
//      `<AGENT_CORRECTION>` so the model treats them as claims-to-verify,
//      not ground truth.
//   2. getOutputSchema — the JSON Schema that every backend constrains its
//      output to. Kept strict-mode compatible (additionalProperties:false,
//      all fields required, no allOf/if/then/else/const/pattern) so it works
//      unchanged across codex --output-schema, OpenAI Structured Outputs,
//      and Anthropic tool_use.
//   3. parseCuratorOutput + selectBackend + runCurator — glue layer. The
//      parser enforces Constraint #15 (curator sources must live in the
//      input batch) as defense-in-depth before the apply-layer (PR 3 unit
//      3.5) touches the vault.
//
// Backends (PR 3 units 3.2-3.4) register themselves via `registerBackend`.
// The registry is process-local; tests clear it between runs.

import { loadTemplate } from './templates/index.js'
import {
  L1_PAGE_TYPES,
  L1_RETENTION_TIERS,
  type L1PageType,
  type L1RetentionTier,
} from './frontmatter.js'
import { L0_SOURCE_TYPES, type L0SourceType } from '../l0/types.js'

// -----------------------------------------------------------------------------
// Prompt version pinning — Open Question #2. Every curator run stamps the L1
// page frontmatter with this value so later migrations can re-curate only
// pages written by an earlier prompt.
// -----------------------------------------------------------------------------

export const PROMPT_VERSION = 'v3.0.0'

// -----------------------------------------------------------------------------
// Per-task model + reasoning defaults. Env-overridable per the plan's
// §L0→L1 curation pipeline table.
// -----------------------------------------------------------------------------

export type CuratorTask = 'extraction' | 'consolidation' | 'synthesis'

export const TASK_DEFAULTS: Record<CuratorTask, { model: string; reasoning: string }> = {
  extraction: { model: 'gpt-5-mini', reasoning: 'minimal' },
  consolidation: { model: 'gpt-5-nano', reasoning: 'minimal' },
  synthesis: { model: 'gpt-5', reasoning: 'medium' },
}

function resolveTaskDefaults(task: CuratorTask): { model: string; reasoning: string } {
  const defaults = TASK_DEFAULTS[task]
  const taskKey = task.toUpperCase()
  const model =
    process.env[`FULCRUM_CURATOR_MODEL_${taskKey}`] ??
    process.env['FULCRUM_CURATOR_MODEL'] ??
    defaults.model
  const reasoning =
    process.env[`FULCRUM_CURATOR_REASONING_${taskKey}`] ??
    process.env['FULCRUM_CURATOR_REASONING'] ??
    defaults.reasoning
  return { model, reasoning }
}

// -----------------------------------------------------------------------------
// Public types — curator I/O.
// -----------------------------------------------------------------------------

export type CuratorBackendName = 'codex' | 'pi' | 'openai' | 'anthropic'

export interface L0SourceForCurator {
  source_id: string
  source_type: L0SourceType
  created_at: string
  body: string
}

export interface CuratorPageContext {
  page_id: string
  type: L1PageType
  content: string
}

export interface CorrectionForCurator {
  source_id: string
  page_id: string
  reason: string
  original_page_content: string
}

export interface CuratorInput {
  task: CuratorTask
  l0_sources: L0SourceForCurator[]
  related_pages?: CuratorPageContext[]
  corrections?: CorrectionForCurator[]
  workspace_id: string
  project_id?: string | null
  backend_override?: CuratorBackendName
  model_override?: string
  reasoning_override?: string
  timeout_ms?: number
}

export interface CuratorNewPage {
  type: L1PageType
  name: string | null
  title: string | null
  entity_type: string | null
  aliases: string[] | null
  confidence: number
  retention_tier: L1RetentionTier
  sources: string[]
  sources_via: string[]
  entities: string[]
  body: string
  // Plan §7.2 — page IDs this new page contradicts. Apply-layer auto-emits a
  // supersession when `confidence` ≥ the old page's confidence. Empty by
  // default; backwards-compatible with pre-7.2 curator outputs (parser
  // defaults missing to []).
  contradicts: string[]
}

export interface CuratorPageUpdate {
  page_id: string
  body: string | null
  confidence: number | null
  retention_tier: L1RetentionTier | null
  add_sources: string[]
  add_entities: string[]
}

export interface CuratorSupersession {
  old_page_id: string
  new_page: CuratorNewPage
  reason: string
}

export interface CuratorEdge {
  source_entity_id: string
  target_entity_id: string
  relation: string
  confidence: number
  source_ids: string[]
}

export interface CuratorOutput {
  new_pages: CuratorNewPage[]
  updates: CuratorPageUpdate[]
  supersessions: CuratorSupersession[]
  new_edges: CuratorEdge[]
}

export interface CuratorBackendInput {
  task: CuratorTask
  model: string
  reasoning: string
  prompt: string
  schema: Record<string, unknown>
  timeout_ms?: number
}

export interface CuratorBackendResult {
  raw_text: string
  backend: CuratorBackendName
  model: string
  duration_ms: number
  usage?: {
    input_tokens?: number
    cached_input_tokens?: number
    output_tokens?: number
  }
}

export interface CuratorBackend {
  readonly name: CuratorBackendName
  isAvailable(): Promise<boolean>
  curate(input: CuratorBackendInput): Promise<CuratorBackendResult>
}

// -----------------------------------------------------------------------------
// Prompt composition — XML-blocked per codex:gpt-5-4-prompting.
// -----------------------------------------------------------------------------

const TASK_INSTRUCTIONS: Record<CuratorTask, string> = {
  extraction:
    'Extract L1 curated pages from the raw L0 sources. Prefer creating one page per distinct entity/concept/summary that the sources ground. Sources may be noisy (raw command output, diffs, transcripts) — extract only what the source material actually supports.',
  consolidation:
    'Merge the provided related L1 pages into tighter, less-redundant shapes. Preserve every distinct claim; collapse duplicates. Do not add claims that the input pages do not already ground.',
  synthesis:
    'Produce synthesis pages that connect multiple L1 pages. Each synthesis page MUST populate sources_via (L1 page IDs) and MAY populate sources (L0 ULIDs that transitively ground the synthesis).',
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Compose the full curator prompt. Output is deterministic for a given input.
 * Every untrusted datum (L0 body, correction text, related-page content) is
 * wrapped in its own XML block so the model cannot be jailbroken by crafted
 * source material into treating it as instructions.
 */
export function composePrompt(input: CuratorInput): string {
  const templates = L1_PAGE_TYPES.map((t) => `<!-- type: ${t} -->\n${loadTemplate(t)}`).join('\n')
  const schema = JSON.stringify(getOutputSchema(), null, 2)

  const sourceBlocks = input.l0_sources
    .map((s) => {
      const attrs = [
        `source_id="${xmlEscape(s.source_id)}"`,
        `source_type="${xmlEscape(s.source_type)}"`,
        `created_at="${xmlEscape(s.created_at)}"`,
      ].join(' ')
      return `<USER_CONTENT ${attrs}>\n${s.body}\n</USER_CONTENT>`
    })
    .join('\n')

  const correctionBlocks = (input.corrections ?? [])
    .map((c) => {
      const attrs = [
        `source_id="${xmlEscape(c.source_id)}"`,
        `page_id="${xmlEscape(c.page_id)}"`,
      ].join(' ')
      return `<AGENT_CORRECTION ${attrs}>\nreason: ${c.reason}\n\noriginal_page:\n${c.original_page_content}\n</AGENT_CORRECTION>`
    })
    .join('\n')

  const relatedBlocks = (input.related_pages ?? [])
    .map((p) => {
      const attrs = [
        `page_id="${xmlEscape(p.page_id)}"`,
        `type="${xmlEscape(p.type)}"`,
      ].join(' ')
      return `<RELATED_PAGE ${attrs}>\n${p.content}\n</RELATED_PAGE>`
    })
    .join('\n')

  const parts: string[] = []
  parts.push(`<!-- prompt_version: ${PROMPT_VERSION} task: ${input.task} -->`)
  parts.push(`<task>\nYou are a curator for the Fulcrum agent OS memory system. ${TASK_INSTRUCTIONS[input.task]}\n\nOutput a single JSON object matching the provided schema. Every new_pages[i].sources[j] MUST match the source_id attribute of one of the <USER_CONTENT> or <AGENT_CORRECTION> blocks below — fabricated ULIDs are rejected by a post-curator validator.\n\nWorkspace context: workspace_id=${xmlEscape(input.workspace_id)}, project_id=${xmlEscape(input.project_id ?? 'null')}.\n</task>`)

  parts.push(`<templates>\nEvery new page MUST match one of the four templates below. Fill every \`{{PLACEHOLDER}}\` — placeholders left in the body are rejected by the validator.\n\n${templates}\n</templates>`)

  parts.push(`<structured_output_contract>\nReturn EXACTLY one JSON object matching the schema below. No prose, no code fences, no commentary.\n\n${schema}\n</structured_output_contract>`)

  parts.push(`<sources>\n${sourceBlocks || '(no sources)'}\n</sources>`)

  if (correctionBlocks.length > 0) {
    parts.push(`<corrections>\n${correctionBlocks}\n</corrections>`)
  }

  if (relatedBlocks.length > 0) {
    parts.push(`<related_pages>\n${relatedBlocks}\n</related_pages>`)
  }

  parts.push(`<default_follow_through_policy>\nDefault to the most conservative interpretation. If a sentence in an L0 source is ambiguous, lower the extracted claim's confidence rather than guessing. NEVER fabricate sources[] entries — every sources[] ULID MUST match a source_id attribute on one of the source blocks above.\n</default_follow_through_policy>`)

  parts.push(`<grounding_rules>\nGround every claim in a new_page's body in at least one <USER_CONTENT> block and cite it via an inline \`[[raw/<source_type>/YYYY/MM/DD/<ULID>]]\` wikilink. Do not treat <AGENT_CORRECTION> blocks as ground truth — they are claims to verify against the original sources; only supersede a page when other sources corroborate the correction.\n</grounding_rules>`)

  parts.push(`<verification_loop>\nBefore finalizing: check that every new_pages[i].sources[j] appears as a source_id on one of the source blocks above, that confidence values are in [0.0, 1.0], and that retention_tier is one of ${L1_RETENTION_TIERS.join(', ')}. If any check fails, revise the output.\n</verification_loop>`)

  return parts.join('\n\n')
}

// -----------------------------------------------------------------------------
// JSON Schema — strict-mode compatible (works for codex --output-schema,
// OpenAI Structured Outputs, Anthropic tool_use).
// -----------------------------------------------------------------------------

function enumType(values: readonly string[]): Record<string, unknown> {
  return { type: 'string', enum: [...values] }
}

function nullableString(): Record<string, unknown> {
  return { type: ['string', 'null'] }
}

function nullableEnum(values: readonly string[]): Record<string, unknown> {
  return { type: ['string', 'null'], enum: [...values, null] }
}

function stringArray(): Record<string, unknown> {
  return { type: 'array', items: { type: 'string' } }
}

function nullableStringArray(): Record<string, unknown> {
  return {
    type: ['array', 'null'],
    items: { type: 'string' },
  }
}

const NEW_PAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'type',
    'name',
    'title',
    'entity_type',
    'aliases',
    'confidence',
    'retention_tier',
    'sources',
    'sources_via',
    'entities',
    'body',
    'contradicts',
  ],
  properties: {
    type: enumType(L1_PAGE_TYPES),
    name: nullableString(),
    title: nullableString(),
    entity_type: nullableString(),
    aliases: nullableStringArray(),
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    retention_tier: enumType(L1_RETENTION_TIERS),
    sources: stringArray(),
    sources_via: stringArray(),
    entities: stringArray(),
    body: { type: 'string' },
    contradicts: stringArray(),
  },
}

const UPDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['page_id', 'body', 'confidence', 'retention_tier', 'add_sources', 'add_entities'],
  properties: {
    page_id: { type: 'string' },
    body: nullableString(),
    confidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
    retention_tier: nullableEnum(L1_RETENTION_TIERS),
    add_sources: stringArray(),
    add_entities: stringArray(),
  },
}

const SUPERSESSION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['old_page_id', 'new_page', 'reason'],
  properties: {
    old_page_id: { type: 'string' },
    new_page: NEW_PAGE_SCHEMA,
    reason: { type: 'string' },
  },
}

const EDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['source_entity_id', 'target_entity_id', 'relation', 'confidence', 'source_ids'],
  properties: {
    source_entity_id: { type: 'string' },
    target_entity_id: { type: 'string' },
    relation: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    source_ids: stringArray(),
  },
}

/**
 * Return the JSON Schema every backend constrains curator output to. The
 * object is deep-cloned per call so consumers may mutate it freely.
 */
export function getOutputSchema(): Record<string, unknown> {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['new_pages', 'updates', 'supersessions', 'new_edges'],
    properties: {
      new_pages: { type: 'array', items: NEW_PAGE_SCHEMA },
      updates: { type: 'array', items: UPDATE_SCHEMA },
      supersessions: { type: 'array', items: SUPERSESSION_SCHEMA },
      new_edges: { type: 'array', items: EDGE_SCHEMA },
    },
  }
  return JSON.parse(JSON.stringify(schema)) as Record<string, unknown>
}

// -----------------------------------------------------------------------------
// Parser — structure + semantic validation (includes Constraint #15 check).
// -----------------------------------------------------------------------------

export class CuratorOutputParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CuratorOutputParseError'
  }
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim()
  // Fast path: raw is already JSON.
  try {
    return JSON.parse(trimmed)
  } catch {
    // Fall through to markdown-fence / preamble handling.
  }
  // Grab the first top-level `{...}` block. Tolerates ```json fences, numbered
  // list prefixes, or model preamble ("Here is the JSON:").
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new CuratorOutputParseError(
      `failed to parse curator output as JSON: no top-level object found`,
    )
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new CuratorOutputParseError(`failed to parse curator output as JSON: ${detail}`)
  }
}

function requireArray(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key]
  if (!Array.isArray(v)) {
    throw new CuratorOutputParseError(`curator output: '${key}' must be an array`)
  }
  return v
}

function requireString(v: unknown, path: string): string {
  if (typeof v !== 'string') {
    throw new CuratorOutputParseError(`${path} must be a string, got ${typeof v}`)
  }
  return v
}

function requireConfidence(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
    throw new CuratorOutputParseError(`${path} (confidence) must be a number in [0,1], got ${String(v)}`)
  }
  return v
}

function requireEnum<T extends string>(v: unknown, values: readonly T[], path: string): T {
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) {
    throw new CuratorOutputParseError(
      `${path} must be one of ${values.join(', ')}; got ${JSON.stringify(v)}`,
    )
  }
  return v as T
}

function optionalString(v: unknown, path: string): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') {
    throw new CuratorOutputParseError(`${path} must be a string or null, got ${typeof v}`)
  }
  return v
}

function optionalStringArray(v: unknown, path: string): string[] | null {
  if (v === null || v === undefined) return null
  if (!Array.isArray(v)) {
    throw new CuratorOutputParseError(`${path} must be an array of strings or null`)
  }
  return v.map((x, i) => requireString(x, `${path}[${i}]`))
}

function requireStringArray(v: unknown, path: string): string[] {
  if (!Array.isArray(v)) {
    throw new CuratorOutputParseError(`${path} must be an array of strings`)
  }
  return v.map((x, i) => requireString(x, `${path}[${i}]`))
}

function parseNewPage(raw: unknown, path: string): CuratorNewPage {
  if (!raw || typeof raw !== 'object') {
    throw new CuratorOutputParseError(`${path} must be an object`)
  }
  const o = raw as Record<string, unknown>
  return {
    type: requireEnum(o['type'], L1_PAGE_TYPES, `${path}.type`),
    name: optionalString(o['name'], `${path}.name`),
    title: optionalString(o['title'], `${path}.title`),
    entity_type: optionalString(o['entity_type'], `${path}.entity_type`),
    aliases: optionalStringArray(o['aliases'], `${path}.aliases`),
    confidence: requireConfidence(o['confidence'], path),
    retention_tier: requireEnum(
      o['retention_tier'],
      L1_RETENTION_TIERS,
      `${path}.retention_tier`,
    ),
    sources: requireStringArray(o['sources'], `${path}.sources`),
    sources_via: requireStringArray(o['sources_via'] ?? [], `${path}.sources_via`),
    entities: requireStringArray(o['entities'] ?? [], `${path}.entities`),
    body: requireString(o['body'], `${path}.body`),
    // Missing / absent contradicts is tolerated — older curator outputs may
    // not know about 7.2; always coerce to [].
    contradicts: requireStringArray(o['contradicts'] ?? [], `${path}.contradicts`),
  }
}

function parseUpdate(raw: unknown, path: string): CuratorPageUpdate {
  if (!raw || typeof raw !== 'object') {
    throw new CuratorOutputParseError(`${path} must be an object`)
  }
  const o = raw as Record<string, unknown>
  const confidenceRaw = o['confidence']
  let confidence: number | null = null
  if (confidenceRaw !== null && confidenceRaw !== undefined) {
    confidence = requireConfidence(confidenceRaw, `${path}.confidence`)
  }
  const retention = o['retention_tier']
  const retention_tier = retention === null || retention === undefined
    ? null
    : requireEnum(retention, L1_RETENTION_TIERS, `${path}.retention_tier`)
  return {
    page_id: requireString(o['page_id'], `${path}.page_id`),
    body: optionalString(o['body'], `${path}.body`),
    confidence,
    retention_tier,
    add_sources: requireStringArray(o['add_sources'] ?? [], `${path}.add_sources`),
    add_entities: requireStringArray(o['add_entities'] ?? [], `${path}.add_entities`),
  }
}

function parseSupersession(raw: unknown, path: string): CuratorSupersession {
  if (!raw || typeof raw !== 'object') {
    throw new CuratorOutputParseError(`${path} must be an object`)
  }
  const o = raw as Record<string, unknown>
  return {
    old_page_id: requireString(o['old_page_id'], `${path}.old_page_id`),
    new_page: parseNewPage(o['new_page'], `${path}.new_page`),
    reason: requireString(o['reason'], `${path}.reason`),
  }
}

function parseEdge(raw: unknown, path: string): CuratorEdge {
  if (!raw || typeof raw !== 'object') {
    throw new CuratorOutputParseError(`${path} must be an object`)
  }
  const o = raw as Record<string, unknown>
  return {
    source_entity_id: requireString(o['source_entity_id'], `${path}.source_entity_id`),
    target_entity_id: requireString(o['target_entity_id'], `${path}.target_entity_id`),
    relation: requireString(o['relation'], `${path}.relation`),
    confidence: requireConfidence(o['confidence'], `${path}.confidence`),
    source_ids: requireStringArray(o['source_ids'] ?? [], `${path}.source_ids`),
  }
}

/**
 * Parse the backend's raw textual output into a validated CuratorOutput. Raises
 * `CuratorOutputParseError` on shape or semantic (Constraint #15) failures.
 *
 * Allowlist rule (Constraint #15): every `new_pages[i].sources[j]` and every
 * `supersessions[i].new_page.sources[j]` must match a source_id on the input
 * batch — the union of `input.l0_sources[].source_id` and
 * `input.corrections[].source_id`. Defense-in-depth beyond the validator
 * in l1/validator.ts (which also checks this at DB write time).
 */
export function parseCuratorOutput(raw_text: string, input: CuratorInput): CuratorOutput {
  const parsed = extractJsonObject(raw_text)
  if (!parsed || typeof parsed !== 'object') {
    throw new CuratorOutputParseError('curator output is not an object')
  }
  const o = parsed as Record<string, unknown>
  if (!('new_pages' in o)) {
    throw new CuratorOutputParseError("curator output missing required key 'new_pages'")
  }

  const newPages = requireArray(o, 'new_pages').map((p, i) => parseNewPage(p, `new_pages[${i}]`))
  const updates = requireArray(o, 'updates').map((p, i) => parseUpdate(p, `updates[${i}]`))
  const supersessions = requireArray(o, 'supersessions').map((p, i) =>
    parseSupersession(p, `supersessions[${i}]`),
  )
  const newEdges = requireArray(o, 'new_edges').map((p, i) => parseEdge(p, `new_edges[${i}]`))

  // Constraint #15 — curator sources must live in the input batch.
  const allowlist = new Set<string>([
    ...input.l0_sources.map((s) => s.source_id),
    ...(input.corrections ?? []).map((c) => c.source_id),
  ])
  const checkAllowlist = (ids: string[], path: string): void => {
    for (const id of ids) {
      if (!allowlist.has(id)) {
        throw new CuratorOutputParseError(
          `${path}: source '${id}' was not in the curator input batch (Constraint #15)`,
        )
      }
    }
  }
  newPages.forEach((p, i) => checkAllowlist(p.sources, `new_pages[${i}].sources`))
  supersessions.forEach((s, i) =>
    checkAllowlist(s.new_page.sources, `supersessions[${i}].new_page.sources`),
  )
  updates.forEach((u, i) => checkAllowlist(u.add_sources, `updates[${i}].add_sources`))
  newEdges.forEach((e, i) => checkAllowlist(e.source_ids, `new_edges[${i}].source_ids`))

  return {
    new_pages: newPages,
    updates,
    supersessions,
    new_edges: newEdges,
  }
}

// -----------------------------------------------------------------------------
// Backend registry + selection.
// -----------------------------------------------------------------------------

const BACKEND_ORDER: readonly CuratorBackendName[] = ['codex', 'pi', 'openai', 'anthropic']

const BACKENDS = new Map<CuratorBackendName, CuratorBackend>()

export function registerBackend(backend: CuratorBackend): void {
  BACKENDS.set(backend.name, backend)
}

export function getBackend(name: CuratorBackendName): CuratorBackend | null {
  return BACKENDS.get(name) ?? null
}

export function listBackends(): CuratorBackendName[] {
  return [...BACKENDS.keys()]
}

/** Test-only — wipes the registry so each test starts with an empty slate. */
export function clearBackendsForTest(): void {
  BACKENDS.clear()
}

/**
 * Resolve the effective backend for this run. Order:
 *   1. `input.backend_override`, if set.
 *   2. `FULCRUM_CURATOR_BACKEND` env var, if set.
 *   3. Fallback list: codex → pi → openai → anthropic. First available wins.
 *
 * Throws with install instructions when no backend is available.
 */
export async function selectBackend(input: CuratorInput): Promise<CuratorBackend> {
  const explicit = input.backend_override ?? (process.env['FULCRUM_CURATOR_BACKEND'] as
    | CuratorBackendName
    | undefined)
  if (explicit) {
    const backend = getBackend(explicit)
    if (!backend) {
      throw new Error(
        `curator backend '${explicit}' is not registered. Available: ${listBackends().join(', ') || '(none)'}.`,
      )
    }
    return backend
  }

  for (const name of BACKEND_ORDER) {
    const backend = getBackend(name)
    if (!backend) continue
    if (await backend.isAvailable()) return backend
  }

  throw new Error(
    `no curator backend is available. Install the \`codex\` CLI (recommended for ChatGPT Plus/Pro subscribers), install \`pi\`, set \`OPENAI_API_KEY\`, or set \`ANTHROPIC_API_KEY\`. See docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md §L0→L1 curation pipeline.`,
  )
}

// -----------------------------------------------------------------------------
// Orchestrator.
// -----------------------------------------------------------------------------

export interface RunCuratorResult {
  output: CuratorOutput
  backend: CuratorBackendName
  model: string
  duration_ms: number
  prompt_version: string
  usage?: CuratorBackendResult['usage']
}

/**
 * Compose → dispatch → parse. One LLM call per invocation. Does NOT touch the
 * vault or DB — the apply-layer (PR 3 unit 3.5) owns all side effects. The
 * returned CuratorOutput is already validated against the Constraint #15
 * allowlist; the apply-layer still runs validateL1Page per page for the rest
 * of the rules.
 */
export async function runCurator(input: CuratorInput): Promise<RunCuratorResult> {
  const backend = await selectBackend(input)
  const defaults = resolveTaskDefaults(input.task)
  const model = input.model_override ?? defaults.model
  const reasoning = input.reasoning_override ?? defaults.reasoning

  const prompt = composePrompt(input)
  const schema = getOutputSchema()

  const backendInput: CuratorBackendInput = {
    task: input.task,
    model,
    reasoning,
    prompt,
    schema,
  }
  if (input.timeout_ms !== undefined) backendInput.timeout_ms = input.timeout_ms

  const started = Date.now()
  const result = await backend.curate(backendInput)
  const parsed = parseCuratorOutput(result.raw_text, input)

  const out: RunCuratorResult = {
    output: parsed,
    backend: result.backend,
    model: result.model,
    duration_ms: result.duration_ms > 0 ? result.duration_ms : Date.now() - started,
    prompt_version: PROMPT_VERSION,
  }
  if (result.usage) out.usage = result.usage
  return out
}
