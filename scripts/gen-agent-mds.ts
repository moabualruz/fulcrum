#!/usr/bin/env node
/**
 * scripts/gen-agent-mds.ts
 *
 * Generates Claude Code subagent Markdown files for all 24 AgentRole slugs.
 * Output: agent-integration/claude/agents/<role>.md
 *
 * Each file has YAML frontmatter consumed by Claude Code when the agent
 * is invoked as a subagent, followed by the role's description from
 * agent-integration/roles/<role>.md.
 *
 * Usage:
 *   node --import tsx/esm scripts/gen-agent-mds.ts
 *   pnpm gen:agent-mds
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const ROOT = resolve(__dirname, '..')
const OUT_DIR = join(ROOT, 'agent-integration', 'claude', 'agents')
const ROLES_DIR = join(ROOT, 'agent-integration', 'roles')

// ── Role definitions ────────────────────────────────────────────────────────

interface RoleDef {
  slug: string
  displayName: string
  description: string
  model: string
  toolsAllowed: string[]
  toolsDenied: string[]
}

/** MCP Fulcrum tools available to all roles. */
const ALL_FULCRUM_TOOLS = [
  'mcp__fulcrum__list_tasks',
  'mcp__fulcrum__create_task',
  'mcp__fulcrum__update_task',
  'mcp__fulcrum__recall_memory',
  'mcp__fulcrum__write_memory',
  'mcp__fulcrum__start_agent_run',
  'mcp__fulcrum__heartbeat_agent_run',
  'mcp__fulcrum__complete_agent_run',
  'mcp__fulcrum__block_agent_run',
  'mcp__fulcrum__get_agent_run_status',
  'mcp__fulcrum__get_workspace_status',
  'mcp__fulcrum__build_cos_context',
]

/** L1 chief_of_staff also gets team tools. */
const L1_EXTRA_TOOLS = [
  'mcp__fulcrum__create_team_template',
  'mcp__fulcrum__invoke_team',
  'mcp__fulcrum__list_team_templates',
  'mcp__fulcrum__list_team_instances',
  'mcp__fulcrum__list_agent_profiles',
  'mcp__fulcrum__create_agent_profile',
]

/** Standard Claude Code file-system tools. */
const FS_READ = ['Read', 'Glob', 'Grep']
const FS_WRITE = ['Write', 'Edit', 'MultiEdit']
const FS_ALL = [...FS_READ, ...FS_WRITE, 'Bash', 'LS']
const FS_READ_BASH = [...FS_READ, 'Bash', 'LS']

const ROLES: RoleDef[] = [
  {
    slug: 'chief_of_staff',
    displayName: 'Chief of Staff',
    description: 'L1 orchestrator. Plans work, delegates to specialist agents, tracks progress. MUST NOT write code or edit files.',
    model: 'claude-opus-4-6',
    toolsAllowed: [...FS_READ, ...ALL_FULCRUM_TOOLS, ...L1_EXTRA_TOOLS],
    toolsDenied: [...FS_WRITE, 'Bash'],
  },
  {
    slug: 'context_gatherer',
    displayName: 'Context Gatherer',
    description: 'Gathers codebase context, reads files, searches for symbols and patterns. Read-only.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ, 'Bash', 'LS', ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE],
  },
  {
    slug: 'prd_planner',
    displayName: 'PRD Planner',
    description: 'Writes Product Requirement Documents and feature specifications.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ, 'Write', ...ALL_FULCRUM_TOOLS],
    toolsDenied: ['Edit', 'MultiEdit', 'Bash'],
  },
  {
    slug: 'implementation_planner',
    displayName: 'Implementation Planner',
    description: 'Creates detailed implementation plans with task breakdowns and file maps.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ, 'Write', ...ALL_FULCRUM_TOOLS],
    toolsDenied: ['Edit', 'MultiEdit', 'Bash'],
  },
  {
    slug: 'issue_decomposer',
    displayName: 'Issue Decomposer',
    description: 'Breaks epics and issues into atomic tasks with clear acceptance criteria.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE, 'Bash'],
  },
  {
    slug: 'software_engineer',
    displayName: 'Software Engineer',
    description: 'Implements features, fixes bugs, and writes tests across the full stack.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_ALL, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [],
  },
  {
    slug: 'research_worker',
    displayName: 'Research Worker',
    description: 'Gathers information from external sources, documentation, and web searches.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ_BASH, 'WebSearch', 'WebFetch', ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE],
  },
  {
    slug: 'refactor_worker',
    displayName: 'Refactor Worker',
    description: 'Refactors code for clarity, performance, and maintainability without changing behaviour.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_ALL, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [],
  },
  {
    slug: 'browser_worker',
    displayName: 'Browser Worker',
    description: 'Automates browser interactions, scrapes web content, and tests UI flows.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ_BASH, 'WebFetch', 'WebSearch', ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE],
  },
  {
    slug: 'data_engineer',
    displayName: 'Data Engineer',
    description: 'Builds data pipelines, schemas, migrations, and ETL processes.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_ALL, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [],
  },
  {
    slug: 'ml_engineer',
    displayName: 'ML Engineer',
    description: 'Trains, evaluates, and deploys machine learning models and pipelines.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_ALL, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [],
  },
  {
    slug: 'devops_engineer',
    displayName: 'DevOps Engineer',
    description: 'Manages infrastructure, CI/CD pipelines, deployments, and monitoring.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_ALL, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [],
  },
  {
    slug: 'architecture_reviewer',
    displayName: 'Architecture Reviewer',
    description: 'Reviews system design, identifies architectural risks, and recommends improvements.',
    model: 'claude-opus-4-6',
    toolsAllowed: [...FS_READ, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE, 'Bash'],
  },
  {
    slug: 'code_reviewer',
    displayName: 'Code Reviewer',
    description: 'Reviews code for correctness, style, security, and maintainability.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE, 'Bash'],
  },
  {
    slug: 'qa_engineer',
    displayName: 'QA Engineer',
    description: 'Writes and runs test suites, identifies edge cases, and validates acceptance criteria.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_ALL, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [],
  },
  {
    slug: 'security_reviewer',
    displayName: 'Security Reviewer',
    description: 'Audits code and configuration for security vulnerabilities and compliance gaps.',
    model: 'claude-opus-4-6',
    toolsAllowed: [...FS_READ, 'Bash', ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE],
  },
  {
    slug: 'integration_worker',
    displayName: 'Integration Worker',
    description: 'Merges branches, resolves conflicts, and validates integrated changes.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_ALL, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [],
  },
  {
    slug: 'documentation_writer',
    displayName: 'Documentation Writer',
    description: 'Writes technical documentation, API references, READMEs, and user guides.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ, 'Write', 'Edit', ...ALL_FULCRUM_TOOLS],
    toolsDenied: ['Bash', 'MultiEdit'],
  },
  {
    slug: 'memory_curator',
    displayName: 'Memory Curator',
    description: 'Consolidates, deduplicates, and improves agent memory quality.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE, 'Bash'],
  },
  {
    slug: 'tech_lead',
    displayName: 'Tech Lead',
    description: 'Provides technical direction, reviews designs, and unblocks engineering teams.',
    model: 'claude-opus-4-6',
    toolsAllowed: [...FS_READ, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE, 'Bash'],
  },
  {
    slug: 'product_manager',
    displayName: 'Product Manager',
    description: 'Defines product requirements, prioritises backlog, and validates user value.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE, 'Bash'],
  },
  {
    slug: 'analyst',
    displayName: 'Analyst',
    description: 'Analyses data, metrics, logs, and usage patterns to surface insights.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ_BASH, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE],
  },
  {
    slug: 'orchestrator',
    displayName: 'Orchestrator',
    description: 'L2 sub-orchestrator for bounded scope. Plans and dispatches within its assigned area; escalates to chief_of_staff.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_READ, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [...FS_WRITE, 'Bash', ...L1_EXTRA_TOOLS],
  },
  {
    slug: 'custom',
    displayName: 'Custom Agent',
    description: 'General-purpose role for custom use cases not covered by the 23 canonical roles.',
    model: 'claude-sonnet-4-6',
    toolsAllowed: [...FS_ALL, ...ALL_FULCRUM_TOOLS],
    toolsDenied: [],
  },
]

// ── Generator ────────────────────────────────────────────────────────────────

function readRoleBody(slug: string): string {
  const rolePath = join(ROLES_DIR, `${slug}.md`)
  if (!existsSync(rolePath)) return ''
  const raw = readFileSync(rolePath, 'utf8')
  // Strip the first `# Title` heading — it's already captured in frontmatter
  return raw.replace(/^#[^\n]*\n/, '').trim()
}

function generate(role: RoleDef): string {
  const allowed = role.toolsAllowed.length > 0
    ? role.toolsAllowed.map(t => `    - ${t}`).join('\n')
    : '    []'
  const denied = role.toolsDenied.length > 0
    ? role.toolsDenied.map(t => `    - ${t}`).join('\n')
    : '    []'

  const body = readRoleBody(role.slug)

  return `---
name: ${role.displayName}
description: >-
  ${role.description}
model: ${role.model}
tools:
  allowed:
${allowed}
  denied:
${denied}
---

${body}
`.trimEnd() + '\n'
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true })

  for (const role of ROLES) {
    const content = generate(role)
    const outPath = join(OUT_DIR, `${role.slug}.md`)
    writeFileSync(outPath, content, 'utf8')
  }

  console.log(`Generated ${ROLES.length} subagent MD files → ${OUT_DIR}`)

  // Validate: count files
  const files = readdirSync(OUT_DIR).filter(f => f.endsWith('.md'))
  if (files.length < ROLES.length) {
    console.error(`ERROR: expected ${ROLES.length} files, found ${files.length}`)
    process.exit(1)
  }
}

main()
