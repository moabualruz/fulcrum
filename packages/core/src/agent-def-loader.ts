// packages/core/src/agent-def-loader.ts
// File-based agent definition loader (GAP-AGENTDEF-5).
//
// Operators can author agent definitions as JSON files and commit them to the
// repository.  At startup the CLI calls `loadAgentDefsFromDir()` to sync them
// into the `agent_definitions` table.
//
// Schema: each file is a JSON object matching AgentDefFile (see below).
// Files are named after the role slug (e.g. `chief_of_staff.agent.json`).
// Standard locations searched (first file wins for a given role):
//   1. <CWD>/agent-integration/agent-defs/ — committed project-level definitions
//   2. <CWD>/.fulcrum/agent-defs/           — local development overrides (gitignored)
//   3. globalDataDir()/agent-defs/          — user-global overrides
//
// File schema (all fields optional except `role`):
// {
//   "role": "software_engineer",          // required — matches AgentRole
//   "display_name": "Software Engineer",
//   "description": "...",
//   "version": "1.0.0",
//   "stability": "stable",               // stable | beta | experimental | deprecated
//   "system_prompt": "You are a ...",
//   "model": "claude-sonnet-4-6",
//   "provider": "anthropic",
//   "tools_allow": ["Write", "Edit"],
//   "tools_deny": [],
//   "capabilities": ["write_code"],
//   "allow_dispatch": true,
//   "icon_url": "https://example.com/icon.png",
//   "executor_uri": "https://my-agent.example.com/a2a",
//   "eval_suites": []
// }

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { getDb } from './db/client.js'
import { getAgentDefinition, createAgentDefinition, updateAgentDefinition } from './agent-definitions.js'
import { globalDataDir } from './db/client.js'
import type { AgentRole, CreateAgentDefinitionInput } from './types.js'

export interface AgentDefFile {
  role: AgentRole
  display_name?: string
  description?: string
  version?: string
  stability?: 'stable' | 'beta' | 'experimental' | 'deprecated'
  system_prompt?: string | null
  model?: string | null
  provider?: string
  tools_allow?: string[] | null
  tools_deny?: string[] | null
  capabilities?: string[]
  allow_dispatch?: boolean
  icon_url?: string | null
  executor_uri?: string | null
  eval_suites?: string[]
}

const AGENT_DEF_GLOB = /^[a-z0-9_-]+\.agent\.json$/

/**
 * Load agent definition files from a directory.
 * Returns the number of definitions created or updated.
 */
function loadDir(dir: string, workspaceId: string, db = getDb()): number {
  if (!existsSync(dir)) return 0
  let count = 0
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return 0 }

  for (const entry of entries) {
    if (!AGENT_DEF_GLOB.test(entry)) continue
    try {
      const raw = JSON.parse(readFileSync(join(dir, entry), 'utf-8')) as AgentDefFile
      if (!raw.role) continue

      const existing = getAgentDefinition(raw.role, workspaceId, db)
      if (existing) {
        updateAgentDefinition({
          role: raw.role,
          workspace_id: workspaceId,
          display_name: raw.display_name,
          description: raw.description,
          version: raw.version,
          stability: raw.stability,
          system_prompt: raw.system_prompt,
          model: raw.model,
          provider: raw.provider,
          tools_allow: raw.tools_allow,
          tools_deny: raw.tools_deny,
          capabilities: raw.capabilities,
          allow_dispatch: raw.allow_dispatch,
          icon_url: raw.icon_url,
          executor_uri: raw.executor_uri,
          eval_suites: raw.eval_suites,
        }, db)
      } else {
        createAgentDefinition({
          ...(raw as CreateAgentDefinitionInput),
          workspace_id: workspaceId,
        }, db)
      }
      count++
    } catch {
      // Skip malformed files — non-fatal
    }
  }
  return count
}

/**
 * Sync agent definition files into the DB at startup.
 * Searches the project-local `.fulcrum/agent-defs/` directory and the
 * user-global `globalDataDir()/agent-defs/` directory.
 *
 * Project-local files are loaded first; global files fill in any roles
 * not defined locally.  Both directories are searched every startup so
 * operators can update definitions without DB migrations.
 */
export function loadAgentDefsFromDir(
  startDir: string = process.cwd(),
  workspaceId = 'default',
  db = getDb(),
): number {
  let total = 0
  // 1. Committed project-level definitions (tracked in version control)
  total += loadDir(join(startDir, 'agent-integration', 'agent-defs'), workspaceId, db)
  // 2. Local development overrides (.fulcrum/ is gitignored)
  total += loadDir(join(startDir, '.fulcrum', 'agent-defs'), workspaceId, db)
  // 3. User-global: globalDataDir()/agent-defs/
  total += loadDir(join(globalDataDir(), 'agent-defs'), workspaceId, db)
  return total
}
