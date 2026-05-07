// mcp-builtins.ts — canonical list of all Fulcrum-managed MCP servers.
//
// install.ts iterates BUILTIN_MCPS and calls registerServer for each entry.
// uninstall.ts relies on the registry alone (already does; no change needed).
//
// Wave 2: github, repomix (previously inline in install.ts — hoisted here).
// Wave 3: semgrep, context7, tavily, playwright, dart, cloudflare-* suite.

import type { McpServerSpec } from "./mcp-registry.ts";

const ALL_VISIBLE = {
  "claude-code": true, codex: true, gemini: true, opencode: true, pi: true,
} as const;

const NON_CLAUDE_VISIBLE = {
  "claude-code": false, codex: true, gemini: true, opencode: true, pi: true,
} as const;

const REPOMIX_REGISTRY_VISIBLE = {
  "claude-code": false, codex: true, gemini: false, opencode: true, pi: true,
} as const;

// ── Wave 2 ─────────────────────────────────────────────────────────────────

export const DEFAULT_DEEPWIKI_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://mcp.deepwiki.com/mcp",
  description: "DeepWiki MCP server — repository documentation and codebase Q&A",
  vendor: "deepwiki",
  default_enabled: false,
  auth_env_vars: [],
  agent_visibility: { ...ALL_VISIBLE },
};

export const DEFAULT_GITHUB_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://api.githubcopilot.com/mcp/",
  description: "Official GitHub MCP server — repos, issues, PRs, Actions, code search",
  vendor: "github",
  default_enabled: false,
  auth_env_vars: ["GITHUB_TOKEN"],
  agent_visibility: { ...ALL_VISIBLE },
};

export const DEFAULT_REPOMIX_SERVER: McpServerSpec = {
  transport: "stdio",
  command: "npx -y repomix@latest --mcp",
  description: "Repomix MCP server — pack repo into AI-friendly format",
  vendor: "yamadashy",
  default_enabled: false,
  auth_env_vars: [],
  // Claude Code and Gemini get Repomix MCP through package/extension surfaces
  // that also carry commands/agents/skills. Registry owns only agents without
  // a native package surface carrying the MCP.
  agent_visibility: { ...REPOMIX_REGISTRY_VISIBLE },
};

// ── Wave 3 ─────────────────────────────────────────────────────────────────

/** W3.3 — Semgrep: in-binary stdio MCP via `semgrep mcp`. */
export const DEFAULT_SEMGREP_SERVER: McpServerSpec = {
  transport: "stdio",
  command: "semgrep mcp",
  description: "Semgrep MCP server — static analysis and code security scanning",
  vendor: "semgrep",
  default_enabled: false,
  auth_env_vars: [],
  agent_visibility: { ...ALL_VISIBLE },
};

/** W3.4 — Context7: remote HTTP MCP at mcp.context7.com. */
export const DEFAULT_CONTEXT7_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://mcp.context7.com/mcp",
  description: "Context7 MCP server — up-to-date library docs for AI code editors",
  vendor: "upstash",
  default_enabled: false,
  // Context7 free tier can answer without auth, but declaring the env var is
  // how Fulcrum wires bearer auth for users who configure the key.
  auth_env_vars: ["CONTEXT7_API_KEY"],
  agent_visibility: { ...ALL_VISIBLE },
};

/** W3.5 — Tavily: remote HTTP MCP. Auth: TAVILY_API_KEY required. */
export const DEFAULT_TAVILY_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://mcp.tavily.com/mcp/",
  description: "Tavily MCP server — real-time web search, extract, map and crawl",
  vendor: "tavily-ai",
  default_enabled: false,
  auth_env_vars: ["TAVILY_API_KEY"],
  agent_visibility: { ...ALL_VISIBLE },
};

/** W3.6 — Playwright: stdio MCP via npx. No auth. */
export const DEFAULT_PLAYWRIGHT_SERVER: McpServerSpec = {
  transport: "stdio",
  command: "npx -y @playwright/mcp@latest",
  description: "Playwright MCP server — browser automation via accessibility snapshots",
  vendor: "microsoft",
  default_enabled: false,
  auth_env_vars: [],
  agent_visibility: { ...ALL_VISIBLE },
};

/** W3.7 — Cloudflare hosted MCP suite. One entry per endpoint. */
// Docs endpoint is public (no auth required); all others need CLOUDFLARE_API_TOKEN.
export const DEFAULT_CLOUDFLARE_DOCS_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://docs.mcp.cloudflare.com/mcp",
  description: "Cloudflare documentation MCP server — reference information (public, no auth)",
  vendor: "cloudflare",
  default_enabled: false,
  auth_env_vars: [],
  // Claude Code gets this endpoint through Cloudflare's plugin package
  // (`cloudflare@cloudflare`); registry owns direct config for other agents.
  agent_visibility: { ...NON_CLAUDE_VISIBLE },
};

export const DEFAULT_CLOUDFLARE_WORKERS_BINDINGS_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://bindings.mcp.cloudflare.com/mcp",
  description: "Cloudflare Workers Bindings MCP — storage, AI, compute primitives",
  vendor: "cloudflare",
  default_enabled: false,
  auth_env_vars: ["CLOUDFLARE_API_TOKEN"],
  agent_visibility: { ...NON_CLAUDE_VISIBLE },
};

export const DEFAULT_CLOUDFLARE_WORKERS_BUILDS_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://builds.mcp.cloudflare.com/mcp",
  description: "Cloudflare Workers Builds MCP — CI/build insights and management",
  vendor: "cloudflare",
  default_enabled: false,
  auth_env_vars: ["CLOUDFLARE_API_TOKEN"],
  agent_visibility: { ...NON_CLAUDE_VISIBLE },
};

export const DEFAULT_CLOUDFLARE_OBSERVABILITY_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://observability.mcp.cloudflare.com/mcp",
  description: "Cloudflare Observability MCP — Workers logs and observability",
  vendor: "cloudflare",
  default_enabled: false,
  auth_env_vars: ["CLOUDFLARE_API_TOKEN"],
  agent_visibility: { ...NON_CLAUDE_VISIBLE },
};

export const DEFAULT_CLOUDFLARE_RADAR_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://radar.mcp.cloudflare.com/mcp",
  description: "Cloudflare Radar MCP — global internet traffic and security insights",
  vendor: "cloudflare",
  default_enabled: false,
  auth_env_vars: ["CLOUDFLARE_API_TOKEN"],
  agent_visibility: { ...ALL_VISIBLE },
};

export const DEFAULT_CLOUDFLARE_LOGPUSH_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://logs.mcp.cloudflare.com/mcp",
  description: "Cloudflare Logpush MCP — Logpush job health summaries",
  vendor: "cloudflare",
  default_enabled: false,
  auth_env_vars: ["CLOUDFLARE_API_TOKEN"],
  agent_visibility: { ...ALL_VISIBLE },
};

export const DEFAULT_CLOUDFLARE_BROWSER_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://browser.mcp.cloudflare.com/mcp",
  description: "Cloudflare Browser Rendering MCP — serverless browser automation",
  vendor: "cloudflare",
  default_enabled: false,
  auth_env_vars: ["CLOUDFLARE_API_TOKEN"],
  agent_visibility: { ...ALL_VISIBLE },
};

export const DEFAULT_CLOUDFLARE_CONTAINERS_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://containers.mcp.cloudflare.com/mcp",
  description: "Cloudflare Containers MCP — container management",
  vendor: "cloudflare",
  default_enabled: false,
  auth_env_vars: ["CLOUDFLARE_API_TOKEN"],
  agent_visibility: { ...ALL_VISIBLE },
};

export const DEFAULT_CLOUDFLARE_AI_GATEWAY_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://ai-gateway.mcp.cloudflare.com/mcp",
  description: "Cloudflare AI Gateway MCP — AI request management and observability",
  vendor: "cloudflare",
  default_enabled: false,
  auth_env_vars: ["CLOUDFLARE_API_TOKEN"],
  agent_visibility: { ...ALL_VISIBLE },
};

/** W3.8 — Dart: in-package stdio MCP. Command: `dart mcp-server`. No auth. */
export const DEFAULT_DART_SERVER: McpServerSpec = {
  transport: "stdio",
  command: "dart mcp-server",
  description: "Dart Tooling MCP server — Dart/Flutter analysis, testing and tooling",
  vendor: "dart-lang",
  default_enabled: false,
  auth_env_vars: [],
  agent_visibility: { ...ALL_VISIBLE },
};

// ── Canonical ordered list for install/uninstall iteration ──────────────────

/** All builtin MCP servers, keyed by registry name. */
export const BUILTIN_MCPS: Array<{ name: string; spec: McpServerSpec }> = [
  // Wave 2
  { name: "deepwiki",                     spec: DEFAULT_DEEPWIKI_SERVER },
  { name: "github",                       spec: DEFAULT_GITHUB_SERVER },
  { name: "repomix",                      spec: DEFAULT_REPOMIX_SERVER },
  // Wave 3
  { name: "semgrep",                      spec: DEFAULT_SEMGREP_SERVER },
  { name: "context7",                     spec: DEFAULT_CONTEXT7_SERVER },
  { name: "tavily",                       spec: DEFAULT_TAVILY_SERVER },
  { name: "playwright",                   spec: DEFAULT_PLAYWRIGHT_SERVER },
  // Cloudflare suite
  { name: "cloudflare-docs",              spec: DEFAULT_CLOUDFLARE_DOCS_SERVER },
  { name: "cloudflare-workers-bindings",  spec: DEFAULT_CLOUDFLARE_WORKERS_BINDINGS_SERVER },
  { name: "cloudflare-workers-builds",    spec: DEFAULT_CLOUDFLARE_WORKERS_BUILDS_SERVER },
  { name: "cloudflare-observability",     spec: DEFAULT_CLOUDFLARE_OBSERVABILITY_SERVER },
  { name: "cloudflare-radar",             spec: DEFAULT_CLOUDFLARE_RADAR_SERVER },
  { name: "cloudflare-logpush",           spec: DEFAULT_CLOUDFLARE_LOGPUSH_SERVER },
  { name: "cloudflare-browser",           spec: DEFAULT_CLOUDFLARE_BROWSER_SERVER },
  { name: "cloudflare-containers",        spec: DEFAULT_CLOUDFLARE_CONTAINERS_SERVER },
  { name: "cloudflare-ai-gateway",        spec: DEFAULT_CLOUDFLARE_AI_GATEWAY_SERVER },
  // Dart
  { name: "dart",                         spec: DEFAULT_DART_SERVER },
];

export const MINIMAL_DEFAULT_MCPS = ["deepwiki", "repomix"] as const;
