# Plan: CLI Plugin Architecture

**Gaps addressed**: GAP-PLUGIN-1 through GAP-PLUGIN-7  
**Priority order**: Critical first (dead code wiring), then Major  
**Files**: `packages/cli/src/index.ts`, `packages/cli/src/plugin-discovery.ts`, `packages/cli/src/mcp-server.ts`

---

## Step 1 — Critical: Wire plugin discovery (GAP-PLUGIN-1)

In `packages/cli/src/index.ts`, near the top (before the `group`/`command` routing):

```typescript
import { discoverPlugins, registerPlugins } from './plugin-discovery.js'

// Discover and register plugins from node_modules + globalDataDir()/plugins/
const discoveredPlugins = discoverPlugins(process.cwd())
const registration = registerPlugins(discoveredPlugins)

// Load hook modules (executed when `hook claude/gemini/pi` is called)
for (const hookModulePath of registration.hookModules) {
  await import(hookModulePath)
}
```

This activates any installed Fulcrum plugin immediately. Zero new logic — the code exists, it just needs to be called.

---

## Step 2 — Major: Global plugin directory scan (GAP-PLUGIN-5)

In `plugin-discovery.ts`, extend `discoverPlugins()` to also scan `globalDataDir()/plugins/`:

```typescript
export function discoverPlugins(startDir: string = process.cwd()): DiscoveredPlugin[] {
  const plugins: DiscoveredPlugin[] = []
  
  // 1. Project-local scan (existing)
  const nmDir = findNodeModules(startDir)
  if (nmDir) plugins.push(...scanNmDir(nmDir))
  
  // 2. User-global scan
  const { globalDataDir } = await import('@moabualruz/fulcrum-core')
  const globalPluginsDir = join(globalDataDir(), 'plugins')
  if (existsSync(globalPluginsDir)) plugins.push(...scanPluginDir(globalPluginsDir))
  
  return plugins
}
```

Each subdirectory of `globalDataDir()/plugins/` is treated as a plugin with a `package.json` that declares the `"fulcrum"` key.

---

## Step 3 — Major: Plugin management commands (GAP-PLUGIN-4)

Add a `plugin` command group to `index.ts`:

```
plugin list                    — calls discoverPlugins(), prints found plugins
plugin install <npm-pkg>       — runs `npm install <pkg>`, validates manifest
plugin link <local-path>       — symlinks local dir into globalDataDir()/plugins/
plugin remove <name>           — removes from globalDataDir()/plugins/
```

Implementation notes:
- `plugin list` just calls and prints `discoverPlugins()` output (zero new logic)
- `plugin install` shells out to `npm install --prefix globalDataDir()/plugins/ <pkg>` and validates the resulting `package.json["fulcrum"]` key
- `plugin link` creates a symlink in `globalDataDir()/plugins/<name>` pointing to the local path

---

## Step 4 — Major: Settings/secrets in manifest (GAP-PLUGIN-3)

Extend `FulcrumPluginManifest` in `plugin-discovery.ts`:

```typescript
export interface FulcrumPluginManifest {
  type: 'plugin'
  hooks?: string
  skills?: string
  agents?: string
  settings?: Array<{
    name: string
    envVar: string
    description?: string
    sensitive?: boolean   // if true, offer to store in globalDataDir()/plugins/<name>/.env
  }>
}
```

During `plugin install`, iterate `settings` and prompt for any that are not already set as env vars. Store non-sensitive values in `globalDataDir()/plugins/<name>/.env`; for sensitive values, print instructions to set the env var securely.

---

## Step 5 — Major: Inbound hook middleware (GAP-PLUGIN-2)

Add a lightweight middleware chain to `mcp-server.ts`'s `handleToolCall`. This is a significant change — do it incrementally:

Phase A (this plan): Add the hook array and call site with no hooks registered.
```typescript
type ToolMiddleware = (name: string, args: unknown, next: () => Promise<unknown>) => Promise<unknown>
const toolMiddlewares: ToolMiddleware[] = []

export function registerToolMiddleware(mw: ToolMiddleware): void {
  toolMiddlewares.push(mw)
}

// In the tool call path:
const callChain = toolMiddlewares.reduceRight(
  (next, mw) => (name: string, args: unknown) => mw(name, args, () => next(name, args)),
  baseHandler
)
```

Phase B (plugin authoring guide): document how plugin hook modules call `registerToolMiddleware()` at load time.

---

## Step 6 — Major: Plugin-extensible MCP tools (GAP-PLUGIN-7)

Change `createFulcrumMcpServer()` signature:

```typescript
export function createFulcrumMcpServer(
  options: McpServerOptions & { additionalTools?: typeof TOOL_SCHEMAS }
): McpServer {
  const allTools = [...TOOL_SCHEMAS, ...(options.additionalTools ?? [])]
  // ... rest unchanged
}
```

In the `serve mcp` path in `index.ts`, collect tool contributions from loaded plugin modules and pass them in.

---

## Step 7 — Minor: Trust declaration in manifest (GAP-PLUGIN-6)

Add `trust?: 'verified' | 'community' | 'local'` to `FulcrumPluginManifest` and log a warning during `plugin install` if trust is not `verified`. Create `PLUGIN-AUTHORING.md` documenting in-process execution model.

---

## Acceptance Criteria

- [ ] `discoverPlugins()` is called on CLI startup
- [ ] Plugin hook modules are loaded and active
- [ ] `fulcrum plugin list` works
- [ ] `fulcrum plugin install <npm-pkg>` installs to `globalDataDir()/plugins/`
- [ ] Global plugin directory scanned alongside project `node_modules`
- [ ] `createFulcrumMcpServer({ additionalTools })` parameter accepted
- [ ] All existing tests pass
