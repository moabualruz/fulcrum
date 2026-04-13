import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { FulcrumConfig, PolicyConfig, EmbeddingProviderConfig } from './types.js'

const DEFAULT_TEXT_EMBEDDING: EmbeddingProviderConfig = {
  provider: 'local',
  model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
  dimensions: 1024,
}

const DEFAULT_RERANKER: EmbeddingProviderConfig = {
  provider: 'local',
  model: 'onnx-community/bge-reranker-v2-m3-ONNX',
}

const DEFAULT_POLICY: PolicyConfig = {
  wip_limit: 5,
  wip_limit_per_role: {},
  heartbeat_timeout_minutes: 10,
  escalation_timeout_minutes: 30,
}

export const defaultConfig: FulcrumConfig = {
  workspace_id: '',
  project_id: '',
  port: 4721,
  embedding: { text: DEFAULT_TEXT_EMBEDDING, code: null },
  reranker: DEFAULT_RERANKER,
  policy: DEFAULT_POLICY,
}

export function loadConfig(projectRoot?: string): FulcrumConfig {
  const root = projectRoot ?? process.cwd()
  const configPath = join(root, '.fulcrum.json')

  let fileConfig: Partial<FulcrumConfig> = {}
  if (existsSync(configPath)) {
    try {
      const raw: unknown = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
        fileConfig = raw as Partial<FulcrumConfig>
      }
    } catch {
      process.stderr.write(`[fulcrum] Warning: malformed .fulcrum.json at ${configPath}, using defaults\n`)
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
