import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { FulcrumConfig, PolicyConfig, EmbeddingProviderConfig } from './types.js'
import { globalDataDir } from './db/client.js'
import {
  DEFAULT_EMBED_DIM,
  DEFAULT_MONITOR_PORT,
  DEFAULT_HEARTBEAT_TIMEOUT_SEC,
  DEFAULT_ESCALATION_TIMEOUT_SEC,
} from './constants.js'

// ── Config validation ──────────────────────────────────────────────────────────
// Lightweight structural validator — produces actionable error messages without
// requiring an external dependency like Zod.

export type ValidationResult = { ok: true } | { ok: false; errors: string[] }

const EMBEDDING_PROVIDERS = ['local', 'openai', 'voyage', 'cohere', 'ollama', 'jina', 'custom'] as const
const EMBEDDING_DEVICES = ['auto', 'cpu', 'cuda', 'webgpu'] as const

function validateEmbeddingProvider(value: unknown, path: string): string[] {
  const errs: string[] = []
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    errs.push(`${path}: must be an object`)
    return errs
  }
  const v = value as Record<string, unknown>
  if (typeof v['provider'] !== 'string' || !(EMBEDDING_PROVIDERS as readonly string[]).includes(v['provider'])) {
    errs.push(`${path}.provider: must be one of ${EMBEDDING_PROVIDERS.join(', ')}`)
  }
  if (typeof v['model'] !== 'string' || v['model'].trim() === '') {
    errs.push(`${path}.model: must be a non-empty string`)
  }
  if (v['dimensions'] !== undefined && (typeof v['dimensions'] !== 'number' || v['dimensions'] <= 0)) {
    errs.push(`${path}.dimensions: must be a positive number`)
  }
  if (v['device'] !== undefined && (typeof v['device'] !== 'string' || !(EMBEDDING_DEVICES as readonly string[]).includes(v['device']))) {
    errs.push(`${path}.device: must be one of ${EMBEDDING_DEVICES.join(', ')}`)
  }
  if (v['apiKey'] !== undefined && typeof v['apiKey'] !== 'string') {
    errs.push(`${path}.apiKey: must be a string`)
  }
  if (v['baseUrl'] !== undefined && typeof v['baseUrl'] !== 'string') {
    errs.push(`${path}.baseUrl: must be a string`)
  }
  return errs
}

/** Validate a parsed .fulcrum.json object; returns all errors found. */
export function validateFulcrumConfig(raw: unknown): ValidationResult {
  const errs: string[] = []

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['.fulcrum.json: must be a JSON object'] }
  }

  const v = raw as Record<string, unknown>

  if (v['workspace_id'] !== undefined && typeof v['workspace_id'] !== 'string') {
    errs.push('workspace_id: must be a string')
  }
  if (v['project_id'] !== undefined && typeof v['project_id'] !== 'string') {
    errs.push('project_id: must be a string')
  }
  if (v['port'] !== undefined) {
    if (typeof v['port'] !== 'number' || !Number.isInteger(v['port']) || v['port'] < 1 || v['port'] > 65535) {
      errs.push('port: must be an integer between 1 and 65535')
    }
  }

  // embedding
  if (v['embedding'] !== undefined) {
    if (typeof v['embedding'] !== 'object' || v['embedding'] === null || Array.isArray(v['embedding'])) {
      errs.push('embedding: must be an object with "text" and optional "code" keys')
    } else {
      const emb = v['embedding'] as Record<string, unknown>
      if (emb['text'] !== undefined) errs.push(...validateEmbeddingProvider(emb['text'], 'embedding.text'))
      if (emb['code'] !== undefined && emb['code'] !== null) {
        errs.push(...validateEmbeddingProvider(emb['code'], 'embedding.code'))
      }
    }
  }

  // reranker
  if (v['reranker'] !== undefined && v['reranker'] !== null) {
    errs.push(...validateEmbeddingProvider(v['reranker'], 'reranker'))
  }

  // policy
  if (v['policy'] !== undefined) {
    if (typeof v['policy'] !== 'object' || v['policy'] === null || Array.isArray(v['policy'])) {
      errs.push('policy: must be an object')
    } else {
      const p = v['policy'] as Record<string, unknown>
      if (p['wip_limit'] !== undefined && (typeof p['wip_limit'] !== 'number' || p['wip_limit'] < 0)) {
        errs.push('policy.wip_limit: must be a non-negative number')
      }
      if (p['heartbeat_timeout_minutes'] !== undefined &&
          (typeof p['heartbeat_timeout_minutes'] !== 'number' || p['heartbeat_timeout_minutes'] <= 0)) {
        errs.push('policy.heartbeat_timeout_minutes: must be a positive number')
      }
      if (p['escalation_timeout_minutes'] !== undefined &&
          (typeof p['escalation_timeout_minutes'] !== 'number' || p['escalation_timeout_minutes'] <= 0)) {
        errs.push('policy.escalation_timeout_minutes: must be a positive number')
      }
    }
  }

  // vault
  if (v['vault'] !== undefined) {
    if (typeof v['vault'] !== 'object' || v['vault'] === null || Array.isArray(v['vault'])) {
      errs.push('vault: must be an object')
    } else {
      const vlt = v['vault'] as Record<string, unknown>
      if (vlt['path'] !== undefined && typeof vlt['path'] !== 'string') {
        errs.push('vault.path: must be a string')
      }
      if (vlt['l2_enabled'] !== undefined && typeof vlt['l2_enabled'] !== 'boolean') {
        errs.push('vault.l2_enabled: must be a boolean')
      }
    }
  }

  return errs.length === 0 ? { ok: true } : { ok: false, errors: errs }
}

const DEFAULT_TEXT_EMBEDDING: EmbeddingProviderConfig = {
  provider: 'local',
  model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
  dimensions: DEFAULT_EMBED_DIM,
  device: 'auto',
}

const DEFAULT_RERANKER: EmbeddingProviderConfig = {
  provider: 'local',
  model: 'onnx-community/bge-reranker-v2-m3-ONNX',
  device: 'auto',
}

const DEFAULT_POLICY: PolicyConfig = {
  wip_limit: 5,
  wip_limit_per_role: {},
  heartbeat_timeout_minutes: DEFAULT_HEARTBEAT_TIMEOUT_SEC / 60,
  escalation_timeout_minutes: DEFAULT_ESCALATION_TIMEOUT_SEC / 60,
}

export const defaultConfig: FulcrumConfig = {
  workspace_id: '',
  project_id: '',
  port: DEFAULT_MONITOR_PORT,
  embedding: { text: DEFAULT_TEXT_EMBEDDING, code: null },
  reranker: DEFAULT_RERANKER,
  policy: DEFAULT_POLICY,
  vault: { path: undefined, l2_enabled: false },
}

/**
 * Load Fulcrum configuration from the global config file at globalDataDir()/config.json.
 * NEVER reads from project-local directories — all config is global.
 * The `projectRoot` parameter is ignored and kept for backwards-compatible call sites;
 * workspace_id / project_id are always computed deterministically from CWD by callers,
 * not stored in files.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function loadConfig(_projectRoot?: string): FulcrumConfig {
  const configPath = join(globalDataDir(), 'config.json')

  let fileConfig: Partial<FulcrumConfig> = {}
  if (existsSync(configPath)) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      process.stderr.write(`[fulcrum] Warning: malformed JSON in ${configPath}, using defaults\n`)
      raw = null
    }
    if (raw !== null) {
      const result = validateFulcrumConfig(raw)
      if (!result.ok) {
        throw new Error(
          `[fulcrum] Invalid config at ${configPath}:\n` +
          result.errors.map(e => `  • ${e}`).join('\n')
        )
      }
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        fileConfig = raw as Partial<FulcrumConfig>
      }
    }
  }

  const merged: FulcrumConfig = {
    ...defaultConfig,
    ...fileConfig,
    embedding: {
      text: fileConfig.embedding?.text ?? DEFAULT_TEXT_EMBEDDING,
      code: fileConfig.embedding?.code ?? null,
    },
    reranker: fileConfig.reranker ?? DEFAULT_RERANKER,
    policy: {
      ...DEFAULT_POLICY,
      ...(fileConfig.policy ?? {}),
    },
    vault: {
      path: fileConfig.vault?.path ?? undefined,
      l2_enabled: fileConfig.vault?.l2_enabled ?? false,
    },
  }

  // Env-var overrides
  if (process.env.FULCRUM_WORKSPACE_ID) merged.workspace_id = process.env.FULCRUM_WORKSPACE_ID
  if (process.env.FULCRUM_PROJECT_ID) merged.project_id = process.env.FULCRUM_PROJECT_ID
  if (process.env.FULCRUM_PORT) {
    const n = parseInt(process.env.FULCRUM_PORT, 10)
    if (!Number.isNaN(n)) merged.port = n
  }

  return merged
}

/**
 * Read the raw JSON config object from globalDataDir()/config.json without
 * validation. Returns an empty object if the file does not exist or is malformed.
 * Use this when you need to read-then-patch the config (e.g. the memory wizard).
 * Prefer `loadConfig()` when you need a fully-typed, validated FulcrumConfig.
 */
export function readRawConfig(): Record<string, unknown> {
  const configPath = join(globalDataDir(), 'config.json')
  if (!existsSync(configPath)) return {}
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Write a raw config object to globalDataDir()/config.json.
 * Creates the directory if it does not exist.
 */
export function writeRawConfig(config: Record<string, unknown>): void {
  const dir = globalDataDir()
  mkdirSync(dir, { recursive: true })
  // MEM-011: restrict permissions — config may contain API keys
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 })
}
