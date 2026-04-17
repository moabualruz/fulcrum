#!/usr/bin/env tsx
/**
 * fulcrum-mcp — zero-install MCP server for Fulcrum agent OS.
 *
 * Usage:
 *   npx fulcrum-mcp                    # stdio MCP server (Claude Desktop)
 *   npx fulcrum-mcp init               # detect agents and configure all of them
 *   npx fulcrum-mcp init --dry-run     # show what would be configured without writing
 *   npx fulcrum-mcp --no-monitor       # suppress auto-started monitor
 *
 * Claude Desktop / Claude Code config:
 *   {
 *     "mcpServers": {
 *       "fulcrum": {
 *         "command": "npx",
 *         "args": ["-y", "fulcrum-mcp"]
 *       }
 *     }
 *   }
 *
 * Or, if installed globally (npm install -g fulcrum-mcp):
 *   fulcrum-mcp
 *
 * This thin wrapper delegates to fulcrum-agent-cli's `serve mcp` command so that
 * the full Fulcrum tool set is available without a separate `fulcrum` binary
 * install. The monitor HTTP server auto-starts on port 4721 by default.
 */

const argv = process.argv.slice(2)

// ── `npx fulcrum-mcp init` — zero-friction agent setup ──────────────────────
if (argv[0] === 'init') {
  await runInit(argv.slice(1))
  process.exit(0)
}

// ── Default: start the MCP server ────────────────────────────────────────────
// Inject the subcommand into argv so fulcrum-agent-cli's dispatch hits `serve mcp`
// before fulcrum-agent-cli processes process.argv.
process.argv.splice(2, 0, 'serve', 'mcp')

// Delegate to fulcrum-agent-cli — all tool logic lives there.
await import('fulcrum-agent-cli')

// ── Init implementation ───────────────────────────────────────────────────────

async function runInit(initArgs: string[]): Promise<void> {
  const { existsSync, mkdirSync, readFileSync, writeFileSync } = await import('fs')
  const { join, resolve } = await import('path')
  const { homedir } = await import('os')
  const { spawnSync } = await import('child_process')

  const dryRun = initArgs.includes('--dry-run')
  const home = homedir()

  console.log(`\n⬡ Fulcrum MCP — Zero-friction installer${dryRun ? ' (dry-run)' : ''}\n`)

  // ── Agent detection ─────────────────────────────────────────────────────────

  interface AgentConfig {
    name: string
    detected: boolean
    reason: string
  }

  const agents: AgentConfig[] = [
    {
      name: 'Claude Code',
      detected: existsSync(join(home, '.claude')) || existsSync(join(home, '.claude.json')),
      reason: '~/.claude/ directory detected',
    },
    {
      name: 'Gemini CLI',
      detected: existsSync(join(home, '.gemini')),
      reason: '~/.gemini/ directory detected',
    },
    {
      name: 'Cursor',
      detected: existsSync(join(home, '.cursor')) || existsSync(join(process.cwd(), '.cursor')),
      reason: '~/.cursor/ or .cursor/ in CWD detected',
    },
    {
      name: 'Windsurf',
      detected: existsSync(join(home, '.windsurf')) || existsSync(join(process.cwd(), '.windsurf')),
      reason: '~/.windsurf/ or .windsurf/ in CWD detected',
    },
  ]

  const detected = agents.filter(a => a.detected)

  console.log('Detected agent runtimes:')
  for (const a of agents) {
    console.log(`  ${a.detected ? '✓' : '○'} ${a.name}${a.detected ? ` (${a.reason})` : ''}`)
  }
  console.log('')

  if (detected.length === 0) {
    console.log('No supported agent runtimes detected.')
    console.log('Supported: Claude Code, Gemini CLI, Cursor, Windsurf')
    console.log('')
    console.log('Install one of the above, then re-run: npx fulcrum-mcp@latest init')
    return
  }

  // ── MCP config templates ────────────────────────────────────────────────────
  const defaultMcpEntry = {
    mcpServers: {
      fulcrum: {
        command: 'npx',
        args: ['-y', 'fulcrum-mcp', 'serve', 'mcp', '--mode', 'filtered'],
      },
    },
  }

  const hookAwareMcpEntry = {
    mcpServers: {
      fulcrum: {
        command: 'npx',
        args: ['-y', 'fulcrum-mcp', 'serve', 'mcp', '--mode', 'filtered', '--runtime-capability', 'hooks'],
      },
    },
  }

  // ── Fulcrum context block (rules / CLAUDE.md) ───────────────────────────────
const fulcrumContextBlock = `
# Fulcrum Agent OS — CLI-First Integration

## Execution Preference
- Native hooks when available
- \`fulcrum action exec <action>\` as the standard execution path
- MCP tools only when the runtime truly needs direct MCP exposure

## Agent Lifecycle
1. Session start: call \`fulcrum action exec get_current_context\`
2. Before task: call \`fulcrum action exec start_agent_run\` with your role and task_id
3. During long tasks: call \`fulcrum action exec heartbeat_agent_run\`
4. When blocked: call \`fulcrum action exec block_agent_run\`
5. On completion: call \`fulcrum action exec complete_agent_run\`

## MCP Compatibility
When a client is MCP-native, the Fulcrum MCP server exposes a filtered compatibility surface for the same actions.

## Monitor Dashboard
Start \`fulcrum serve monitor\` for web UI at http://localhost:4721
`.trim()

  const steps: Array<{ label: string; ok: boolean; detail?: string }> = []

  function step(label: string, action: () => void): void {
    try {
      if (!dryRun) action()
      steps.push({ label, ok: true, detail: dryRun ? '(dry-run)' : undefined })
    } catch (err) {
      steps.push({ label, ok: false, detail: (err as Error).message })
    }
  }

  function writeJson(path: string, data: unknown): void {
    const dir = resolve(path, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  }

  function writeText(path: string, content: string): void {
    const dir = resolve(path, '..')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(path, content, 'utf-8')
  }

  function mergeJsonKey(path: string, key: string, value: unknown): void {
    let existing: Record<string, unknown> = {}
    try { existing = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown> } catch {}
    existing[key] = value
    writeText(path, JSON.stringify(existing, null, 2) + '\n')
  }

  // ── Configure Claude Code ───────────────────────────────────────────────────
  if (detected.find(a => a.name === 'Claude Code')) {
    console.log('Configuring Claude Code...')

    const claudeDir = join(home, '.claude')
    const settingsPath = join(claudeDir, 'settings.json')

    step('Write MCP server to ~/.claude/settings.json', () => {
      mergeJsonKey(settingsPath, 'mcpServers', hookAwareMcpEntry.mcpServers)
    })

    const hookCmd = 'npx -y fulcrum-mcp hook auto'
    step('Write PreToolUse hook to ~/.claude/settings.json', () => {
      const settings = (() => {
        try { return JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown> } catch { return {} }
      })()
      const hooks = (settings['hooks'] as Record<string, unknown> | undefined) ?? {}
      const preToolUse = (hooks['PreToolUse'] as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> | undefined) ?? []
      // Add only if not already present
      const alreadyHas = preToolUse.some(h => h.hooks?.some(hh => hh.command?.includes('fulcrum-mcp hook auto') || hh.command?.includes('fulcrum hook')))
      if (!alreadyHas) {
        preToolUse.push({
          matcher: '',
          hooks: [{ type: 'command', command: hookCmd }],
        })
        hooks['PreToolUse'] = preToolUse
        settings['hooks'] = hooks
        writeText(settingsPath, JSON.stringify(settings, null, 2) + '\n')
      }
    })

    step('Write CLAUDE.md context block to ~/.claude/CLAUDE.md', () => {
      const claudeMdPath = join(claudeDir, 'CLAUDE.md')
      const marker = '<!-- fulcrum-mcp -->'
      let content = ''
      try { content = readFileSync(claudeMdPath, 'utf-8') } catch {}
      if (!content.includes(marker)) {
        content += `\n${marker}\n${fulcrumContextBlock}\n${marker}\n`
        writeText(claudeMdPath, content)
      }
    })

    console.log('')
  }

  // ── Configure Gemini CLI ────────────────────────────────────────────────────
  if (detected.find(a => a.name === 'Gemini CLI')) {
    console.log('Configuring Gemini CLI...')
    const geminiDir = join(home, '.gemini')

    step('Write MCP server to ~/.gemini/settings.json', () => {
      mergeJsonKey(join(geminiDir, 'settings.json'), 'mcpServers', hookAwareMcpEntry.mcpServers)
    })

    step('Write GEMINI.md context block to ~/.gemini/GEMINI.md', () => {
      const geminiMdPath = join(geminiDir, 'GEMINI.md')
      const marker = '<!-- fulcrum-mcp -->'
      let content = ''
      try { content = readFileSync(geminiMdPath, 'utf-8') } catch {}
      if (!content.includes(marker)) {
        content += `\n${marker}\n${fulcrumContextBlock}\n${marker}\n`
        writeText(geminiMdPath, content)
      }
    })

    console.log('')
  }

  // ── Configure Cursor ────────────────────────────────────────────────────────
  if (detected.find(a => a.name === 'Cursor')) {
    console.log('Configuring Cursor...')
    const cursorDir = existsSync(join(home, '.cursor')) ? join(home, '.cursor') : join(process.cwd(), '.cursor')

    step('Write .cursor/mcp.json', () => {
      writeJson(join(cursorDir, 'mcp.json'), defaultMcpEntry)
    })

    step('Write .cursor/rules/fulcrum.mdc', () => {
      const mdcContent = `---\nalwaysApply: true\n---\n\n${fulcrumContextBlock}\n`
      writeText(join(cursorDir, 'rules', 'fulcrum.mdc'), mdcContent)
    })

    console.log('')
  }

  // ── Configure Windsurf ──────────────────────────────────────────────────────
  if (detected.find(a => a.name === 'Windsurf')) {
    console.log('Configuring Windsurf...')
    const windsurfDir = existsSync(join(home, '.windsurf')) ? join(home, '.windsurf') : join(process.cwd(), '.windsurf')

    step('Write .windsurf/mcp.json', () => {
      writeJson(join(windsurfDir, 'mcp.json'), defaultMcpEntry)
    })

    step('Write .windsurf/rules/fulcrum.mdc', () => {
      const mdcContent = `---\nalwaysApply: true\n---\n\n${fulcrumContextBlock}\n`
      writeText(join(windsurfDir, 'rules', 'fulcrum.mdc'), mdcContent)
    })

    console.log('')
  }

  // ── Results summary ─────────────────────────────────────────────────────────
  console.log('Setup results:')
  for (const s of steps) {
    console.log(`  ${s.ok ? '✓' : '✗'} ${s.label}${s.detail ? ` ${s.detail}` : ''}`)
  }

  const failed = steps.filter(s => !s.ok)
  if (failed.length > 0) {
    console.log(`\n⚠  ${failed.length} step(s) failed. Check errors above.`)
  }

  // ── Run doctor to verify ────────────────────────────────────────────────────
  console.log('\nRunning health check...')
  const doctorResult = spawnSync('npx', ['-y', 'fulcrum-mcp', 'serve', 'mcp', '--no-monitor', '--version'], {
    stdio: 'pipe', timeout: 10000,
  })
  if (doctorResult.status === 0) {
    console.log('  ✓ fulcrum-mcp is functional')
  } else {
    console.log('  ○ Could not verify MCP server — try running `npx fulcrum-mcp` manually')
  }

  console.log('\nNext steps:')
  if (detected.find(a => a.name === 'Claude Code')) {
    console.log('  • Restart Claude Code to load the MCP server')
    console.log('  • The Fulcrum MCP tools will appear in your next Claude Code session')
  }
  if (detected.find(a => a.name === 'Cursor')) {
    console.log('  • In Cursor: open the MCP panel and enable "fulcrum" server')
  }
  if (detected.find(a => a.name === 'Windsurf')) {
    console.log('  • In Windsurf: open settings and enable the Fulcrum MCP server')
  }
  if (detected.find(a => a.name === 'Gemini CLI')) {
    console.log('  • Run `gemini` in a new shell — Fulcrum tools should be available')
  }
  console.log('\n  Note: L2 memory acceleration (Kuzu/HNSW) is opt-in:')
  console.log('  Run `npx fulcrum-mcp memory accelerate` to enable it.\n')

  if (dryRun) {
    console.log('(dry-run: no files were written)\n')
  }
}
