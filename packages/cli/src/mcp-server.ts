// packages/cli/src/mcp-server.ts
// MCP server built on @modelcontextprotocol/sdk (protocol version 2025-11-25).
// Replaces the hand-rolled JSON-RPC 2.0 loop in index.ts.

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { SetLevelRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { TOOL_SCHEMAS } from './mcp-tools.js'
import { getDb, listWorkspaces } from 'fulcrum-core'

// ---------- Types ----------

export type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>

export interface ToolContext {
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  error?: Error
}

export type ToolMiddleware = (ctx: ToolContext, next: () => Promise<void>) => Promise<void>

export interface McpServerOptions {
  version: string
  handleToolCall: ToolHandler
  /**
   * Additional tool schemas contributed by plugins. These are appended after
   * the built-in TOOL_SCHEMAS and registered with the same validation pipeline.
   * Plugin tools are routed through the same handleToolCall handler — plugins
   * must register their own handler logic by name in the hook they provide.
   */
  additionalTools?: import('./mcp-tools.js').ToolSchema[]
  /**
   * Optional middleware chain executed around every tool call.
   * Each middleware receives a ToolContext and a `next` function.
   * Chain runs in order: middleware[0] wraps middleware[1] wraps ... wraps the actual call.
   */
  middleware?: ToolMiddleware[]
  /**
   * Optional predicate to filter which tools are registered with the MCP server.
   * Built by the MCP exposure planner in tool-registry.ts and used by both
   * `fulcrum serve mcp` and `fulcrum serve mcp-http`.
   * When undefined, all tools are registered.
   */
  filter?: (tool: import('./mcp-tools.js').ToolSchema) => boolean
}

// ---------- Zod shape builder ----------
// Converts a JSON Schema-style properties object to a flat Zod shape.
// Handles all types used in our tool schemas, including typed array items
// and nested object items. (GAP-MCP-6: fix silent drop of items.properties)

type JsonSchemaProp = {
  type?: string
  enum?: string[]
  description?: string
  items?: { type?: string; properties?: Record<string, JsonSchemaProp>; required?: string[] }
  properties?: Record<string, JsonSchemaProp>
  required?: string[]
}

function buildZodShape(
  properties: Record<string, JsonSchemaProp>,
  required: string[] = [],
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, prop] of Object.entries(properties)) {
    let base: z.ZodTypeAny
    if (prop.enum && prop.enum.length > 0) {
      // z.enum requires a non-empty tuple
      const [first, ...rest] = prop.enum as [string, ...string[]]
      base = z.enum([first, ...rest])
    } else if (prop.type === 'number') {
      base = z.number()
    } else if (prop.type === 'boolean') {
      base = z.boolean()
    } else if (prop.type === 'array') {
      // Preserve item type information rather than silently using z.unknown()
      const items = prop.items
      if (items?.type === 'string') {
        base = z.array(z.string())
      } else if (items?.type === 'number') {
        base = z.array(z.number())
      } else if (items?.type === 'object' && items.properties) {
        // Nested object array — build a typed item schema
        const itemShape = buildZodShape(items.properties, items.required ?? [])
        base = z.array(z.object(itemShape).passthrough())
      } else {
        base = z.array(z.unknown())
      }
    } else if (prop.type === 'object') {
      if (prop.properties) {
        // Inline nested object — build typed schema
        const nestedShape = buildZodShape(prop.properties, prop.required ?? [])
        base = z.object(nestedShape).passthrough()
      } else {
        base = z.record(z.string(), z.unknown())
      }
    } else {
      base = z.string()
    }
    shape[key] = required.includes(key) ? base : base.optional()
  }
  return shape
}

// ---------- Output schema helpers ----------
// GAP-MCP-5: Per-tool output contracts instead of a single passthrough.
//
// A passthrough Zod object is used as the fallback for read-only tools that
// return arrays (which MCP spec says cannot be top-level outputSchema types)
// and for any tool without an explicit outputSchema definition.
const READ_OUTPUT_SCHEMA = z.object({}).passthrough()

/**
 * Build a Zod schema from a ToolSchema.outputSchema definition.
 * Returns null when the schema is absent or not an object type.
 *
 * All output fields are made optional at the Zod level. The `required`
 * array in the JSON Schema definition serves as documentation (what a
 * successful response guarantees), but runtime enforcement would break
 * test mock handlers and the error response path which returns different
 * shapes. Passthrough allows extra fields (e.g. diagnostic keys).
 */
function buildToolOutputSchema(
  outputSchema: import('./mcp-tools.js').ToolSchema['outputSchema'],
): z.ZodObject<Record<string, z.ZodTypeAny>> | null {
  if (!outputSchema || outputSchema.type !== 'object' || !outputSchema.properties) return null
  // Pass [] as required so all fields are optional in the Zod schema.
  const shape = buildZodShape(outputSchema.properties as Record<string, JsonSchemaProp>, [])
  return z.object(shape).passthrough()
}

// ---------- Progress notification helper ----------
// GAP-MCP-11: Send notifications/progress for long-running tools when the
// caller provides _meta.progressToken. The MCP spec says receivers are not
// obligated to send these, but clients that supply a token expect updates.
//
// We emit two notifications per long-running invocation:
//   • progress=0 / total=1 immediately before dispatch ("starting")
//   • progress=1 / total=1 immediately after dispatch ("done")
// This gives clients a definitive completion signal even for fast calls.

type ProgressExtra = RequestHandlerExtra<ServerRequest, ServerNotification>

async function sendProgressNotification(
  extra: ProgressExtra,
  progressToken: string | number,
  progress: number,
  total: number,
  message?: string,
): Promise<void> {
  try {
    await extra.sendNotification({
      method: 'notifications/progress',
      params: { progressToken, progress, total, ...(message ? { message } : {}) },
    } as ServerNotification)
  } catch {
    // Progress notifications are best-effort; never let a failure here
    // bubble up and break the actual tool response.
  }
}

// ---------- Middleware chain runner ----------
// Composes an array of ToolMiddleware around a core handler function.
// Runs in order: middleware[0] wraps middleware[1] wraps ... wraps core.
// If no middleware is provided, core is called directly.

async function runMiddlewareChain(
  middleware: ToolMiddleware[],
  ctx: ToolContext,
  core: () => Promise<void>,
): Promise<void> {
  let index = 0
  const dispatch = async (): Promise<void> => {
    if (index < middleware.length) {
      const mw = middleware[index++]
      await mw(ctx, dispatch)
    } else {
      await core()
    }
  }
  await dispatch()
}

// ---------- Server factory ----------

export function createFulcrumMcpServer(options: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'fulcrum', version: options.version },
    // Spec §Lifecycle.Capability Negotiation: declare all active features.
    // sampling: {} advertises that this server can make sampling requests to the
    // client (GAP-MCP-13). No active implementation yet — declaration is the
    // first step; callers that don't support sampling will ignore the capability.
    { capabilities: { logging: {}, tools: {}, resources: {}, prompts: {}, sampling: {} } },
  )

  const allTools = [...TOOL_SCHEMAS, ...(options.additionalTools ?? [])]
    .filter(tool => !options.filter || options.filter(tool))

  for (const tool of allTools) {
    const shape = buildZodShape(
      tool.inputSchema.properties as Record<string, JsonSchemaProp>,
      tool.inputSchema.required ?? [],
    )

    // Build a strict z.object for input validation. We validate inside the
    // handler (not as the registered shape) so the MCP SDK still gets the
    // raw shape for capabilities negotiation while we enforce strictness.
    const strictSchema = z.object(shape).strict()

    // GAP-MCP-5: Per-tool output schema. When the tool declares an outputSchema,
    // use a concrete Zod schema so clients can validate structuredContent.
    // For read-only tools without an explicit outputSchema (e.g. list_ tools that
    // return arrays — MCP outputSchema must be an object type at the top level),
    // fall back to the passthrough schema so structuredContent is still present.
    // Write tools without outputSchema get undefined (no structuredContent).
    const isReadTool = tool.annotations?.readOnlyHint === true
    const perToolOutputSchema = buildToolOutputSchema(tool.outputSchema)
    const toolOutputSchema = perToolOutputSchema ?? (isReadTool ? READ_OUTPUT_SCHEMA : undefined)

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: shape,
        outputSchema: toolOutputSchema ?? undefined,
        annotations: tool.annotations ? {
          readOnlyHint: tool.annotations.readOnlyHint,
          idempotentHint: tool.annotations.idempotentHint,
          destructiveHint: tool.annotations.destructiveHint,
          openWorldHint: tool.annotations.openWorldHint,
        } : undefined,
      },
      async (args, extra) => {
        // Validate with strict schema — reject unknown keys and wrong types.
        // Spec §Tools.Error Handling: schema validation failures are protocol
        // errors (throw), not execution errors (isError: true). isError is
        // reserved for runtime failures AFTER successful validation.
        const parsed = strictSchema.safeParse(args)
        if (!parsed.success) {
          const details = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
          // Spec §Tools.Error Handling: schema failures → JSON-RPC -32602 (InvalidParams),
          // not isError:true (which is for runtime errors post-validation).
          throw new McpError(ErrorCode.InvalidParams, `invalid_input: ${details}`)
        }

        // GAP-MCP-11: Emit progress notifications for long-running tools when
        // the caller supplies _meta.progressToken. Two-phase: 0→1 (started→done).
        const progressToken = extra._meta?.progressToken
        const isLongRunning = tool.longRunningHint === true
        if (isLongRunning && progressToken !== undefined) {
          await sendProgressNotification(extra as ProgressExtra, progressToken, 0, 1, 'starting')
        }

        const ctx: ToolContext = { toolName: tool.name, args: parsed.data as Record<string, unknown> }
        try {
          await runMiddlewareChain(
            options.middleware ?? [],
            ctx,
            async () => {
              try {
                ctx.result = await options.handleToolCall(ctx.toolName, ctx.args)
              } catch (err) {
                ctx.error = err as Error
              }
            },
          )
          if (ctx.error) throw ctx.error

          if (isLongRunning && progressToken !== undefined) {
            await sendProgressNotification(extra as ProgressExtra, progressToken, 1, 1, 'done')
          }

          const result = ctx.result
          const textContent = { type: 'text' as const, text: JSON.stringify(result) }
          // Return structuredContent for any tool that has an output schema
          // (either per-tool or the read-only passthrough fallback).
          if (toolOutputSchema !== undefined) {
            return {
              content: [textContent],
              structuredContent: result as Record<string, unknown>,
            }
          }
          return { content: [textContent] }
        } catch (err) {
          if (isLongRunning && progressToken !== undefined) {
            await sendProgressNotification(extra as ProgressExtra, progressToken, 1, 1, 'failed')
          }
          return {
            content: [{ type: 'text' as const, text: JSON.stringify({ error: (err as Error).message }) }],
            isError: true,
          }
        }
      },
    )
  }

  // ---------- Resources ----------
  // URI scheme: fulcrum://{workspace_id}
  //             fulcrum://{workspace_id}/tasks
  //             fulcrum://{workspace_id}/task/{task_id}
  //             fulcrum://{workspace_id}/memory/{project_id}
  //             fulcrum://{workspace_id}/run/{run_id}

  const makeText = (data: unknown): { contents: Array<{ uri: string; text: string; mimeType: string }> } => ({
    contents: [{ uri: '', text: JSON.stringify(data, null, 2), mimeType: 'application/json' }],
  })

  // fulcrum://{workspace_id} — workspace status
  server.registerResource(
    'workspace',
    new ResourceTemplate('fulcrum://{workspace_id}', {
      list: async () => {
        const workspaces = await listWorkspaces(getDb())
        return {
          resources: workspaces.map(ws => ({
            uri: `fulcrum://${ws.workspace_id}`,
            name: ws.name ?? ws.workspace_id,
            mimeType: 'application/json',
          })),
        }
      },
    }),
    {
      title: 'Workspace status',
      description: 'Current status and health of a Fulcrum workspace',
      mimeType: 'application/json',
    },
    async (uri, { workspace_id }) => {
      const data = await options.handleToolCall('get_workspace_status', { workspace_id })
      const result = makeText(data)
      result.contents[0].uri = uri.toString()
      return result
    },
  )

  // fulcrum://{workspace_id}/tasks — task list
  server.registerResource(
    'workspace-tasks',
    new ResourceTemplate('fulcrum://{workspace_id}/tasks', {
      list: async () => {
        const workspaces = await listWorkspaces(getDb())
        return {
          resources: workspaces.map(ws => ({
            uri: `fulcrum://${ws.workspace_id}/tasks`,
            name: `Tasks — ${ws.name ?? ws.workspace_id}`,
            mimeType: 'application/json',
          })),
        }
      },
    }),
    {
      title: 'Workspace tasks',
      description: 'All tasks in a workspace',
      mimeType: 'application/json',
    },
    async (uri, { workspace_id }) => {
      const data = await options.handleToolCall('list_tasks', { workspace_id })
      const result = makeText(data)
      result.contents[0].uri = uri.toString()
      return result
    },
  )

  // fulcrum://{workspace_id}/task/{task_id} — individual task
  server.registerResource(
    'task',
    new ResourceTemplate('fulcrum://{workspace_id}/task/{task_id}', {}),
    {
      title: 'Task detail',
      description: 'Details of a single Fulcrum task',
      mimeType: 'application/json',
    },
    async (uri, { workspace_id, task_id }) => {
      // CLI-005: point lookup — use get_task instead of fetching 1000 tasks
      const data = await options.handleToolCall('get_task', { workspace_id, task_id })
      const task = (data && typeof data === 'object') ? data : { error: 'not_found', task_id }
      const result = makeText(task)
      result.contents[0].uri = uri.toString()
      return result
    },
  )

  // fulcrum://{workspace_id}/memory/{project_id} — memory entries
  server.registerResource(
    'memory',
    new ResourceTemplate('fulcrum://{workspace_id}/memory/{project_id}', {}),
    {
      title: 'Project memory',
      description: 'Recalled memory entries for a project',
      mimeType: 'application/json',
    },
    async (uri, { workspace_id, project_id }) => {
      const db = getDb()
      const rows = db.prepare(`
        SELECT memory_id, content, kind, title, importance, created_at, updated_at
        FROM memories
        WHERE workspace_id = ? AND project_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(workspace_id, project_id)
      return {
        contents: [{
          uri: uri.toString(),
          mimeType: 'application/json',
          text: JSON.stringify(rows, null, 2),
        }],
      }
    },
  )

  // fulcrum://{workspace_id}/run/{run_id} — agent run status
  server.registerResource(
    'agent-run',
    new ResourceTemplate('fulcrum://{workspace_id}/run/{run_id}', {}),
    {
      title: 'Agent run',
      description: 'Status of a Fulcrum agent run',
      mimeType: 'application/json',
    },
    async (uri, { run_id }) => {
      const data = await options.handleToolCall('get_agent_run_status', { run_id })
      const result = makeText(data)
      result.contents[0].uri = uri.toString()
      return result
    },
  )

  // ---------- Prompts ----------
  // Register fulcrum's two most useful context-builders as MCP prompts so
  // clients (Claude Desktop, etc.) can embed them in their system prompt pane.

  server.registerPrompt(
    'build_cos_context',
    {
      title: 'Build Chief-of-Staff context',
      description: 'Generate a structured CoS context summary for a workspace/project',
      argsSchema: {
        workspace_id: z.string().describe('Workspace ID'),
        project_id: z.string().describe('Project ID'),
      },
    },
    async ({ workspace_id, project_id }) => {
      const result = await options.handleToolCall('build_cos_context', { workspace_id, project_id })
      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: typeof result === 'string' ? result : JSON.stringify(result) },
        }],
      }
    },
  )

  server.registerPrompt(
    'recall_memory',
    {
      title: 'Recall relevant memories',
      description: 'Search and return memory entries relevant to a query',
      argsSchema: {
        query: z.string().describe('Natural-language memory search query'),
        workspace_id: z.string().describe('Workspace ID'),
        project_id: z.string().describe('Project ID'),
      },
    },
    async ({ query, workspace_id, project_id }) => {
      const result = await options.handleToolCall('recall_memory', { query, workspace_id, project_id })
      return {
        messages: [{
          role: 'user' as const,
          content: { type: 'text' as const, text: JSON.stringify(result) },
        }],
      }
    },
  )

  // ---------- Logging capability ----------
  // Handle logging/setLevel so clients can control server log verbosity.
  server.server.setRequestHandler(SetLevelRequestSchema, (request) => {
    const level = request.params.level
    process.stderr.write(`[fulcrum mcp] logging level set to: ${level}\n`)
    return {}
  })

  return server
}

// ---------- Run ----------

export async function runFulcrumMcpServer(options: McpServerOptions): Promise<void> {
  const server = createFulcrumMcpServer(options)
  const transport = new StdioServerTransport()

  // Graceful shutdown on signals
  const shutdown = async () => {
    process.stderr.write('[fulcrum mcp] shutting down\n')
    try { await server.close() } catch { /* ignore */ }
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  process.stderr.write('[fulcrum mcp] fulcrum MCP server started (stdio, protocol 2025-11-25)\n')

  // v2b PR 15: normalize_version sweep on server start (background, non-blocking)
  import('fulcrum-memory').then(m => {
    if (typeof (m as Record<string, unknown>).startNormalizeVersionSweep === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(m as any).startNormalizeVersionSweep()
    }
  }).catch(() => { /* non-fatal */ })

  await server.connect(transport)

  // Keep alive until stdin closes (parent process died)
  await new Promise<void>((resolve) => {
    process.stdin.on('close', () => resolve())
    process.stdin.on('end', () => resolve())
  })
}

// ---------- StreamableHTTP transport ----------

export interface McpHttpServerOptions extends McpServerOptions {
  port?: number
  host?: string
}

/**
 * Serve the Fulcrum MCP server over HTTP using the StreamableHTTP transport.
 * Session state is preserved across requests via a session map keyed by
 * the MCP session ID returned in the mcp-session-id response header.
 * Listens on /mcp for POST (tool calls) and GET (SSE notifications).
 */
export async function runFulcrumMcpHttpServer(options: McpHttpServerOptions): Promise<void> {
  const port = options.port ?? 4722
  const host = options.host ?? '127.0.0.1'

  // Session map: session ID → { server, transport } pair kept alive across requests.
  const sessions = new Map<string, {
    server: McpServer
    transport: StreamableHTTPServerTransport
    lastUsed: number
  }>()

  // Evict sessions inactive for >30 minutes every 5 minutes.
  setInterval(() => {
    const cutoff = Date.now() - 30 * 60 * 1000
    for (const [id, session] of sessions) {
      if (session.lastUsed < cutoff) {
        session.server.close().catch(() => {})
        sessions.delete(id)
      }
    }
  }, 5 * 60 * 1000).unref()

  // SECURITY NOTE: This server binds to 127.0.0.1 only (no network exposure by default).
  // For any deployment accessible over a network, add bearer token middleware
  // and implement /.well-known/oauth-protected-resource per RFC 9728.
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${host}`)

    // Spec §Transports.Security: validate Origin to prevent DNS rebinding attacks.
    // Reject any cross-origin request. Allow null (no-origin) and localhost origins.
    const origin = req.headers['origin']
    if (origin && origin !== 'null') {
      let originHost: string
      try { originHost = new URL(origin).hostname } catch { originHost = '' }
      const isLocalhost = originHost === 'localhost' || originHost === '127.0.0.1' || originHost === '::1'
      if (!isLocalhost) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Forbidden: invalid Origin header' }))
        return
      }
    }

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found. Use POST /mcp for MCP requests.' }))
      return
    }

    // Spec §Transports.Protocol Version Header: validate MCP-Protocol-Version
    // on non-initialize requests. Absent header is treated as 2025-03-26 (previous version).
    const protocolVersion = req.headers['mcp-protocol-version']
    const SUPPORTED_VERSIONS = new Set(['2025-11-25', '2025-03-26'])
    if (protocolVersion && !SUPPORTED_VERSIONS.has(protocolVersion as string)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Unsupported MCP-Protocol-Version: ${protocolVersion}` }))
      return
    }

    // Spec §Transports.Session Management: handle DELETE for client-initiated session termination
    if (req.method === 'DELETE') {
      const deleteSessionId = req.headers['mcp-session-id'] as string | undefined
      if (deleteSessionId && sessions.has(deleteSessionId)) {
        const entry = sessions.get(deleteSessionId)!
        sessions.delete(deleteSessionId)
        entry.server.close().catch(() => {})
        res.writeHead(200)
      } else if (deleteSessionId) {
        res.writeHead(404)
      } else {
        res.writeHead(400)
      }
      res.end()
      return
    }

    // For existing sessions, reuse the stored server+transport pair.
    const incomingSessionId = req.headers['mcp-session-id'] as string | undefined
    let sessionEntry = incomingSessionId ? sessions.get(incomingSessionId) : undefined

    if (!sessionEntry) {
      // New session: create server and transport, connect them once.
      // CLI-006: pre-index the session synchronously inside sessionIdGenerator so
      // there is no TOCTOU window between the response carrying the session ID
      // and the server storing it in the map.
      const mcpServer = createFulcrumMcpServer(options)
      const pendingEntry: { server: typeof mcpServer; transport: StreamableHTTPServerTransport; lastUsed: number } = {
        server: mcpServer,
        transport: null as unknown as StreamableHTTPServerTransport,
        lastUsed: Date.now(),
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => {
          const id = randomUUID()
          // Index synchronously before response headers are written — closes the TOCTOU window.
          sessions.set(id, pendingEntry)
          return id
        },
      })
      pendingEntry.transport = transport

      // Clean up the session entry when transport closes.
      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid) sessions.delete(sid)
        mcpServer.close().catch(() => {})
      }

      await mcpServer.connect(transport)
      sessionEntry = pendingEntry
    } else {
      sessionEntry.lastUsed = Date.now()
    }

    try {
      await sessionEntry.transport.handleRequest(req, res)
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: (err as Error).message }))
      }
    }
  })

  const shutdown = async () => {
    process.stderr.write('[fulcrum mcp-http] shutting down\n')
    await new Promise<void>((resolve, reject) => httpServer.close(err => err ? reject(err) : resolve()))
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, host, () => resolve())
    httpServer.once('error', reject)
  })

  process.stderr.write(`[fulcrum mcp-http] MCP StreamableHTTP server started on http://${host}:${port}/mcp\n`)

  // Keep alive
  await new Promise<void>(() => {})
}
