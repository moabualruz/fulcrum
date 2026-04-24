with **cockpit as a first-class product surface**, I would now lean **TypeScript-first**, not Go-first.

My updated recommendation:

```text
Build Fulcrum v0 as a TypeScript monorepo.

Use:
  TypeScript backend + MCP server + CLI wrappers + local web cockpit

Avoid:
  splitting Go core + TypeScript UI until you have a real bottleneck
```

Go is still a great choice for a durable CLI daemon, but the moment you say **“I want cockpit”**, the product becomes UI-heavy, state-heavy, and integration-heavy. A single TypeScript stack will probably get you to a useful product faster.

## Why TypeScript-first makes sense here

The official MCP SDK list puts **TypeScript and Go both in Tier 1**, so you are not sacrificing MCP support by choosing TypeScript. The TypeScript SDK specifically supports MCP servers and clients and runs on **Node.js, Bun, and Deno**, with server libraries, client libraries, stdio, streamable HTTP, auth helpers, and framework middleware. ([Model Context Protocol][1])

That matters because Fulcrum is mostly:

```text
local web cockpit
MCP server
CLI wrappers
Plane API integration
SQLite state
JSON/JSONL
subprocess orchestration
filesystem artifacts
context-pack builder
```

All of that is comfortable in TypeScript.

The strongest practical advantage is that your cockpit, API types, MCP tools, config schema, event types, and agent-facing JSON can all share one type system.

## Recommended stack

```text
Language:
  TypeScript

Runtime:
  Bun-first or Node-first

Backend:
  Hono or Fastify

Cockpit:
  React + Vite
  TanStack Router
  TanStack Query
  Tailwind/shadcn if you want fast UI

Database:
  SQLite

ORM/query:
  Drizzle or Kysely
  Or raw SQL first if you want maximum control

MCP:
  @modelcontextprotocol/sdk

CLI:
  TypeScript CLI using commander/cac/yargs
  packaged with Bun or Node toolchain

Process execution:
  execa or Bun.spawn

Local packaging:
  Bun single-file executable if it works cleanly
  npm/pnpm package fallback

TUI:
  Defer
  Cockpit replaces most TUI need
```

Bun is especially interesting here because its docs say `bun build --compile` can create standalone executables containing server code, frontend assets, runtime, and npm packages, so a local full-stack cockpit can theoretically ship as one binary. ([Bun][2]) Bun also positions itself as an all-in-one TypeScript/JSX toolkit with runtime, bundler, test runner, package manager, SQLite support, and single-file executables. ([Bun][3])

## TypeScript-first architecture

```text
fulcrum/
  apps/
    cockpit/        React/Vite cockpit
    cli/            fulcrum CLI
    server/         local API + MCP server

  packages/
    core/           task/run/worktree/context domain logic
    db/             SQLite schema + migrations
    plane/          Plane adapter
    memory/         memsearch/Engram adapters
    code-tools/     rg/fd/ast-grep/aider/repomix wrappers
    agents/         claude/codex/gemini/opencode/copilot/aider wrappers
    shared/         types, schemas, events
```

Runtime shape:

```text
fulcrum server
  starts local HTTP API
  serves cockpit UI
  exposes MCP server
  manages SQLite state
  runs agent/tool subprocesses
```

Then:

```bash
fulcrum start
fulcrum doctor
fulcrum run start PLANE-123 --agent claude
fulcrum context build PLANE-123
```

Cockpit opens at:

```text
http://127.0.0.1:<port>
```

## Go vs TypeScript for Fulcrum

| Area                   | Go core                               | TypeScript core                             |
| ---------------------- | ------------------------------------- | ------------------------------------------- |
| Cockpit speed          | Worse, needs separate frontend anyway | Better                                      |
| MCP support            | Excellent, Tier 1                     | Excellent, Tier 1                           |
| UI sharing types       | More friction                         | Best                                        |
| Plane/API integrations | Good                                  | Best                                        |
| Agent wrapper speed    | Good                                  | Good enough                                 |
| SQLite                 | Excellent                             | Good                                        |
| Packaging              | Excellent static-ish binaries         | Good, especially with Bun, but more caveats |
| Subprocess control     | Excellent                             | Good                                        |
| Long-running daemon    | Excellent                             | Good                                        |
| Developer velocity     | Medium                                | High                                        |
| One-language product   | No                                    | Yes                                         |

So the decision comes down to this:

```text
If Fulcrum is primarily a local CLI daemon:
  choose Go.

If Fulcrum is primarily a local cockpit + agent OS:
  choose TypeScript.
```

Given your direction, I would choose **TypeScript**.

## Bun or Node?

My recommendation:

```text
Develop as TypeScript that can run on Node.
Experiment with Bun as the preferred local runtime/package target.
Do not make Bun-only assumptions until packaging is proven.
```

Why: Bun is very attractive for this product because of fast startup, built-in TypeScript/JSX, SQLite support, bundling, and single-file executable support. ([Bun][3]) But Node has the largest compatibility surface. The MCP TypeScript SDK runs on Node, Bun, and Deno, so you can keep the code portable. ([GitHub][4])

Practical default:

```text
Dev:
  pnpm + Node or Bun

Fast local builds:
  Bun

Fallback packaging:
  npm package / pnpm dlx / node binary wrapper

Future packaging:
  Bun single executable if stable for your dependency set
```

## What I would update in the SRS

Replace the language section with this:

````md
## Implementation Language Recommendation

Fulcrum v0 should be implemented as a TypeScript-first monorepo.

### Decision

Use TypeScript for:

- local API server
- MCP server
- CLI
- cockpit UI
- Plane adapter
- memory adapters
- code tool wrappers
- agent wrappers
- context pack builder
- doctor
- SQLite state layer

### Rationale

Fulcrum is now cockpit-first, not only CLI-first. A TypeScript-first stack allows the cockpit, backend, MCP tools, agent-facing schemas, event types, and CLI to share one type system.

The official MCP ecosystem supports TypeScript as a Tier 1 SDK, and the TypeScript SDK runs on Node.js, Bun, and Deno. This makes TypeScript a low-risk choice for an MCP-heavy product.

### Runtime Strategy

Write portable TypeScript.

Preferred runtime:
- Bun, if packaging and subprocess behavior are stable for Fulcrum.

Compatibility target:
- Node.js, so Fulcrum is not locked to Bun.

### Packaging Strategy

Start with:
- npm/pnpm package for development
- `fulcrum` CLI entrypoint

Evaluate:
- Bun single-file executable for local all-in-one distribution

### Architecture

```text
apps/
  cockpit/
  server/
  cli/

packages/
  core/
  db/
  mcp/
  plane/
  memory/
  code-tools/
  agents/
  shared/
````

### When to introduce Go

Only introduce Go later if TypeScript fails on:

* reliable process supervision
* packaging
* memory use
* filesystem safety
* long-running daemon reliability
* single-binary distribution

Until then, avoid split-language complexity.

````

## My final answer

For your actual product direction, I would **not stick to Go for core right now**.

I would do:

```text
TypeScript-first Fulcrum
  + local web cockpit
  + MCP server
  + CLI
  + SQLite
  + Plane adapter
  + memsearch/Engram adapters
  + code-tool wrappers
  + agent wrappers
````

Keep Go as an escape hatch, not the starting point.

The main thing is to enforce clean internal boundaries so you can rewrite a package later if needed:

```text
core domain logic should not depend on React
server should not own UI state
adapters should be replaceable
SQLite schema should be explicit
MCP tools should call core services, not random scripts directly
```

That gives you the speed of TypeScript without trapping Fulcrum in messy frontend-first architecture.


### References

[1]: https://modelcontextprotocol.io/docs/sdk "SDKs - Model Context Protocol"
[2]: https://bun.com/docs/bundler/executables "Single-file executable - Bun"
[3]: https://bun.com/ "Bun — A fast all-in-one JavaScript runtime"
[4]: https://github.com/modelcontextprotocol/typescript-sdk "GitHub - modelcontextprotocol/typescript-sdk: The official TypeScript SDK for Model Context Protocol servers and clients · GitHub"
