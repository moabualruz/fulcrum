# Phase 04: Inference + Router/Skills - Pattern Map

**Mapped:** 2026-05-05
**Files analyzed:** 25
**Analogs found:** 22 / 25

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/inference/service.ts` | service | request-response | `src/inference/lifecycle.ts` | role-match |
| `src/inference/backend-probes.ts` | service | request-response | `src/inference/backends/types.ts` | exact |
| `src/inference/model-metadata.ts` | utility | transform | `src/inference/protocol.ts` | role-match |
| `src/inference/protocol.ts` | utility | transform | `src/inference/protocol.ts` | exact-modify |
| `src/inference/backends/*.ts` | service | request-response | `src/inference/backends/ollama.ts`, `src/inference/backends/openai-compatible.ts` | exact |
| `src/cli/inference.ts` | controller | request-response | `src/cli/inference.ts` | exact-modify |
| `src/server/trpc/routers/inference.ts` | route | request-response | `src/server/trpc/routers/inference.ts` | exact-modify |
| `src/doctor/checks/inference.ts` | service | request-response | `src/inference/lifecycle.ts` | role-match |
| `scripts/static-build-proof.ts` | utility | batch | `scripts/build-all.ts` | role-match |
| `src/router/service.ts` | service | request-response | `src/router/auto-assign.ts` | role-match |
| `src/router/decision-schema.ts` | utility | transform | `src/router/types.ts`, `src/server/trpc/routers/routing.ts` | role-match |
| `src/router/learned-drafts.ts` | service | CRUD | `src/router/no-match-prompt.ts`, `src/router/auto-assign.ts` | role-match |
| `src/router/conflict-detector.ts` | service | transform | `src/router/rules-engine.ts` | role-match |
| `src/router/graph.ts` | service | event-driven | none | no analog |
| `src/server/trpc/routers/routing.ts` | route | request-response | `src/server/trpc/routers/routing.ts` | exact-modify |
| `src/cli/commands/routing.ts` | controller | request-response | `src/cli/commands/routing.ts` | exact-modify |
| `src/tui/screens/routing-rules.ts` | component | event-driven | `src/tui/screens/routing-rules.ts` | exact-modify |
| `src/web/src/routes/settings/routing/*` | component/route | request-response | `src/web/src/routes/settings/routing/RoutingPage.svelte`, `routing.server.ts` | exact-modify |
| `src/skills/registry-service.ts` | service | CRUD | `src/skills/loader.ts` | role-match |
| `src/skills/mcp-virtual-skills.ts` | service | transform | `src/cli/mcp-builtins.ts`, `src/components/catalog.ts` | role-match |
| `src/skills/lock.ts` | utility | file-I/O | `src/skills/lock.ts` | exact-modify |
| `src/skills/upstream-sync.ts` | service | file-I/O | `src/skills/upstream-sync.ts` | exact-modify |
| `src/server/trpc/routers/skills.ts` | route | request-response | `src/server/trpc/routers/skills.ts` | exact-modify |
| `src/db/entities/router/*Draft*.ts`, `src/db/entities/skills/*Conflict*.ts`, migrations | model/migration | CRUD | `RoutingRule.ts`, `FulcrumSkill.ts`, existing migrations | role-match |
| `evals/router-llm-eval.promptfooconfig.yaml` | test | batch | none | no analog |

## Pattern Assignments

### `src/inference/service.ts` / backend health service

**Analog:** `src/inference/lifecycle.ts`

**Imports pattern** (lines 1-12):
```typescript
import { injectable as Injectable } from "@needle-di/core";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import net from "node:net";
```

**Lifecycle/status pattern** (lines 163-228):
```typescript
async ensureRunning(): Promise<InferenceRunning> {
  await mkdir(this.homeDir, { recursive: true });
  const existingPid = await readPid(this.pidFilePath);
  if (existingPid && isProcessAlive(existingPid) && await probeHealth(this.socketPath, this.healthTimeoutMs)) {
    return this.remember({ pid: existingPid, socketPath: this.socketPath });
  }
  await rm(this.pidFilePath, { force: true });
  await rm(this.socketPath, { force: true });
}

async status(): Promise<InferenceStatus> {
  const pid = await readPid(this.pidFilePath);
  if (pid && isProcessAlive(pid) && await probeHealth(this.socketPath, this.healthTimeoutMs)) {
    return { status: "ok", pid, socketPath: this.socketPath };
  }
  return { status: "down", pid, socketPath: this.socketPath };
}
```

**Apply:** preserve embedded start/stop ownership here. Add typed per-backend records; external backends get `probe`, never `start`.

### `src/inference/backend-probes.ts` / backend adapters

**Analog:** `src/inference/backends/types.ts`

**Interface pattern** (lines 57-96):
```typescript
export interface HealthResult {
  readonly backend: BackendId;
  readonly status: "ok" | "degraded" | "down";
  readonly version?: string;
  readonly models?: readonly string[];
  readonly error?: string;
}

export interface InferenceBackend {
  readonly id: BackendId;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  classify(req: ClassifyRequest): Promise<ClassifyResponse>;
  tokenize(req: TokenizeRequest): Promise<TokenizeResponse>;
  health(): Promise<HealthResult>;
}
```

**HTTP backend pattern** from `src/inference/backends/ollama.ts` (lines 27-55, 90-115):
```typescript
async embed(req: EmbedRequest): Promise<EmbedResponse> {
  const res = await this.post("/api/embed", {
    model: req.model,
    input: Array.isArray(req.input) ? req.input : [req.input],
  });
  return { vectors: res.embeddings, model: res.model ?? req.model, cached: false };
}

async health(): Promise<HealthResult> {
  try {
    const res = await fetch(`${this.base}/api/tags`);
    const data = (await res.json()) as Record<string, unknown>;
    const models = ((data["models"] ?? []) as Array<{ name: string }>).map((m) => m.name);
    return { backend: "ollama", status: "ok", models };
  } catch (err) {
    return { backend: "ollama", status: "down", error: err instanceof Error ? err.message : String(err) };
  }
}
```

**Apply:** probe contract should call `health`, `embed`, and `generate`; report `running|stopped|degraded|unavailable|unconfigured` with dimensions and reasons.

### `src/inference/protocol.ts` / `src/inference/model-metadata.ts`

**Analog:** `src/inference/protocol.ts`

**Zod schema pattern** (lines 25-47, 91-102):
```typescript
export const HealthResultSchema = z.object({
  status: z.string(),
  backends: z.array(z.string()),
  models: z.array(z.string()),
  cache: z.object({
    db_path: z.string(),
    embed_rows: z.number().int().nonnegative(),
    gen_rows: z.number().int().nonnegative(),
  }).optional(),
});

export const BackendSchema = z.object({
  id: z.enum(["embedded", "ollama", "lm-studio", "openai-compatible"]),
  available: z.boolean(),
  active: z.boolean(),
  reason: z.string().nullable(),
});
```

**Error pattern** (lines 149-159, 190-200):
```typescript
export class InferenceError extends Error {
  readonly code: number;
  readonly backend: string;

  constructor(payload: InferenceErrorPayload, options?: { cause?: unknown }) {
    super(payload.message, options);
    this.name = "InferenceError";
    this.code = payload.code;
    this.backend = payload.backend;
  }
}
```

**Apply:** model metadata belongs in Zod schemas/types. Dimension mismatch should throw typed `InferenceError`, not coerce vectors.

### `src/cli/inference.ts`

**Analog:** `src/cli/inference.ts`

**Command dispatch pattern** (lines 24-41, 125-171):
```typescript
const HELP = `fulcrum inference
Usage:
  fulcrum inference start [--json]
  fulcrum inference status [--json]
  fulcrum inference config list [--json]
`;

export async function run(argv: readonly string[], opts: InferenceRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [verb = "help", ...rest] = argv;
  try {
    switch (verb) {
      case "start": await runStart(rest, { ...opts, print }); return;
      case "status": await runStatus(rest, { ...opts, print }); return;
      default:
        printErr(`fulcrum inference: unknown verb '${verb}'`);
        exit(2);
    }
  } catch (error) {
    printErr(`fulcrum inference ${verb}: ${(error as Error).message}`);
    exit(1);
  }
}
```

**JSON/human output pattern** (lines 191-205):
```typescript
const json = hasFlag(argv, "json");
const health = opts.caller
  ? await opts.caller.inference.health()
  : await resolveServices(opts).client.call("health", {});

if (json) opts.print(JSON.stringify(health));
else opts.print(`inference ${health.status} backends=${health.backends.join(",")}`);
```

**Apply:** new status output must keep `--json` exact machine shape; human output concise. `start` only starts embedded sidecar.

### `src/server/trpc/routers/inference.ts`

**Analog:** `src/server/trpc/routers/inference.ts`

**Imports and validation pattern** (lines 1-29, 35-58):
```typescript
import { observable } from "@trpc/server/observable";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { InferenceClient } from "../../../inference/client.ts";
import { HealthResultSchema, EmbedResultSchema, GenerateResultSchema } from "../../../inference/protocol.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t, publicProcedure } from "../../../trpc/trpc.ts";

const EmbedInputSchema = z.object({
  texts: z.array(z.string().min(1).max(MAX_TEXT_CHARS)).min(1).max(MAX_TEXT_ITEMS),
  model: z.string().max(MAX_MODEL_ID_CHARS).optional(),
});
```

**Feature guard pattern** (lines 135-162):
```typescript
async function assertEmbeddingsEnabled(ctx: TRPCContext): Promise<void> {
  if (!ctx.orgId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Session is missing orgId. Re-authenticate." });
  if (!(await isEnabled(ctx, "embeddings"))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Inference classify/tokenize require the embeddings feature flag.",
    });
  }
}
```

**Apply:** expose backend status/probe/model metadata through schemas; all mutations use permissioned procedures except public health if intentionally unauthenticated.

### `src/router/service.ts`, `decision-schema.ts`, `learned-drafts.ts`

**Analog:** `src/router/auto-assign.ts`

**Tiered routing pattern** (lines 53-94):
```typescript
export async function autoAssign(input: AutoAssignInput): Promise<RoutingDecision | null> {
  const agentOverride = input.agentOverride?.trim();
  if (agentOverride) {
    return recordIfNeeded(input, { ruleId: null, source: "explicit", agent: agentOverride, confidence: 1.0 });
  }

  const match = await evaluateRuleMatch(input.taskFacts, input.orgId, input.projectId);
  if (!match) {
    if (input.dryRun) return null;
    if (isRouterLlmEnabled()) {
      const llmResult = await llmFallback(input.taskFacts, input.orgId);
      if (llmResult) return recordIfNeeded(input, llmResult);
    }
    const agent = (await promptForAgent(input.taskFacts)).trim();
    if (!agent) return null;
    const rule = await learnRule(input.taskFacts, agent, input.orgId, input.projectId);
    return recordIfNeeded(input, { ruleId: rule.id, source: "learned", agent: rule.actionAgent, confidence: 1.0 });
  }

  return recordIfNeeded(input, { ruleId: match.ruleId, source: "rule", agent: match.agent, confidence: 1.0 });
}
```

**Telemetry pattern** (lines 34-51, 103-110):
```typescript
async function defaultRecordDecision({ input, decision }: { input: AutoAssignInput; decision: RoutingDecision }): Promise<void> {
  if (!input.taskId) return;
  await recordRoutingEvent(decision, input.taskId, input.orgId, Boolean(input.dryRun));
}

async function recordIfNeeded(input: AutoAssignInput, decision: RoutingDecision): Promise<RoutingDecision> {
  if (!input.dryRun && recordDecision) await recordDecision({ input, decision });
  return decision;
}
```

**Apply:** replace immediate learned activation with disabled draft persistence. Keep deterministic first; LLM only recommends/abstains/creates disabled draft with evidence.

### `src/router/conflict-detector.ts`

**Analog:** `src/router/rules-engine.ts` via tRPC condition validation.

**Condition validation pattern** from `src/server/trpc/routers/routing.ts` (lines 135-152):
```typescript
async function validateConditions(conditionsJson: Record<string, unknown>): Promise<void> {
  try {
    const engine = new Engine([], { allowUndefinedFacts: true });
    engine.addRule({ conditions: conditionsJson as TopLevelCondition, event: { type: "route" } });
    await engine.run({});
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid routing rule conditions_json: ${String((error as { message?: unknown }).message ?? error)}`,
      cause: error,
    });
  }
}
```

**Apply:** use `json-rules-engine` semantics to test overlap/conflict; do not write custom condition matching.

### `src/router/graph.ts`

**Analog:** No direct codebase analog.

**Use RESEARCH/AI-SPEC pattern:** LangGraph is optional internal router-service detail. If added, keep all persistence in MikroORM and audit rows. Do not expose graph concepts to CLI/Web/TUI.

## Shared Surface Patterns

### tRPC Route CRUD

**Source:** `src/server/trpc/routers/routing.ts`

**CRUD pattern** (lines 189-238, 240-273):
```typescript
export const routingRouter = t.router({
  list: permissionedProcedure({ resource: "routing", action: "list" })
    .input(ListInputSchema)
    .output(z.array(RoutingRuleOutputSchema))
    .query(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const rows = await em.find(RoutingRule, where, { populate: ["org"], orderBy: { priority: "ASC", createdAt: "ASC" } });
      return rows.map(serializeRule);
    }),

  create: permissionedProcedure({ resource: "routing", action: "create" })
    .input(CreateInputSchema)
    .output(RoutingRuleOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      await validateConditions(input.conditionsJson);
      const rule = em.create(RoutingRule, { ... } as never);
      await routingRuleRepository(em).save(rule);
      return serializeRule(rule);
    }),
});
```

**Apply to:** routing drafts, skills lock states, MCP virtual skills, inference config writes.

### CLI Thin Caller Pattern

**Source:** `src/cli/commands/routing.ts`

**Argument/JSON pattern** (lines 52-66, 269-314, 316-350):
```typescript
const HELP = `fulcrum routing
Usage:
  fulcrum routing rules list [--project <id>] [--json]
  fulcrum routing rules add --name <n> --agent <a> --conditions <json|@file.json> [--json]
`;

function printOutput(value: unknown, argv: readonly string[], print: (line: string) => void, human: (value: unknown) => string): void {
  print(argv.includes("--json") ? JSON.stringify(value) : human(value));
}

async function resolveCaller(opts: RoutingRunOptions): Promise<RoutingCaller> {
  const factory = t.createCallerFactory(appRouter);
  return factory(ctx) as unknown as RoutingCaller;
}
```

**Apply to:** new draft commands and lock override commands. Keep business logic in tRPC/service, not CLI.

### Web tRPC Form Route Pattern

**Source:** `src/web/src/routes/settings/routing/routing.server.ts`

**Load/action pattern** (lines 50-84, 103-128, 130-240):
```typescript
async function trpcGet(fetchFn: typeof fetch, origin: string, procedure: string, input: unknown, cookie: string) {
  const encodedInput = encodeURIComponent(JSON.stringify(input ?? {}));
  const response = await fetchFn(`${origin}/api/trpc/${procedure}?input=${encodedInput}`, {
    method: "GET",
    credentials: "include",
    headers: { "content-type": "application/json", cookie },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractTrpcError(body));
  return unwrapTrpcData(body);
}

export async function loadRoutingPage(event: RoutingLoadEvent, projectId: string | null) {
  requireSession(event);
  const rules = await trpcGet(event.fetch, origin, "routing.list", {}, cookie);
  return { projectId: null, rules: Array.isArray(rules) ? rules.filter((rule) => rule.projectId === null) : [], inheritedRules: [] };
}
```

**Apply to:** routing tabs/drafts/test/LLM gate, skills lock/MCP views, inference settings. Keep shared `routing.server.ts` for settings and project scoped pages.

### Web Table-First Component Pattern

**Source:** `src/web/src/routes/settings/routing/RoutingPage.svelte`

**Table/action pattern** (lines 86-150, 170-198):
```svelte
<section aria-label="Routing rules" class="overflow-x-auto rounded-md border border-border">
  <table data-routing-rules-table class="w-full min-w-[900px] text-sm">
    <thead class="border-b border-border bg-muted/50">...</thead>
    <tbody>
      {#each rules as rule, index (rule.id)}
        <tr data-routing-rule={rule.id} draggable="true" class="border-b border-border last:border-0">
          <td class="px-4 py-3">{rule.priority}</td>
          <td class="px-4 py-3 font-medium">{rule.name}</td>
          <td class="px-4 py-3">{rule.actionAgent}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</section>

<section aria-label="Test routing" class="rounded-md border border-border p-4">
  <form method="POST" action="?/dryRun" class="mt-3 grid gap-3">
    <textarea name="taskJson" class="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs" />
    <button type="submit" class="w-fit rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Test routing</button>
  </form>
</section>
```

**Apply to:** UI-SPEC table-first routing and skills screens. Upgrade controls to shadcn/lucide where available; avoid nested cards.

### TUI Screen Pattern

**Source:** `src/tui/screens/routing-rules.ts`

**State/render/key pattern** (lines 47-91, 94-166):
```typescript
export class RoutingRulesScreen {
  private rules: TuiRoutingRule[] = [];
  private cursor = 0;
  private overlay: RoutingOverlay = "none";

  async load(): Promise<void> {
    const input = this.opts.projectId ? { projectId: this.opts.projectId } : {};
    this.rules = await this.opts.caller.routing.list(input);
    this.clampCursor();
  }

  render(renderer: Renderer): void {
    renderer.writeln(c.bold("  Routing Rules"));
    renderer.writeln(`  ${pad("Name", 28)} ${pad("Agent", 16)} ${pad("Scope", 16)} ${pad("Priority", 8)} ${pad("Source", 10)} Enabled`);
    for (const row of this.visibleRules) renderer.writeln([...].join(" "));
    renderer.writeln(c.dim("  j/k navigate  n new  e edit  d delete  t test  q back"));
  }

  async submitDryRun(taskJson: Record<string, unknown>): Promise<void> {
    this.decision = await this.opts.caller.routing.dryRun({ taskJson });
    this.overlay = "test";
  }
}
```

**Apply to:** routing Drafts/Test/Backends panes. Use text labels for states; never rely on color alone.

## Shared Persistence Patterns

### MikroORM Entity Pattern

**Source:** `src/db/entities/router/RoutingRule.ts`

**Entity pattern** (lines 36-88):
```typescript
@Entity({ tableName: "routing_rules", repository: () => RoutingRuleRepository })
@Index({ name: "routing_rules_org_priority", properties: ["org", "priority", "enabled"] })
export class RoutingRule {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "json", fieldName: "conditions_json" })
  conditionsJson: RoutingConditions = {};

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
```

**Apply to:** learned draft/conflict/audit entities. Keep org-scoped, repository-backed, decorator-class style.

### Migration Pattern

**Source:** `src/db/migrations/Migration20260502050000_routing_rules.ts`

**DDL pattern** (lines 13-39):
```typescript
import { Migration } from "@mikro-orm/migrations";

export class Migration20260502050000_routing_rules extends Migration {
  static isLossy = true;

  override async up(): Promise<void> {
    this.addSql(`create table "routing_rules" (...)`);
    this.addSql(`alter table "routing_rules" add constraint "routing_rules_org_id_foreign" foreign key ("org_id") references "orgs" ("id") on delete cascade`);
    this.addSql(`create index "routing_rules_org_priority" on "routing_rules" ("org_id", "priority", "enabled")`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "routing_rules" cascade`);
  }
}
```

**Apply to:** routing drafts/evidence/conflicts, skill conflict artifacts, embedding dimension schema. `addSql` only in migrations; no new raw SQL app paths.

## Skills, Lock, MCP Patterns

### Skill Loader / Lock Enforcement

**Source:** `src/skills/loader.ts`, `src/skills/lock.ts`

**Hash and fail pattern** from `loader.ts` (lines 139-152, 349-397):
```typescript
async function assertInstalledHashes(slug: string, agents: AgentName[], expectedHash: string): Promise<void> {
  for (const agent of agents) {
    const path = await installedSkillPath(agent, slug);
    const content = await readIfExists(path);
    if (content === null) continue;
    if (sha256(content) !== expectedHash) {
      throw new Error(`Skill ${slug} hash mismatch at ${path}`);
    }
  }
}

const hash = sha256(content);
await copySkillToAgents(path, parsed.slug, parsed.agents, hash);
await assertInstalledHashes(parsed.slug, parsed.agents, hash);
lock[parsed.slug] = { version: parsed.version, hash, installedAt: new Date().toISOString(), enabled_agents: parsed.agents };
await writeSkillsLockFile(lock);
```

**Lock schema pattern** from `lock.ts` (lines 13-24, 38-60):
```typescript
export const SkillsLockEntry = z.object({
  version: z.string().min(1),
  hash: z.string().min(1),
  installedAt: z.string().datetime({ offset: true }),
  upstream_conflict: z.string().optional(),
  enabled_agents: z.array(z.string().min(1)),
});

export async function readSkillsLockFile(options: SkillsLockPathOptions = {}): Promise<SkillsLockFile> {
  const path = skillsLockPath(options);
  ...
  return SkillsLockFile.parse(JSON.parse(raw));
}
```

**Apply:** extend mismatch errors with exact expected/actual SHA and status. Fail closed per skill.

### Upstream Sync Conflict Pattern

**Source:** `src/skills/upstream-sync.ts`

**Safe merge/conflict pattern** (lines 294-355):
```typescript
const agents = enabledAgentsFor(skill, lockEntry.enabled_agents);
const upstreamContent = await readFile(upstreamPath, "utf8");
const upstreamHash = sha256(upstreamContent);
const clean = await installedSkillIsClean(slug, agents, lockEntry.hash);

if (!clean) {
  const localContent = await readInstalledSkillContent(slug, agents) ?? "";
  lock[slug] = {
    ...lockEntry,
    upstream_conflict: await unifiedDiff(slug, localContent, upstreamContent),
  };
  result.conflicts.push(slug);
  continue;
}

await writeInstalledSkill(slug, agents, upstreamContent);
lock[slug] = { version: parsed.version, hash: upstreamHash, installedAt: new Date().toISOString(), enabled_agents: agents };
result.merged.push(slug);
```

**Apply:** replace `upstream_conflict` diff-in-lock with structured artifact/entity: base/local/upstream hashes, suggested resolution, audit fields. Do not write inline conflict markers.

### MCP Virtual Skill Descriptor Pattern

**Source:** `src/cli/mcp-builtins.ts`, `src/components/catalog.ts`

**Descriptor pattern** from `mcp-builtins.ts` (lines 25-56, 71-104):
```typescript
export const DEFAULT_GITHUB_SERVER: McpServerSpec = {
  transport: "http",
  url: "https://api.githubcopilot.com/mcp/",
  description: "Official GitHub MCP server — repos, issues, PRs, Actions, code search",
  vendor: "github",
  default_enabled: false,
  auth_env_vars: ["GITHUB_TOKEN"],
  agent_visibility: { ...ALL_VISIBLE },
};

export const DEFAULT_PLAYWRIGHT_SERVER: McpServerSpec = {
  transport: "stdio",
  command: "npx -y @playwright/mcp@latest",
  description: "Playwright MCP server — browser automation via accessibility snapshots",
  vendor: "microsoft",
  default_enabled: false,
  auth_env_vars: [],
  agent_visibility: { ...ALL_VISIBLE },
};
```

**Component catalog pattern** from `components/catalog.ts` (lines 60-82, 193-208):
```typescript
function mcpComponent(name: string): ComponentSpec {
  const id = `mcp.${name}`;
  return {
    id,
    kind: "mcp",
    description: `${name} MCP registry entry`,
    surfaces: [{ id: `${id}:registry`, kind: "mcp-registry-entry", target: `mcp:${name}`, ownerKey: `fulcrum:mcp:${name}` }],
  };
}

export const MCP_COMPONENTS: readonly ComponentSpec[] = BUILTIN_MCPS.map(({ name }) => mcpComponent(name));
```

**Apply:** map MCP descriptors to skill registry rows with `source: "mcp"` and descriptor/tool manifest hashes. No direct invocation from Fulcrum surfaces.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/router/graph.ts` | service | event-driven | No LangGraph/StateGraph code exists. Use AI-SPEC pattern and keep graph internal/optional. |
| `evals/router-llm-eval.promptfooconfig.yaml` | test | batch | No promptfoo config exists. Use RESEARCH dataset/eval contract. |
| `scripts/static-build-proof.ts` | utility | batch | `scripts/build-all.ts` is only partial analog; no cross-platform static proof script exists. |

## Metadata

**Analog search scope:** `src/inference`, `src/router`, `src/skills`, `src/server/trpc/routers`, `src/cli`, `src/tui`, `src/web/src/routes`, `src/db/entities`, `src/db/migrations`, `scripts`, `evals`, `inference`.
**Files scanned:** 240+ via `rg --files`, focused reads for 21 analog files.
**Pattern extraction date:** 2026-05-05
