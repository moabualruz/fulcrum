// PR 6.8 — Codex app-server JSON-RPC request builders.
//
// Fulcrum talks to Codex's app-server (long-running backend that hosts the
// thread/turn machinery) via JSON-RPC 2.0. Only two methods are on the stable
// surface per `codex-rs/app-server/README.md`:
//
//   • `config/mcpServer/reload` — hot-reload MCP-server config after editing
//     `~/.codex/config.toml`; no params, returns `{}`.
//   • `skills/list` — list skills for one or more `cwd` values, feeds
//     `fulcrum install verify --agent codex`.
//
// Explicitly FORBIDDEN: `plugin/list`, `plugin/read`, `plugin/install`,
// `plugin/uninstall` — all marked "under development; do not call from
// production clients yet". The guard test in
// `packages/cli/src/tests/hook-codex-pr6.test.ts` enforces the prohibition.
//
// This module builds the request payloads only. Live transport (stdio /
// socket dispatch) is deferred to the consumer — the payloads are pure
// JSON-RPC objects that any transport can send.

export interface JsonRpcRequest<P = unknown> {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: P
}

export interface SkillsListParams {
  cwds: string[]
  forceReload?: boolean
  perCwdExtraUserRoots?: Array<{ cwd: string; extraUserRoots: string[] }>
}

/**
 * Build a `config/mcpServer/reload` JSON-RPC request. Send this to Codex's
 * app-server after `installCodex` mutates `~/.codex/config.toml` so the
 * currently-running Codex process picks up the new `[mcp_servers.fulcrum]`
 * block without a restart. Returns `{}` on success per the app-server README.
 */
export function buildMcpReloadRequest(id: number | string): JsonRpcRequest {
  return {
    jsonrpc: '2.0',
    id,
    method: 'config/mcpServer/reload',
  }
}

/**
 * Build a `skills/list` JSON-RPC request. Used by `fulcrum install verify
 * --agent codex` (PR 13) to confirm the fanned-out skills are actually visible
 * to Codex from the given cwd(s). `forceReload` bypasses the per-cwd cache.
 */
export function buildSkillsListRequest(
  id: number | string,
  params: SkillsListParams,
): JsonRpcRequest<SkillsListParams> {
  return {
    jsonrpc: '2.0',
    id,
    method: 'skills/list',
    params,
  }
}
