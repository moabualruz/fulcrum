// packages/memory/src/l0/ingest.ts
//
// Memory v3 PR 1 unit 1.1 — L0 raw-source ingest.
//
// `ingestRawSource` is the single entry point for writing a raw dump (bash
// trace, tool trace, file patch, session transcript, …) to L0. It:
//   1. Validates the source_type against the canonical L0_SOURCE_TYPES list.
//   2. Computes size_bytes (UTF-8) + content_hash (sha256 hex) from the body.
//   3. Runs sanitizeOnWrite(body) for the sanitize-before-WAL invariant
//      (plan §Critical Constraint #4). L0 body on disk stays verbatim
//      (Constraint #2); sanitization events go to the WAL only.
//   4. Writes vault/raw/<source_type>/YYYY/MM/DD/<ULID>.md with mode 0600
//      (Constraint #1 — inherits globalDataDir() perms).
//   5. Inserts an l0_sources row.
//   6. Appends a WAL record (content_sha256 only; no cleartext).
//   7. Emits an 'l0_ingested' event via the existing FulcrumEventBus — not
//      a new per-subsystem events module (MASTER-PLAN §Coord #3 + review C1).
//
// The body is written verbatim: no truncation, no normalization, no
// sanitize-in-place. Curator at L1 time re-reads + re-sanitizes.

import { createHash } from 'crypto'
import { join } from 'path'
import { homedir } from 'os'
import { getDb, emitEvent, globalDataDir, newId } from 'fulcrum-agent-core'
import { sanitizeOnWrite } from '../sanitize/index.js'
import { appendWal } from '../wal/writer.js'
import { writeRawFile } from '../vault/client.js'
import {
  L0_SOURCE_TYPES,
  type L0File,
  type L0Frontmatter,
  type L0IngestInput,
  type L0SourceType,
} from './types.js'

/**
 * Resolve the vault root. Env override wins so tests can redirect to a
 * tmpdir; default mirrors the v2a `getVaultPath()` convention
 * (`~/.fulcrum/vault`) until the global `globalDataDir()`-based layout flips
 * default in PR 5.
 */
function getVaultRoot(): string {
  const envOverride = process.env['FULCRUM_VAULT_PATH']
  if (envOverride && envOverride.length > 0) return envOverride
  return join(homedir(), '.fulcrum', 'vault')
}

/**
 * Two-digit UTC component of a Date.
 */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Serialize the L0 frontmatter. YAML-compatible, deterministic field order.
 * Null values render as bare `null` (not `"null"` string) so `gray-matter`
 * round-trips them correctly on re-read.
 */
function serializeFrontmatter(fm: L0Frontmatter): string {
  const line = (k: string, v: string | number | null): string => {
    if (v === null) return `${k}: null`
    if (typeof v === 'number') return `${k}: ${v}`
    return `${k}: ${v}`
  }
  return [
    '---',
    line('id', fm.id),
    line('schema', fm.schema),
    line('source_type', fm.source_type),
    line('session_id', fm.session_id),
    line('workspace_id', fm.workspace_id),
    line('project_id', fm.project_id),
    line('cwd', fm.cwd),
    line('created_at', fm.created_at),
    line('content_hash', fm.content_hash),
    line('size_bytes', fm.size_bytes),
    '---',
    '',
  ].join('\n')
}

/**
 * Write a raw L0 source to disk + DB + WAL, and fire the l0_ingested event.
 *
 * Throws:
 *   - if `source_type` is not in `L0_SOURCE_TYPES` (app-layer validation).
 *   - if `meta.workspace_id` is not provided.
 *   - if `sanitizeOnWrite` fails (fail-closed per v2a Constraint #4).
 */
export function ingestRawSource(input: L0IngestInput): L0File {
  // 1. Validate source_type — DB has no CHECK constraint per v2a precedent.
  if (!L0_SOURCE_TYPES.includes(input.source_type as L0SourceType)) {
    throw new Error(`ingestRawSource: invalid source_type '${input.source_type}'`)
  }

  // 2. Require workspace_id. Auto-resolution from cwd lands in PR 1 unit 1.4
  //    (hooks integration) — until then every caller supplies it explicitly.
  const workspace_id = input.meta?.workspace_id
  if (!workspace_id || workspace_id.length === 0) {
    throw new Error('ingestRawSource: meta.workspace_id is required')
  }
  const project_id = input.meta?.project_id ?? null
  const session_id = input.meta?.session_id ?? null
  const cwd = input.meta?.cwd ?? null

  // 3. Hash + size computed from the VERBATIM body.
  const body = input.body
  const size_bytes = Buffer.byteLength(body, 'utf-8')
  const content_hash = createHash('sha256').update(body).digest('hex')

  // 4. Sanitize-before-WAL. L0 file stays verbatim; sanitize_events are
  //    captured for the WAL audit row (plan §Critical Constraint #4).
  const sanitized = sanitizeOnWrite(body, {})
  if (sanitized.errored) {
    throw new Error(
      `ingestRawSource: sanitizer failed; refusing to ingest. events=${JSON.stringify(sanitized.events)}`,
    )
  }

  // 5. Build frontmatter + path. `newId('l0_source')` returns `l0src_<ULID>`
  //    — repo-wide ID convention enforced by ulid-guard test.
  const source_id = newId('l0_source')
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = pad2(now.getUTCMonth() + 1)
  const dd = pad2(now.getUTCDate())
  const created_at = now.toISOString()
  const vault_path = `raw/${input.source_type}/${yyyy}/${mm}/${dd}/${source_id}.md`

  const frontmatter: L0Frontmatter = {
    id: source_id,
    schema: 'fulcrum.source/v3',
    source_type: input.source_type,
    session_id,
    workspace_id,
    project_id,
    cwd,
    created_at,
    content_hash,
    size_bytes,
  }

  // 6. Write the file. `writeRawFile` enforces the `raw/` prefix, vault
  //    containment, 0600 file perms, and 0700 parent dirs — factored out
  //    in PR 1 unit 1.2 so curator writes (PR 2) share the same pattern.
  //    L0 body is verbatim: frontmatter + raw body bytes, no rewrite.
  writeRawFile(getVaultRoot(), vault_path, serializeFrontmatter(frontmatter) + body)

  // 7. Insert the l0_sources row. (runMigration101MemoryV3Lifecycle created
  //    the table; callers must have run the migration before invoking this.)
  getDb()
    .prepare(
      `INSERT INTO l0_sources (source_id, source_type, session_id, workspace_id, project_id, cwd, vault_path, content_hash, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      source_id,
      input.source_type,
      session_id,
      workspace_id,
      project_id,
      cwd,
      vault_path,
      content_hash,
      size_bytes,
      created_at,
    )

  // 8. WAL audit row. Content_sha256 is of the sanitized form per v2a
  //    invariant; the verbatim body lives at rest on disk only.
  appendWal({
    op: 'WRITE',
    memory_id: source_id,
    kind: `l0:${input.source_type}`,
    workspace_id,
    project_id,
    content: sanitized.content,
    sanitize_events: sanitized.events,
    provenance: {
      schema: 'fulcrum.source/v3',
      source_id,
      vault_path,
      session_id,
    },
  })

  // 9. Emit l0_ingested. Reuses the existing FulcrumEventBus via emitEvent()
  //    which also writes an events-table row. No new per-subsystem bus.
  const emitInput: Parameters<typeof emitEvent>[0] = {
    evt_type: 'l0_ingested',
    workspace_id,
    object_type: 'l0_source',
    object_id: source_id,
    actor_type: session_id ? 'agent_run' : 'system',
    actor_id: session_id ?? 'l0-ingest',
    payload: {
      source_type: input.source_type,
      size_bytes,
      vault_path,
    },
  }
  if (project_id) emitInput.project_id = project_id
  emitEvent(emitInput)

  // Silence the reference to `globalDataDir` so the import doesn't bloat —
  // the default vault root uses homedir() today; future PRs will flip this
  // to globalDataDir() when the vault layout moves under globalDataDir.
  void globalDataDir

  return { frontmatter, body, vault_path }
}
