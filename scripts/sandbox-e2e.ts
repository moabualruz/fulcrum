import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  connect,
  ReturnType as DaggerReturnType,
  type Client,
  type Container,
} from '@dagger.io/dagger'

export const SANDBOX_IMAGE = 'mcr.microsoft.com/playwright:v1.59.1-noble'
export const SANDBOX_HOME = '/sandbox/home'
export const SANDBOX_REPORT_DIR = '/sandbox/reports'
export const WORKDIR = '/work/fulcrum'

export const SOURCE_EXCLUDES = [
  '.git',
  'node_modules',
  '.pnpm-store',
  'dist',
  'build',
  'sandbox-reports',
  'test-results',
  'graphify-out',
  '.fulcrum',
  '/.claude',
  '/.claude.json',
  '/.claude.json.backup',
  '/.codex',
  '/.cursor',
  '/.gemini',
  '/.opencode',
  '/.pi',
  '/.windsurf',
  '/.pi-lens',
  '.env',
  '.env.*',
  '*.db',
  '*.db-shm',
  '*.db-wal',
]

export const ROOT_LOCAL_CONFIG_PATHS = [
  '.claude',
  '.claude.json',
  '.claude.json.backup',
  '.codex',
  '.cursor',
  '.gemini',
  '.opencode',
  '.pi',
  '.windsurf',
  '.pi-lens',
]

export const SUPPORT_CONFIG_PATHS = [
  '.agents',
  '.raise',
  '.gitconfig',
  '.config/gh',
  '.local/share/gh',
  '.cache/gh',
]

export const PROJECT_AGENTS = ['cursor', 'windsurf', 'codex', 'opencode', 'copilot'] as const

export type ProjectAgent = (typeof PROJECT_AGENTS)[number]

export type AgentName =
  | ProjectAgent
  | 'claude'
  | 'gemini'
  | 'pi'

export type ConfigOwner = AgentName | 'agent-support'

export interface HostConfigMount {
  agent: ConfigOwner
  hostPath: string
  sandboxPath: string
  homeRelativePath: string
  kind: 'file' | 'directory'
}

export interface LiveAgentPlan {
  agent: AgentName
  binary: string | undefined
  configPresent: boolean
  credentialEnv: string[]
  credentialPresent: boolean
  installCommand: string | undefined
  shouldInstall: boolean
  skipReason: string | undefined
}

export interface SandboxOptions {
  repoRoot: string
  outputDir: string
  hostHome: string
  image: string
  liveAgents: boolean
  fullSuite: boolean
  printPlan: boolean
}

export interface SandboxPlan {
  image: string
  repoRoot: string
  outputDir: string
  sourceExcludes: string[]
  configMounts: HostConfigMount[]
  supportConfigMounts: HostConfigMount[]
  projectConfigMounts: HostConfigMount[]
  liveAgents: LiveAgentPlan[]
  agentChatEnv: Record<string, string>
  commands: string[]
}

interface AgentRuntimeDefinition {
  agent: AgentName
  binary?: string
  configPaths: string[]
  credentialEnv: string[]
  defaultInstallCommand?: string
}

const AGENT_RUNTIME_DEFINITIONS: AgentRuntimeDefinition[] = [
  {
    agent: 'claude',
    binary: 'claude',
    configPaths: [
      '.claude',
      '.claude.json',
      '.claude.json.backup',
      '.config/Claude',
      '.config/Claude-3p',
      '.local/share/claude',
      '.local/share/claude-cowork',
      '.local/state/claude',
      '.cache/claude',
      '.cache/claude-cli-nodejs',
      '.cache/claude-desktop',
    ],
    credentialEnv: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    defaultInstallCommand: 'npm install -g @anthropic-ai/claude-code',
  },
  {
    agent: 'gemini',
    binary: 'gemini',
    configPaths: ['.gemini', '.config/gemini', '.local/share/gemini', '.local/state/gemini', '.cache/gemini'],
    credentialEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    defaultInstallCommand: 'npm install -g @google/gemini-cli',
  },
  {
    agent: 'pi',
    binary: 'pi',
    configPaths: ['.pi', '.config/pi', '.local/share/pi', '.local/state/pi', '.cache/pi', '.pi-lens'],
    credentialEnv: ['PI_API_KEY'],
  },
  {
    agent: 'codex',
    binary: 'codex',
    configPaths: ['.codex', '.config/Codex', '.local/state/codex', '.cache/codex', '.cache/codex-desktop'],
    credentialEnv: ['OPENAI_API_KEY'],
    defaultInstallCommand: 'npm install -g @openai/codex',
  },
  {
    agent: 'opencode',
    binary: 'opencode',
    configPaths: [
      '.config/opencode',
      '.opencode',
      '.local/share/opencode',
      '.local/state/opencode',
      '.cache/opencode',
      '.config/ai.opencode.desktop',
      '.local/share/ai.opencode.desktop',
      '.cache/ai.opencode.desktop',
    ],
    credentialEnv: ['OPENCODE_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
    defaultInstallCommand: 'npm install -g opencode-ai',
  },
  {
    agent: 'cursor',
    binary: 'cursor',
    configPaths: ['.cursor', '.config/Cursor', '.local/share/Cursor', '.cache/Cursor'],
    credentialEnv: [],
  },
  {
    agent: 'windsurf',
    binary: 'windsurf',
    configPaths: ['.windsurf', '.config/Windsurf', '.local/share/Windsurf', '.cache/Windsurf'],
    credentialEnv: [],
  },
  {
    agent: 'copilot',
    binary: 'copilot',
    configPaths: ['.config/github-copilot', '.copilot', '.cache/copilot'],
    credentialEnv: ['GITHUB_TOKEN', 'GH_TOKEN'],
    defaultInstallCommand: 'npm install -g @github/copilot',
  },
]
const ROOT_CONFIG_AGENT_MAP: Record<string, AgentName> = {
  '.claude': 'claude',
  '.claude.json': 'claude',
  '.claude.json.backup': 'claude',
  '.codex': 'codex',
  '.cursor': 'cursor',
  '.gemini': 'gemini',
  '.opencode': 'opencode',
  '.pi': 'pi',
  '.windsurf': 'windsurf',
  '.pi-lens': 'pi',
}
const AGENT_CHAT_ENV_KEYS = [
  'FULCRUM_AGENT_CHAT_RUNTIMES',
  'FULCRUM_AGENT_CHAT_REQUIRE_AUTH',
  'FULCRUM_AGENT_CHAT_STRICT',
  'FULCRUM_AGENT_CHAT_TIMEOUT_MS',
]

export function parseSandboxOptions(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): SandboxOptions {
  let repoRoot = process.cwd()
  let outputDir = path.resolve('sandbox-reports/dagger-e2e')
  let image = env['FULCRUM_SANDBOX_IMAGE'] ?? SANDBOX_IMAGE
  let liveAgents = env['FULCRUM_SANDBOX_LIVE_AGENTS'] === '1'
  let fullSuite = true
  let printPlan = false

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') {
      continue
    } else if (arg === '--repo') {
      repoRoot = requireValue(argv, ++i, arg)
    } else if (arg.startsWith('--repo=')) {
      repoRoot = arg.slice('--repo='.length)
    } else if (arg === '--output') {
      outputDir = requireValue(argv, ++i, arg)
    } else if (arg.startsWith('--output=')) {
      outputDir = arg.slice('--output='.length)
    } else if (arg === '--image') {
      image = requireValue(argv, ++i, arg)
    } else if (arg.startsWith('--image=')) {
      image = arg.slice('--image='.length)
    } else if (arg === '--live-agents') {
      liveAgents = true
    } else if (arg === '--smoke') {
      fullSuite = false
    } else if (arg === '--print-plan') {
      printPlan = true
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`Unknown sandbox option: ${arg}`)
    }
  }

  return {
    repoRoot: path.resolve(repoRoot),
    outputDir: path.resolve(outputDir),
    hostHome: path.resolve(env['FULCRUM_SANDBOX_HOST_HOME'] ?? homedir()),
    image,
    liveAgents,
    fullSuite,
    printPlan,
  }
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value) {
    throw new Error(`${flag} requires a value`)
  }
  return value
}

function printUsage(): void {
  console.log(`fulcrum sandbox e2e

Usage:
  pnpm run sandbox:e2e -- [--smoke] [--live-agents] [--output <dir>] [--repo <dir>]
  pnpm run sandbox:e2e:plan

Environment:
  FULCRUM_SANDBOX_IMAGE        Container image, default ${SANDBOX_IMAGE}
  FULCRUM_SANDBOX_HOST_HOME    Home to scan for agent config, default current user home
  FULCRUM_SANDBOX_LIVE_AGENTS  1 enables live CLI install/smoke path
  FULCRUM_SANDBOX_INSTALL_X    Override install command for agent X, upper-case name
`)
}

export function detectConfigMounts(hostHome: string): HostConfigMount[] {
  const mounts: HostConfigMount[] = []

  for (const runtime of AGENT_RUNTIME_DEFINITIONS) {
    for (const relativePath of runtime.configPaths) {
      const hostPath = path.join(hostHome, relativePath)
      if (!existsSync(hostPath)) {
        continue
      }

      const stat = statSync(hostPath)
      mounts.push({
        agent: runtime.agent,
        hostPath,
        sandboxPath: `/host-config/${runtime.agent}/${safeConfigName(relativePath)}`,
        homeRelativePath: relativePath,
        kind: stat.isDirectory() ? 'directory' : 'file',
      })
    }
  }

  return mounts
}

export function detectSupportConfigMounts(hostHome: string): HostConfigMount[] {
  const mounts: HostConfigMount[] = []
  for (const relativePath of SUPPORT_CONFIG_PATHS) {
    const hostPath = path.join(hostHome, relativePath)
    if (!existsSync(hostPath)) {
      continue
    }
    const stat = statSync(hostPath)
    mounts.push({
      agent: 'agent-support',
      hostPath,
      sandboxPath: `/host-support-config/${safeConfigName(relativePath)}`,
      homeRelativePath: relativePath,
      kind: stat.isDirectory() ? 'directory' : 'file',
    })
  }
  return mounts
}

export function detectProjectConfigMounts(repoRoot: string): HostConfigMount[] {
  const mounts: HostConfigMount[] = []
  for (const relativePath of ROOT_LOCAL_CONFIG_PATHS) {
    const hostPath = path.join(repoRoot, relativePath)
    if (!existsSync(hostPath)) {
      continue
    }
    const stat = statSync(hostPath)
    mounts.push({
      agent: ROOT_CONFIG_AGENT_MAP[relativePath] ?? 'claude',
      hostPath,
      sandboxPath: `/host-project-config/${safeConfigName(relativePath)}`,
      homeRelativePath: relativePath,
      kind: stat.isDirectory() ? 'directory' : 'file',
    })
  }
  return mounts
}

function safeConfigName(relativePath: string): string {
  return relativePath.replace(/^\./, 'dot-').replace(/[/.]/g, '-')
}

export function buildLiveAgentPlans(
  configMounts: HostConfigMount[],
  env: NodeJS.ProcessEnv,
  liveAgents: boolean,
): LiveAgentPlan[] {
  return AGENT_RUNTIME_DEFINITIONS.map((runtime) => {
    const configPresent = configMounts.some((mount) => mount.agent === runtime.agent)
    const credentialPresent = runtime.credentialEnv.length === 0
      || runtime.credentialEnv.some((name) => Boolean(env[name]))
      || configPresent
    const installCommand = env[`FULCRUM_SANDBOX_INSTALL_${runtime.agent.toUpperCase()}`]
      ?? runtime.defaultInstallCommand

    let skipReason: string | undefined
    if (!liveAgents) {
      skipReason = 'live agent path disabled'
    } else if (!configPresent) {
      skipReason = 'missing config copy'
    } else if (!credentialPresent) {
      skipReason = `missing credential env (${runtime.credentialEnv.join('|')})`
    } else if (!installCommand) {
      skipReason = 'no noninteractive install command configured'
    }

    return {
      agent: runtime.agent,
      binary: runtime.binary,
      configPresent,
      credentialEnv: runtime.credentialEnv,
      credentialPresent,
      installCommand,
      shouldInstall: !skipReason,
      skipReason,
    }
  })
}

export function buildSandboxCommands(fullSuite: boolean): string[] {
  const commands = [
    'corepack enable',
    'corepack prepare pnpm@10.33.0 --activate',
    'pnpm install --frozen-lockfile',
    'pnpm build',
  ]

  if (fullSuite) {
    commands.push(
      'pnpm test',
      'pnpm run check:cycles',
    )
  }

  commands.push(
    'pnpm --dir scripts test -- surface-inventory config-integrity sandbox-e2e',
    'pnpm --dir scripts test -- sandbox-scenarios',
    'pnpm --dir packages/cli exec vitest run src/tests/install-verify.test.ts src/tests/install-verify-mode-version-pr148.test.ts src/tests/init-cursor.test.ts src/tests/install-fanout-utilization.test.ts',
    'pnpm run setup:dry',
    'FULCRUM_SETUP_NO_GATE=1 pnpm run setup',
    'pnpm run setup:check',
    './fulcrum install apply --all',
  )

  for (const agent of PROJECT_AGENTS) {
    commands.push(`./fulcrum install verify --agent ${agent}`)
  }

  commands.push('pnpm run e2e:sandbox-scenarios')
  commands.push('pnpm run e2e:agent-chat')
  commands.push('pnpm run e2e:monitor')

  return commands
}

export function buildSandboxPlan(
  options: SandboxOptions,
  env: NodeJS.ProcessEnv = process.env,
): SandboxPlan {
  const configMounts = detectConfigMounts(options.hostHome)
  const supportConfigMounts = detectSupportConfigMounts(options.hostHome)
  const projectConfigMounts = detectProjectConfigMounts(options.repoRoot)
  return {
    image: options.image,
    repoRoot: options.repoRoot,
    outputDir: options.outputDir,
    sourceExcludes: SOURCE_EXCLUDES,
    configMounts,
    supportConfigMounts,
    projectConfigMounts,
    liveAgents: buildLiveAgentPlans(configMounts, env, options.liveAgents),
    agentChatEnv: pickAgentChatEnv(env),
    commands: buildSandboxCommands(options.fullSuite),
  }
}

export function buildSandboxShell(plan: SandboxPlan): string {
  const commandBlock = buildRunStepBlock(plan)

  return `#!/usr/bin/env bash
set -uo pipefail

export HOME=${SANDBOX_HOME}
export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"
export FULCRUM_DATA_DIR=/sandbox/fulcrum-data
export FULCRUM_VAULT_PATH=/sandbox/vault
export FULCRUM_AGENT_ADAPTER=stub
export FULCRUM_AGENT_STUB_DIR=/sandbox/agent-stubs
export FULCRUM_DISABLE_PCI=1
export CI=1
export PATH="$HOME/.local/bin:$PATH"
export REPORT_DIR=${SANDBOX_REPORT_DIR}
export FULCRUM_E2E_REPORT_DIR="$REPORT_DIR"
export FULCRUM_SANDBOX_AGENT_CHAT=${plan.liveAgents.some((agent) => agent.shouldInstall) ? '1' : '0'}
export FULCRUM_AGENT_CHAT_REQUIRE_AUTH=${plan.liveAgents.some((agent) => agent.shouldInstall) ? '1' : '0'}
${emitAgentChatEnvExports(plan.agentChatEnv)}

mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" \\
  "$FULCRUM_DATA_DIR" "$FULCRUM_VAULT_PATH" "$FULCRUM_AGENT_STUB_DIR" \\
  "$REPORT_DIR/logs" /work

status=0

run_step() {
  local name="$1"
  local command="$2"
  local log="$REPORT_DIR/logs/$name.log"
  echo "==> $command" | tee "$log"
  if bash -lc "$command" >> "$log" 2>&1; then
    echo "PASS $command" | tee -a "$REPORT_DIR/summary.txt"
  else
    local code=$?
    echo "FAIL($code) $command" | tee -a "$REPORT_DIR/summary.txt"
    status=1
  fi
}

cp -a /src ${WORKDIR}
chmod -R a-w /src || true
chmod -R u+rwX ${WORKDIR}
${emitLocalConfigCleanupCommands()}

${emitConfigCopyCommands(plan.configMounts)}
${emitSupportConfigCopyCommands(plan.supportConfigMounts)}

cat > "$REPORT_DIR/sandbox-plan.json" <<'FULCRUM_SANDBOX_PLAN'
${JSON.stringify(plan, null, 2)}
FULCRUM_SANDBOX_PLAN

cat > "$REPORT_DIR/live-agents.md" <<'FULCRUM_LIVE_AGENTS'
${emitLiveAgentReport(plan.liveAgents)}
FULCRUM_LIVE_AGENTS

cd ${WORKDIR}

${emitLiveAgentInstallCommands(plan.liveAgents)}

${commandBlock}

rm -rf "$REPORT_DIR/playwright-data/fulcrum/models" || true

echo "$status" > "$REPORT_DIR/exit-code"
exit "$status"
`
}

function buildRunStepBlock(plan: SandboxPlan): string {
  const lines: string[] = []
  let projectConfigCopied = false
  for (const command of plan.commands) {
    if (!projectConfigCopied && command === 'pnpm run setup:dry') {
      lines.push(emitProjectConfigCopyCommands(plan.projectConfigMounts))
      projectConfigCopied = true
    }
    lines.push(`run_step ${shQuote(safeStepName(command))} ${shQuote(command)}`)
  }
  if (!projectConfigCopied) {
    lines.push(emitProjectConfigCopyCommands(plan.projectConfigMounts))
  }
  return lines.join('\n')
}

function pickAgentChatEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const picked: Record<string, string> = {}
  for (const key of AGENT_CHAT_ENV_KEYS) {
    const value = env[key]
    if (value) picked[key] = value
  }
  return picked
}

function emitAgentChatEnvExports(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `export ${key}=${shQuote(value)}`)
    .join('\n')
}

function emitLocalConfigCleanupCommands(): string {
  return ROOT_LOCAL_CONFIG_PATHS
    .map((relativePath) => `rm -rf ${shQuote(`${WORKDIR}/${relativePath}`)}`)
    .join('\n')
}

function emitConfigCopyCommands(configMounts: HostConfigMount[]): string {
  if (configMounts.length === 0) {
    return 'echo "No host agent config copied" > "$REPORT_DIR/config-copy.txt"'
  }

  const commands = configMounts.map((mount) => {
    const destination = `${SANDBOX_HOME}/${mount.homeRelativePath}`
    const parent = resolvePosixParent(destination)
    return [
      `mkdir -p ${shQuote(parent)}`,
      `cp -a ${shQuote(mount.sandboxPath)} ${shQuote(destination)}`,
      `chmod -R u+rwX ${shQuote(destination)}`,
      `echo ${shQuote(`${mount.agent}: ${mount.homeRelativePath}`)} >> "$REPORT_DIR/config-copy.txt"`,
    ].join('\n')
  })

  return commands.join('\n')
}

function emitSupportConfigCopyCommands(supportConfigMounts: HostConfigMount[]): string {
  if (supportConfigMounts.length === 0) {
    return 'echo "No support agent config copied" > "$REPORT_DIR/support-config-copy.txt"'
  }

  return supportConfigMounts.map((mount) => {
    const destination = `${SANDBOX_HOME}/${mount.homeRelativePath}`
    const parent = resolvePosixParent(destination)
    return [
      `mkdir -p ${shQuote(parent)}`,
      `cp -a ${shQuote(mount.sandboxPath)} ${shQuote(destination)}`,
      `chmod -R u+rwX ${shQuote(destination)}`,
      `echo ${shQuote(`${mount.agent}: ${mount.homeRelativePath}`)} >> "$REPORT_DIR/support-config-copy.txt"`,
    ].join('\n')
  }).join('\n')
}

function emitProjectConfigCopyCommands(projectConfigMounts: HostConfigMount[]): string {
  if (projectConfigMounts.length === 0) {
    return 'echo "No project agent config copied" > "$REPORT_DIR/project-config-copy.txt"'
  }

  return projectConfigMounts.map((mount) => {
    const destination = `${WORKDIR}/${mount.homeRelativePath}`
    const parent = resolvePosixParent(destination)
    return [
      `mkdir -p ${shQuote(parent)}`,
      `cp -a ${shQuote(mount.sandboxPath)} ${shQuote(destination)}`,
      `chmod -R u+rwX ${shQuote(destination)}`,
      `echo ${shQuote(`${mount.agent}: ${mount.homeRelativePath}`)} >> "$REPORT_DIR/project-config-copy.txt"`,
    ].join('\n')
  }).join('\n')
}

function resolvePosixParent(filePath: string): string {
  const index = filePath.lastIndexOf('/')
  return index <= 0 ? '/' : filePath.slice(0, index)
}

function emitLiveAgentReport(liveAgents: LiveAgentPlan[]): string {
  const lines = ['# Live Agent Runtime Plan', '']
  for (const plan of liveAgents) {
    const state = plan.shouldInstall ? 'install' : 'skip'
    const reason = plan.shouldInstall ? 'ready' : plan.skipReason
    lines.push(`- ${plan.agent}: ${state} (${reason})`)
  }
  return lines.join('\n')
}

function emitLiveAgentInstallCommands(liveAgents: LiveAgentPlan[]): string {
  const commands = liveAgents
    .filter((plan) => plan.shouldInstall && plan.installCommand)
    .map((plan) => {
      const binaryCheck = plan.binary
        ? `if command -v ${shQuote(plan.binary)} >/dev/null 2>&1; then
  ${shQuote(plan.binary)} --version >> "$REPORT_DIR/logs/live-${plan.agent}.log" 2>&1 || true
else
  echo "missing binary after install: ${plan.binary}" >> "$REPORT_DIR/logs/live-${plan.agent}.log"
  exit 1
fi`
        : 'true'
      return `run_step ${shQuote(`live-${plan.agent}-install`)} ${shQuote(`${plan.installCommand} && ${binaryCheck}`)}`
    })

  if (commands.length === 0) {
    return 'echo "No live agent CLI installs planned" >> "$REPORT_DIR/summary.txt"'
  }

  return commands.join('\n')
}

function safeStepName(command: string): string {
  return command
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
    .toLowerCase()
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function withHostConfig(
  container: Container,
  client: Client,
  mounts: HostConfigMount[],
): Container {
  let next = container
  for (const mount of mounts) {
    next = mount.kind === 'directory'
      ? next.withDirectory(mount.sandboxPath, client.host().directory(mount.hostPath, { noCache: true }))
      : next.withFile(mount.sandboxPath, client.host().file(mount.hostPath, { noCache: true }))
  }
  return next
}

function withLiveAgentSecrets(
  container: Container,
  client: Client,
  plan: SandboxPlan,
  env: NodeJS.ProcessEnv,
): Container {
  let next = container
  const secretNames = new Set(
    plan.liveAgents
      .filter((agent) => agent.shouldInstall)
      .flatMap((agent) => agent.credentialEnv),
  )

  for (const name of secretNames) {
    const value = env[name]
    if (value) {
      next = next.withSecretVariable(name, client.setSecret(name, value))
    }
  }

  return next
}

export async function runSandbox(options = parseSandboxOptions()): Promise<void> {
  const plan = buildSandboxPlan(options)

  if (options.printPlan) {
    console.log(JSON.stringify(plan, null, 2))
    return
  }

  await connect(
    async (client) => {
      const source = client.host().directory(options.repoRoot, {
        exclude: plan.sourceExcludes,
        gitignore: false,
        noCache: true,
      })

      let container = client.container()
        .from(plan.image)
        .withDirectory('/src', source)
        .withNewFile('/sandbox/run-e2e.sh', buildSandboxShell(plan), { permissions: 0o755 })
        .withMountedCache('/root/.pnpm-store', client.cacheVolume('fulcrum-sandbox-pnpm-store'))
        .withMountedTemp('/tmp')
        .withEnvVariable('PLAYWRIGHT_BROWSERS_PATH', '/ms-playwright')

      container = withHostConfig(container, client, plan.configMounts)
      container = withHostConfig(container, client, plan.supportConfigMounts)
      container = withHostConfig(container, client, plan.projectConfigMounts)
      container = withLiveAgentSecrets(container, client, plan, process.env)

      const result = container.withExec(['bash', '/sandbox/run-e2e.sh'], {
        expect: DaggerReturnType.Any,
      })

      await result.directory(SANDBOX_REPORT_DIR).export(plan.outputDir, { wipe: true })

      const exitCodeText = await result.file(`${SANDBOX_REPORT_DIR}/exit-code`).contents()
      const exitCode = Number.parseInt(exitCodeText.trim(), 10)
      if (exitCode !== 0) {
        throw new Error(`Sandbox E2E failed with exit code ${exitCode}; see ${plan.outputDir}`)
      }
    },
    { LogOutput: process.stderr },
  )
}

const entrypoint = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === entrypoint) {
  runSandbox().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
