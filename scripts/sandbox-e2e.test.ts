import { describe, expect, it } from 'vitest'
import {
  ROOT_LOCAL_CONFIG_PATHS,
  SOURCE_EXCLUDES,
  SUPPORT_CONFIG_PATHS,
  buildLiveAgentPlans,
  buildSandboxCommands,
  buildSandboxPlan,
  buildSandboxShell,
  detectProjectConfigMounts,
  parseSandboxOptions,
  type HostConfigMount,
} from './sandbox-e2e.js'

describe('sandbox e2e harness', () => {
  it('parses default options as full deterministic suite without live agents', () => {
    const options = parseSandboxOptions([], {
      FULCRUM_SANDBOX_HOST_HOME: '/tmp/home',
    })

    expect(options.fullSuite).toBe(true)
    expect(options.liveAgents).toBe(false)
    expect(options.hostHome).toBe('/tmp/home')
    expect(options.outputDir).toContain('sandbox-reports')
  })

  it('accepts pnpm literal separator before sandbox flags', () => {
    const options = parseSandboxOptions(['--', '--smoke', '--output', 'out'], {
      FULCRUM_SANDBOX_HOST_HOME: '/tmp/home',
    })

    expect(options.fullSuite).toBe(false)
    expect(options.outputDir).toMatch(/out$/)
  })

  it('keeps host-only state out of the source snapshot', () => {
    expect(SOURCE_EXCLUDES).toEqual(expect.arrayContaining([
      '.git',
      'node_modules',
      'sandbox-reports',
      'test-results',
      '.fulcrum',
      '/.claude',
      '.env',
      '*.db',
    ]))
    expect(ROOT_LOCAL_CONFIG_PATHS).toEqual(expect.arrayContaining([
      '.claude',
      '.codex',
      '.cursor',
      '.windsurf',
    ]))
    expect(SUPPORT_CONFIG_PATHS).toEqual(expect.arrayContaining([
      '.agents',
      '.raise',
      '.config/gh',
    ]))
  })

  it('builds full command matrix for package, install, and monitor checks', () => {
    const commands = buildSandboxCommands(true)

    expect(commands).toEqual(expect.arrayContaining([
      'pnpm build',
      'pnpm test',
      'pnpm run check:cycles',
      'pnpm --dir scripts test -- sandbox-scenarios',
      'pnpm run setup:dry',
      'pnpm --dir packages/cli exec vitest run src/tests/install-verify.test.ts src/tests/install-verify-mode-version-pr148.test.ts src/tests/init-cursor.test.ts src/tests/install-fanout-utilization.test.ts',
      'FULCRUM_SETUP_NO_GATE=1 pnpm run setup',
      'pnpm run setup:check',
      './fulcrum install apply --all',
      './fulcrum install verify --agent cursor',
      './fulcrum install verify --agent windsurf',
      './fulcrum install verify --agent codex',
      './fulcrum install verify --agent opencode',
      './fulcrum install verify --agent copilot',
      'pnpm run e2e:sandbox-scenarios',
      'pnpm run e2e:agent-chat',
      'pnpm run e2e:monitor',
    ]))
  })

  it('skips all live agent installs unless explicitly enabled', () => {
    const plans = buildLiveAgentPlans([], {}, false)

    expect(plans.every((plan) => !plan.shouldInstall)).toBe(true)
    expect(plans.every((plan) => plan.skipReason === 'live agent path disabled')).toBe(true)
  })

  it('installs only live agents with copied config and credentials', () => {
    const configMounts: HostConfigMount[] = [{
      agent: 'claude',
      hostPath: '/host/.claude',
      sandboxPath: '/host-config/claude/dot-claude',
      homeRelativePath: '.claude',
      kind: 'directory',
    }]
    const plans = buildLiveAgentPlans(configMounts, { ANTHROPIC_API_KEY: 'test' }, true)

    expect(plans.find((plan) => plan.agent === 'claude')).toMatchObject({
      shouldInstall: true,
      skipReason: undefined,
    })
    expect(plans.find((plan) => plan.agent === 'gemini')).toMatchObject({
      shouldInstall: false,
      skipReason: 'missing config copy',
    })
  })

  it('has noninteractive install defaults for terminal agent CLIs with known packages', () => {
    const configMounts: HostConfigMount[] = [{
      agent: 'opencode',
      hostPath: '/host/.opencode',
      sandboxPath: '/host-config/opencode/dot-opencode',
      homeRelativePath: '.opencode',
      kind: 'directory',
    }, {
      agent: 'copilot',
      hostPath: '/host/.copilot',
      sandboxPath: '/host-config/copilot/dot-copilot',
      homeRelativePath: '.copilot',
      kind: 'directory',
    }]
    const plans = buildLiveAgentPlans(configMounts, {}, true)

    expect(plans.find((plan) => plan.agent === 'opencode')).toMatchObject({
      shouldInstall: true,
      installCommand: 'npm install -g opencode-ai',
    })
    expect(plans.find((plan) => plan.agent === 'copilot')).toMatchObject({
      binary: 'copilot',
      shouldInstall: true,
      installCommand: 'npm install -g @github/copilot',
    })
  })

  it('generates shell that copies source and config into fake home only', () => {
    const plan = buildSandboxPlan({
      repoRoot: '/repo',
      outputDir: '/tmp/reports',
      hostHome: '/tmp/no-home',
      image: 'image:test',
      liveAgents: false,
      fullSuite: false,
      printPlan: false,
    }, {})
    plan.configMounts = [{
      agent: 'codex',
      hostPath: '/host/.codex',
      sandboxPath: '/host-config/codex/dot-codex',
      homeRelativePath: '.codex',
      kind: 'directory',
    }]
    plan.supportConfigMounts = [{
      agent: 'agent-support',
      hostPath: '/host/.agents',
      sandboxPath: '/host-support-config/dot-agents',
      homeRelativePath: '.agents',
      kind: 'directory',
    }]

    const shell = buildSandboxShell(plan)

    expect(shell).toContain('export HOME=/sandbox/home')
    expect(shell).toContain('export FULCRUM_E2E_REPORT_DIR="$REPORT_DIR"')
    expect(shell).toContain('export FULCRUM_SANDBOX_AGENT_CHAT=0')
    expect(shell).toContain('export FULCRUM_AGENT_CHAT_REQUIRE_AUTH=0')
    expect(shell).toContain('cp -a /src /work/fulcrum')
    expect(shell).toContain('chmod -R a-w /src')
    expect(shell).toContain("rm -rf '/work/fulcrum/.claude'")
    expect(shell).toContain("rm -rf '/work/fulcrum/.codex'")
    expect(shell).toContain("cp -a '/host-config/codex/dot-codex' '/sandbox/home/.codex'")
    expect(shell).toContain("cp -a '/host-support-config/dot-agents' '/sandbox/home/.agents'")
    expect(shell).toContain('sandbox-plan.json')
    expect(shell).toContain('live-agents.md')
    expect(shell).toContain('rm -rf "$REPORT_DIR/playwright-data/fulcrum/models"')
  })

  it('copies project-local agent config into the sandbox workdir copy', () => {
    const mounts = detectProjectConfigMounts('/repo')
    expect(mounts).toEqual([])

    const plan = buildSandboxPlan({
      repoRoot: '/repo',
      outputDir: '/tmp/reports',
      hostHome: '/tmp/no-home',
      image: 'image:test',
      liveAgents: false,
      fullSuite: false,
      printPlan: false,
    }, {})
    plan.projectConfigMounts = [{
      agent: 'opencode',
      hostPath: '/repo/.opencode',
      sandboxPath: '/host-project-config/dot-opencode',
      homeRelativePath: '.opencode',
      kind: 'directory',
    }]

    const shell = buildSandboxShell(plan)

    expect(shell).toContain("rm -rf '/work/fulcrum/.opencode'")
    expect(shell).toContain("cp -a '/host-project-config/dot-opencode' '/work/fulcrum/.opencode'")
    expect(shell).toContain('project-config-copy.txt')
    expect(shell.indexOf('pnpm --dir scripts test -- sandbox-scenarios')).toBeLessThan(
      shell.indexOf("cp -a '/host-project-config/dot-opencode' '/work/fulcrum/.opencode'"),
    )
    expect(shell.indexOf("cp -a '/host-project-config/dot-opencode' '/work/fulcrum/.opencode'")).toBeLessThan(
      shell.indexOf("run_step 'pnpm-run-setup-dry' 'pnpm run setup:dry'"),
    )
  })

  it('propagates agent-chat controls into the sandbox shell', () => {
    const plan = buildSandboxPlan({
      repoRoot: '/repo',
      outputDir: '/tmp/reports',
      hostHome: '/tmp/no-home',
      image: 'image:test',
      liveAgents: false,
      fullSuite: false,
      printPlan: false,
    }, {
      FULCRUM_AGENT_CHAT_RUNTIMES: 'claude,codex',
      FULCRUM_AGENT_CHAT_REQUIRE_AUTH: '0',
      FULCRUM_AGENT_CHAT_STRICT: '1',
      FULCRUM_AGENT_CHAT_TIMEOUT_MS: '60000',
    })

    const shell = buildSandboxShell(plan)

    expect(shell).toContain("export FULCRUM_AGENT_CHAT_RUNTIMES='claude,codex'")
    expect(shell).toContain("export FULCRUM_AGENT_CHAT_REQUIRE_AUTH='0'")
    expect(shell).toContain("export FULCRUM_AGENT_CHAT_STRICT='1'")
    expect(shell).toContain("export FULCRUM_AGENT_CHAT_TIMEOUT_MS='60000'")
  })
})
