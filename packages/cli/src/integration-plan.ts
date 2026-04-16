import { existsSync } from 'fs'
import { join } from 'path'

export type InstallPath =
  | 'plugin-first'
  | 'extension-first'
  | 'rules-first'
  | 'config-first'
  | 'cli-only'

export interface RuntimeIntegrationPlan {
  runtime: 'claude' | 'gemini' | 'pi' | 'cursor' | 'windsurf' | 'codex' | 'opencode'
  displayName: string
  detected: boolean
  installPath: InstallPath
  supports: string[]
  rationale: string
  applyable: boolean
  detectionHints: string[]
  nextSteps: string[]
}

export interface IntegrationPlannerOptions {
  cwd?: string
  home?: string
  exists?: (path: string) => boolean
  commandExists?: (command: string) => boolean
}

function pathExists(path: string): boolean {
  try {
    return existsSync(path)
  } catch {
    return false
  }
}

function isCommandAvailable(command: string): boolean {
  try {
    return !!process.env['PATH']?.split(':').some(entry => pathExists(join(entry, command)))
  } catch {
    return false
  }
}

export function buildRuntimeIntegrationPlan(options: IntegrationPlannerOptions = {}): RuntimeIntegrationPlan[] {
  const cwd = options.cwd ?? process.cwd()
  const home = options.home ?? process.env['HOME'] ?? ''
  const has = options.exists ?? pathExists
  const hasCommand = options.commandExists ?? isCommandAvailable

  const hasClaude = has(join(home, '.claude')) || has(join(home, '.claude.json')) || hasCommand('claude')
  const hasGemini = has(join(home, '.gemini')) || hasCommand('gemini')
  const hasPi = hasCommand('pi')
  const hasCursor = has(join(home, '.cursor')) || has(join(cwd, '.cursor'))
  const hasWindsurf = has(join(home, '.windsurf')) || has(join(cwd, '.windsurf'))
  const hasCodex = has(join(home, '.codex')) || has(join(cwd, '.codex')) || hasCommand('codex')
  const hasOpencode = has(join(home, '.config', 'opencode')) || has(join(cwd, '.opencode')) || hasCommand('opencode')

  return [
    {
      runtime: 'claude',
      displayName: 'Claude Code',
      detected: hasClaude,
      installPath: 'plugin-first',
      supports: ['plugins', 'hooks', 'skills', 'slash commands', 'rules'],
      rationale: 'Claude Code is the richest runtime for Fulcrum packaging. Plugin-capable installs can bundle hooks, persistent data, and rule files; today Fulcrum ships hooks plus skills as the strongest supported path.',
      applyable: false,
      detectionHints: ['~/.claude', '~/.claude.json', '`claude` on PATH'],
      nextSteps: ['Use `pnpm run setup:claude` from the repo or `npx fulcrum-mcp@latest init` for user-scope wiring.', 'Run `fulcrum skills install` to activate bundled Claude skills.'],
    },
    {
      runtime: 'gemini',
      displayName: 'Gemini CLI',
      detected: hasGemini,
      installPath: 'extension-first',
      supports: ['extensions', 'hooks', 'GEMINI.md', 'MCP'],
      rationale: 'Gemini has a clear extension model, so Fulcrum should prefer shipping an extension bundle with hook wiring and context files rather than a generic config-only path.',
      applyable: false,
      detectionHints: ['~/.gemini', '`gemini` on PATH'],
      nextSteps: ['Use `pnpm run setup:gemini` from the repo or `npx fulcrum-mcp@latest init` to install the extension bundle.'],
    },
    {
      runtime: 'pi',
      displayName: 'PI CLI',
      detected: hasPi,
      installPath: 'extension-first',
      supports: ['extensions', 'native tools', 'slash commands', 'dashboard widgets'],
      rationale: 'PI is extension-centric. The Fulcrum cockpit should be installed as a first-class extension with native tools and TUI/dashboard affordances, not reduced to a generic config shim.',
      applyable: false,
      detectionHints: ['`pi` on PATH'],
      nextSteps: ['Use `pnpm run setup:pi` to install the cockpit extension.'],
    },
    {
      runtime: 'cursor',
      displayName: 'Cursor',
      detected: hasCursor,
      installPath: 'rules-first',
      supports: ['project rules', 'MCP config'],
      rationale: 'Cursor is strongest with project rules plus local config. Fulcrum should emphasize rule files and project-local enablement rather than pretending Cursor has a packaged extension model identical to Gemini or PI.',
      applyable: true,
      detectionHints: ['~/.cursor', '.cursor/ in the project'],
      nextSteps: ['Use `fulcrum init --cursor` for project-local rule/config scaffolding.'],
    },
    {
      runtime: 'windsurf',
      displayName: 'Windsurf',
      detected: hasWindsurf,
      installPath: 'rules-first',
      supports: ['rules', 'MCP config'],
      rationale: 'Windsurf also behaves like a rules-first integration. The install flow should optimize for project-local files and compatibility guidance, not a nonexistent full extension lifecycle.',
      applyable: true,
      detectionHints: ['~/.windsurf', '.windsurf/ in the project'],
      nextSteps: ['Use `fulcrum init --windsurf` for project-local rule/config scaffolding.'],
    },
    {
      runtime: 'codex',
      displayName: 'OpenAI Codex CLI',
      detected: hasCodex,
      installPath: 'config-first',
      supports: ['AGENTS.md', 'config files', 'MCP config'],
      rationale: 'Codex is context-and-config driven. Fulcrum should install config plus project instructions and avoid extension language that does not map cleanly to Codex.',
      applyable: true,
      detectionHints: ['~/.codex', '.codex/ in the project', '`codex` on PATH'],
      nextSteps: ['Use `fulcrum init --codex` for project-local Codex config scaffolding.'],
    },
    {
      runtime: 'opencode',
      displayName: 'opencode',
      detected: hasOpencode,
      installPath: 'config-first',
      supports: ['config files', 'project docs', 'MCP config'],
      rationale: 'opencode is best served by generated config and project guidance. Fulcrum should treat it as config-first, not plugin-first.',
      applyable: true,
      detectionHints: ['~/.config/opencode', '.opencode/ in the project', '`opencode` on PATH'],
      nextSteps: ['Use `fulcrum init --opencode` for project-local config scaffolding.'],
    },
  ]
}

export function summarizeAdaptiveInstallPlan(options: IntegrationPlannerOptions = {}): {
  recommendedPath: 'adaptive' | 'cli-only'
  detectedRuntimes: string[]
  runtimes: RuntimeIntegrationPlan[]
} {
  const runtimes = buildRuntimeIntegrationPlan(options)
  const detectedRuntimes = runtimes.filter(runtime => runtime.detected).map(runtime => runtime.runtime)
  return {
    recommendedPath: detectedRuntimes.length > 0 ? 'adaptive' : 'cli-only',
    detectedRuntimes,
    runtimes,
  }
}
