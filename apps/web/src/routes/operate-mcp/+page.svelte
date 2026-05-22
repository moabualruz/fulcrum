<script lang="ts">
  /**
   * Operate · MCP servers: OD `operate-mcp.html` fidelity surface.
   *
   * Canonical route: `/<ws>/projects/<projId>/operate/mcp` (IA-MAP.md §2.6 -
   * "MCP servers → operate-mcp.html (per-agent scope)", §2.6 screen table
   * `Operate | :mcp | per-agent MCP scope | scope chip switches CLI agent`).
   * The live `operate-mcp` route folder is the migration alias: `route-map.ts`
   * `LEGACY_ROUTE_MAP` maps `operate-mcp → operate`, so the old `/operate-mcp`
   * path keeps resolving (no 404) while presenting as the Operate stage.
   *
   * The defining interaction is the **per-agent scope selector** (DESIGN.md §11
   * item 9: "MCP servers and plugins are per agent … the Operate → MCP and
   * Operate → Plugins surfaces show a scope chip per agent, never a global
   * list"). Each CLI agent owns its own MCP server registry; the segmented
   * selector switches the table between agents.
   *
   * Status uses the canonical 8-state vocabulary via the ui-kit `StatusBadge`
   * (DESIGN.md §4.9 / COPY.md §6): OD `healthy → passing`, `degraded → failing`,
   * `down → failed`. The drifted `connected/disconnected/connecting/error` enum
   * is retired.
   *
   * Each server row carries the universal compact `ModeRow` (DESIGN.md §4.11 /
   * §4.13: "every step header … subsystem row": an MCP server row is a Step).
   * Probe, show-tools, and the `CredentialInput`-based credential field carry
   * forward from the pre-migration route: no feature loss.
   */
  import { page } from "$app/state";
  import { EmptyState, ErrorBanner, ModeRow } from "@fulcrum/ui-kit";
  import type { WorkflowMode } from "@fulcrum/shared-dto";
  import {
    CredentialInput, Select, StatusBadge, type WorkflowStatus } from "@fulcrum/ui-kit";
  import { cn } from "@fulcrum/ui-kit";

  type Protocol = "http" | "stdio";

  /** OD `operate-mcp.html` health vocabulary: mapped onto the locked StatusBadge set. */
  type McpHealth = "healthy" | "degraded" | "down";

  /** OD Auth column values (`token` / `oauth` / `-`). */
  type McpAuth = "token" | "oauth" | "none";

  interface McpTool {
    name: string;
    description: string;
    inputSchemaPreview: string;
  }

  type ProbeOutcome = "available" | "unavailable";

  interface ProbeResult {
    outcome: ProbeOutcome;
    version: string | null;
    toolCount: number;
    checkedAt: string;
    reason?: string;
    tools: McpTool[];
  }

  interface McpServer {
    id: string;
    name: string;
    protocol: Protocol;
    /** OD health vocabulary; rendered through the canonical StatusBadge. */
    health: McpHealth;
    toolCount: number;
    /** p50 round-trip time, OD `p50 RTT` column. */
    rttP50Ms: number;
    /** p99 round-trip time, OD `p99 RTT` column. */
    rttP99Ms: number;
    auth: McpAuth;
    /** OD `Last probe` column: relative-time string. */
    lastProbe: string;
    url?: string;
    command?: string;
    args?: string[];
    envKeys?: string[];
    error?: string;
    probe?: ProbeResult;
    probeBusy?: boolean;
    showTools?: boolean;
    mode?: WorkflowMode;
  }

  /** A configurable CLI agent: DESIGN.md §11 item 9 multi-CLI agent registry. */
  interface CliAgent {
    id: string;
    label: string;
    /** Two-letter monogram class: OD `.agent-av` (DESIGN.md §4.16). */
    monogram: string;
    avatarClass: string;
  }

  /**
   * The seven CLI agents OD `operate-mcp.html` lists in its scope `seg-group`.
   * Monogram avatar colors follow DESIGN.md §4.16 role map, resolved onto the
   * web token set: Claude → `accent`, general → `success`, Gemini → `accent`
   * (the §4.16 fallback), OpenCode → `warning`, Pi → `secondary`,
   * Codex → `destructive`.
   */
  const CLI_AGENTS: CliAgent[] = [
    { id: "claude-opus", label: "Claude Opus 4.7", monogram: "CL", avatarClass: "bg-accent/20 text-accent" },
    { id: "claude-sonnet", label: "Sonnet 4.6", monogram: "CL", avatarClass: "bg-accent/20 text-accent" },
    { id: "gpt", label: "GPT-5.4", monogram: "GP", avatarClass: "bg-success/20 text-success" },
    { id: "gemini", label: "Gemini 3", monogram: "GE", avatarClass: "bg-accent/20 text-accent" },
    { id: "opencode", label: "OpenCode", monogram: "OC", avatarClass: "bg-warning/20 text-warning-foreground" },
    { id: "pi", label: "pi-cli", monogram: "PI", avatarClass: "bg-secondary text-secondary-foreground" },
    { id: "codex", label: "Codex", monogram: "CX", avatarClass: "bg-destructive/20 text-destructive" },
  ];

  const TOOL_FIXTURE: Record<string, McpTool[]> = {
    mcp_context_mode: [
      { name: "ctx_execute", description: "Run code in a sandbox", inputSchemaPreview: "{ language, code }" },
      { name: "ctx_search", description: "Search indexed context", inputSchemaPreview: "{ queries }" },
    ],
    mcp_open_design: [
      { name: "get_artifact", description: "Fetch a design artifact + siblings", inputSchemaPreview: "{ project? }" },
      { name: "list_files", description: "List design source files", inputSchemaPreview: "{ project? }" },
    ],
    mcp_fulcrum_tools: [
      { name: "run_hook", description: "Invoke a Fulcrum hook subcommand", inputSchemaPreview: "{ name, args }" },
      { name: "doctor", description: "Run a subsystem health probe", inputSchemaPreview: "{ subsystem? }" },
    ],
  };

  function fixtureTools(id: string): McpTool[] {
    return TOOL_FIXTURE[id] ?? [
      { name: "ping", description: "Probe handshake echo", inputSchemaPreview: "{}" },
    ];
  }

  /**
   * MCP registries keyed by CLI agent id: DESIGN.md §11 item 9: each agent owns
   * its own MCP server set. Switching the scope selector swaps the table source.
   */
  const REGISTRY_BY_AGENT: Record<string, McpServer[]> = {
    "claude-opus": [
      {
        id: "mcp_context_mode",
        name: "context-mode",
        protocol: "stdio",
        health: "degraded",
        toolCount: 11,
        rttP50Ms: 120,
        rttP99Ms: 6400,
        auth: "none",
        lastProbe: "3m ago",
        command: "/Applications/Open Design.app/…/context-mode",
        error: "p99 latency 6.4 s exceeds the 2 s budget",
      },
      {
        id: "mcp_open_design",
        name: "open-design",
        protocol: "http",
        health: "healthy",
        toolCount: 9,
        rttP50Ms: 28,
        rttP99Ms: 94,
        auth: "token",
        lastProbe: "12s ago",
        url: "http://127.0.0.1:56330",
      },
      {
        id: "mcp_deepwiki",
        name: "deepwiki",
        protocol: "http",
        health: "healthy",
        toolCount: 14,
        rttP50Ms: 142,
        rttP99Ms: 410,
        auth: "oauth",
        lastProbe: "22s ago",
        url: "https://api.deepwiki.com",
      },
      {
        id: "mcp_gmail",
        name: "gmail",
        protocol: "http",
        health: "healthy",
        toolCount: 12,
        rttP50Ms: 88,
        rttP99Ms: 240,
        auth: "oauth",
        lastProbe: "18s ago",
        url: "claude.ai integration",
      },
      {
        id: "mcp_google_calendar",
        name: "google-calendar",
        protocol: "http",
        health: "healthy",
        toolCount: 8,
        rttP50Ms: 92,
        rttP99Ms: 280,
        auth: "oauth",
        lastProbe: "26s ago",
        url: "claude.ai integration",
      },
      {
        id: "mcp_google_drive",
        name: "google-drive",
        protocol: "http",
        health: "healthy",
        toolCount: 9,
        rttP50Ms: 110,
        rttP99Ms: 320,
        auth: "oauth",
        lastProbe: "31s ago",
        url: "claude.ai integration",
      },
      {
        id: "mcp_fulcrum_tools",
        name: "fulcrum-tools",
        protocol: "stdio",
        health: "healthy",
        toolCount: 23,
        rttP50Ms: 42,
        rttP99Ms: 128,
        auth: "token",
        lastProbe: "8s ago",
        command: "/usr/local/bin/fulcrum mcp",
      },
    ],
    "claude-sonnet": [
      {
        id: "mcp_open_design",
        name: "open-design",
        protocol: "http",
        health: "healthy",
        toolCount: 9,
        rttP50Ms: 31,
        rttP99Ms: 102,
        auth: "token",
        lastProbe: "40s ago",
        url: "http://127.0.0.1:56330",
      },
      {
        id: "mcp_fulcrum_tools",
        name: "fulcrum-tools",
        protocol: "stdio",
        health: "healthy",
        toolCount: 23,
        rttP50Ms: 44,
        rttP99Ms: 130,
        auth: "token",
        lastProbe: "1m ago",
        command: "/usr/local/bin/fulcrum mcp",
      },
    ],
    gpt: [
      {
        id: "mcp_fulcrum_tools",
        name: "fulcrum-tools",
        protocol: "stdio",
        health: "healthy",
        toolCount: 23,
        rttP50Ms: 39,
        rttP99Ms: 121,
        auth: "token",
        lastProbe: "2m ago",
        command: "/usr/local/bin/fulcrum mcp",
      },
    ],
    gemini: [],
    opencode: [
      {
        id: "mcp_deepwiki",
        name: "deepwiki",
        protocol: "http",
        health: "down",
        toolCount: 0,
        rttP50Ms: 0,
        rttP99Ms: 0,
        auth: "oauth",
        lastProbe: "5m ago",
        url: "https://api.deepwiki.com",
        error: "handshake refused: oauth token expired",
      },
    ],
    pi: [],
    codex: [
      {
        id: "mcp_fulcrum_tools",
        name: "fulcrum-tools",
        protocol: "stdio",
        health: "healthy",
        toolCount: 23,
        rttP50Ms: 41,
        rttP99Ms: 126,
        auth: "token",
        lastProbe: "3m ago",
        command: "/usr/local/bin/fulcrum mcp",
      },
    ],
  };

  /**
   * `?state=error` forces the global probe-failure banner so design-e2e can
   * prove the OD failure copy + secret redaction without a live MCP daemon.
   * The `error` data state is declared in the PRD `states` array.
   */
  const errorState = $derived(page.url.searchParams.get("state") === "error");

  let scopeAgentId = $state<string>(CLI_AGENTS[0]!.id);
  /** Working copy of every agent's registry: scope-switching swaps the slice. */
  let registries = $state<Record<string, McpServer[]>>(
    structuredClone(REGISTRY_BY_AGENT),
  );

  const servers = $derived(registries[scopeAgentId] ?? []);
  const scopeAgent = $derived(
    CLI_AGENTS.find((agent) => agent.id === scopeAgentId) ?? CLI_AGENTS[0]!,
  );
  const passingCount = $derived(servers.filter((s) => s.health === "healthy").length);
  const failingCount = $derived(servers.filter((s) => s.health !== "healthy").length);

  let showRegister = $state(false);
  let probingAll = $state(false);

  let regName = $state("");
  let regProtocol = $state<Protocol>("http");
  let regUrl = $state("");
  let regPort = $state("");
  let regCommand = $state("");
  let regArgs = $state("");
  let regEnv = $state("");
  let regToken = $state("");
  let regVerifyTls = $state(true);
  let regError = $state("");

  /** OD `healthy/degraded/down` → locked StatusBadge vocabulary (DESIGN.md §4.9). */
  function healthStatus(health: McpHealth): WorkflowStatus {
    if (health === "healthy") return "passing";
    if (health === "degraded") return "failing";
    return "failed";
  }

  /** OD Status badge label: `passing` / `failing` / `down`. */
  function healthLabel(health: McpHealth): string {
    if (health === "healthy") return "passing";
    if (health === "degraded") return "failing";
    return "down";
  }

  /** OD Auth column label. */
  function authLabel(auth: McpAuth): string {
    return auth === "none" ? "-" : auth;
  }

  /** OD `p50/p99 RTT` column: milliseconds rendered as `120 ms` / `6.4 s`. */
  function formatRtt(ms: number): string {
    if (ms <= 0) return "-";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
    return `${ms} ms`;
  }

  function patchServer(id: string, patch: Partial<McpServer>): void {
    registries = {
      ...registries,
      [scopeAgentId]: (registries[scopeAgentId] ?? []).map((server) =>
        server.id === id ? { ...server, ...patch } : server,
      ),
    };
  }

  function selectAgent(id: string): void {
    scopeAgentId = id;
  }

  function startRegister(): void {
    showRegister = true;
    regError = "";
  }

  function cancelRegister(): void {
    showRegister = false;
    regName = "";
    regUrl = "";
    regPort = "";
    regCommand = "";
    regArgs = "";
    regEnv = "";
    regToken = "";
    regProtocol = "http";
    regVerifyTls = true;
    regError = "";
  }

  function submitRegister(event: Event): void {
    event.preventDefault();
    if (!regName.trim()) {
      regError = "Name is required";
      return;
    }
    if (regProtocol === "http" && !regUrl.trim()) {
      regError = "URL is required for HTTP servers";
      return;
    }
    if (regProtocol === "stdio" && !regCommand.trim()) {
      regError = "Command path is required for stdio servers";
      return;
    }

    const server: McpServer = {
      id: `mcp_${regName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      name: regName.trim(),
      protocol: regProtocol,
      health: "down",
      toolCount: 0,
      rttP50Ms: 0,
      rttP99Ms: 0,
      auth: regToken.trim() ? "token" : "none",
      lastProbe: "never",
      ...(regProtocol === "http"
        ? { url: regPort ? `${regUrl.trim()}:${regPort.trim()}` : regUrl.trim() }
        : {
            command: regCommand.trim(),
            args: regArgs ? regArgs.split(/\s+/).filter(Boolean) : [],
            envKeys: regEnv ? regEnv.split(",").map((k) => k.trim()).filter(Boolean) : [],
          }),
    };
    registries = {
      ...registries,
      [scopeAgentId]: [...(registries[scopeAgentId] ?? []), server],
    };
    cancelRegister();
  }

  function probeServer(id: string): void {
    patchServer(id, { probeBusy: true });
    setTimeout(() => {
      const checkedAt = new Date().toISOString();
      const server = (registries[scopeAgentId] ?? []).find((s) => s.id === id);
      if (!server) return;
      if (server.health !== "healthy") {
        patchServer(id, {
          probeBusy: false,
          lastProbe: "just now",
          probe: {
            outcome: "unavailable",
            version: null,
            toolCount: 0,
            checkedAt,
            reason: server.error ?? "probe handshake failed",
            tools: [],
          },
        });
        return;
      }
      const tools = fixtureTools(server.id);
      patchServer(id, {
        probeBusy: false,
        lastProbe: "just now",
        probe: {
          outcome: "available",
          version: "1.0.0",
          toolCount: tools.length,
          checkedAt,
          tools,
        },
      });
    }, 150);
  }

  function probeAll(): void {
    probingAll = true;
    for (const server of servers) {
      probeServer(server.id);
    }
    setTimeout(() => {
      probingAll = false;
    }, 200);
  }

  function toggleTools(id: string): void {
    const server = servers.find((s) => s.id === id);
    patchServer(id, { showTools: !server?.showTools });
  }

  function setMode(id: string, mode: WorkflowMode): void {
    patchServer(id, { mode });
  }
</script>

<svelte:head>
  <title>Operate · MCP servers | Fulcrum</title>
</svelte:head>

<section
  data-operate-mcp
  data-state={errorState ? "error" : "populated"}
  class="mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-6 py-5 pb-20"
>
  <header data-mcp-head class="flex flex-wrap items-baseline gap-3">
    <h1 data-operate-mcp-header class="text-[22px] font-semibold tracking-tight">
      MCP servers
    </h1>
    <span data-mcp-count class="font-mono text-xs text-muted-foreground">
      {servers.length} registered · {passingCount} passing · {failingCount} failing · scoped
      to {scopeAgent.label}
    </span>
    <div class="ml-auto inline-flex gap-2">
      <button
        type="button"
        data-mcp-probe-all
        class={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
        disabled={probingAll || servers.length === 0}
        onclick={probeAll}
      >{probingAll ? "Probing…" : "Probe all"}</button>
      <button
        type="button"
        data-mcp-register-open
        class={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground",
          "hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
        onclick={startRegister}
      >Add server</button>
    </div>
  </header>

  <!-- Per-agent scope selector: MCP config is per CLI agent (DESIGN.md §11 item 9). -->
  <div
    data-mcp-scope
    class="flex flex-wrap items-center gap-2.5 rounded-md border border-border bg-muted/40 px-3.5 py-2.5"
  >
    <span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      Scope
    </span>
    <div
      data-mcp-scope-group
      role="radiogroup"
      aria-label="MCP server scope: CLI agent"
      class="inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-card p-0.5"
    >
      {#each CLI_AGENTS as agent (agent.id)}
        {@const active = agent.id === scopeAgentId}
        <button
          type="button"
          role="radio"
          aria-checked={active}
          data-mcp-scope-option={agent.id}
          data-active={active ? "true" : undefined}
          class={cn(
            "inline-flex h-6 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            active
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onclick={() => selectAgent(agent.id)}
        >
          <span
            aria-hidden="true"
            class={cn(
              "inline-grid size-3.5 place-items-center rounded-[3px] text-[8px] font-semibold",
              agent.avatarClass,
            )}
          >{agent.monogram}</span>
          {agent.label}
        </button>
      {/each}
    </div>
    <span class="flex-1"></span>
    <span data-mcp-scope-note class="text-[11px] text-muted-foreground">
      MCP servers are configured per agent. Use
      <a
        data-mcp-settings-link
        href="/settings#agents"
        class="text-primary no-underline hover:underline"
      >Settings &gt; AI agents</a>
      to add a new agent.
    </span>
  </div>

  {#if errorState}
    <ErrorBanner
      data-mcp-probe-error
      surface="block"
      title="Probe failed for {scopeAgent.label}"
      message="The last MCP probe could not reach one or more servers. Re-probe to refresh, or open the server logs."
      traceId="tr_b41c92e7d3a08f64"
      retryLabel="Probe all"
      onRetry={probeAll}
    />
  {/if}

  {#if servers.length === 0}
    <div data-mcp-empty class="mt-2">
      <EmptyState
        title="No MCP servers registered."
        description="MCP servers extend agents with tools, data, and policies. Add one to start."
      >
        {#snippet actions()}
          <button
            type="button"
            data-mcp-empty-add
            class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/80"
            onclick={startRegister}
          >Add server</button>
          <button
            type="button"
            data-mcp-empty-registry
            class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs hover:bg-muted"
          >Browse registry</button>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <div class="mt-1 overflow-x-auto rounded-lg border border-border">
      <table data-mcp-server-table class="w-full text-xs">
        <thead class="border-b border-border bg-muted/60">
          <tr>
            <th class="px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Server</th>
            <th class="w-[110px] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Status</th>
            <th class="w-[90px] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Tools</th>
            <th class="w-[110px] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">p50 RTT</th>
            <th class="w-[110px] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">p99 RTT</th>
            <th class="w-[110px] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Auth</th>
            <th class="w-[130px] px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">Last probe</th>
            <th class="w-[210px] px-3.5 py-2.5 text-left"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {#each servers as server (server.id)}
            <tr
              data-mcp-server-row={server.id}
              class="border-b border-border/60 last:border-0 hover:bg-muted/40"
            >
              <td class="px-3.5 py-3">
                <div class="flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    class="inline-grid size-7 place-items-center rounded-md bg-primary/10 text-primary"
                  >
                    <span class="text-[10px] font-semibold uppercase">
                      {server.protocol === "http" ? "ht" : "io"}
                    </span>
                  </span>
                  <div>
                    <div class="text-[13px] font-semibold">{server.name}</div>
                    {#if server.protocol === "http"}
                      <div data-mcp-server-url={server.id} class="font-mono text-[10px] text-muted-foreground">
                        http · {server.url}
                      </div>
                    {:else}
                      <div data-mcp-server-command={server.id} class="font-mono text-[10px] text-muted-foreground">
                        stdio · {server.command}{server.args && server.args.length
                          ? " " + server.args.join(" ")
                          : ""}
                      </div>
                    {/if}
                  </div>
                </div>
              </td>
              <td class="px-3.5 py-3">
                <StatusBadge
                  data-mcp-server-status={server.id}
                  data-mcp-health={server.health}
                  status={healthStatus(server.health)}
                />
              </td>
              <td class="px-3.5 py-3 font-mono" data-mcp-server-tool-count={server.id}>
                {server.toolCount}
              </td>
              <td class="px-3.5 py-3 font-mono" data-mcp-server-rtt-p50={server.id}>
                {formatRtt(server.rttP50Ms)}
              </td>
              <td
                class={cn(
                  "px-3.5 py-3 font-mono",
                  server.rttP99Ms >= 2000 && "text-warning-foreground",
                )}
                data-mcp-server-rtt-p99={server.id}
              >
                {formatRtt(server.rttP99Ms)}
              </td>
              <td class="px-3.5 py-3 font-mono" data-mcp-server-auth={server.id}>
                {authLabel(server.auth)}
              </td>
              <td class="px-3.5 py-3 font-mono text-muted-foreground" data-mcp-server-last-probe={server.id}>
                {server.lastProbe}
              </td>
              <td class="px-3.5 py-3">
                <div class="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    data-mcp-probe={server.id}
                    title="Probe"
                    class="inline-flex h-6 items-center rounded border border-border bg-card px-2 text-[11px] text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={server.probeBusy === true}
                    onclick={() => probeServer(server.id)}
                  >{server.probeBusy ? "Probing…" : "Probe"}</button>
                  <button
                    type="button"
                    data-mcp-logs={server.id}
                    title="Logs"
                    class="inline-flex h-6 items-center rounded border border-border bg-card px-2 text-[11px] text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >Logs</button>
                  <ModeRow
                    data-mcp-mode-row={server.id}
                    density="compact"
                    value={server.mode ?? "manual"}
                    onSelect={(mode) => setMode(server.id, mode)}
                  />
                </div>
              </td>
            </tr>
            {#if server.error && server.health !== "healthy"}
              <tr data-mcp-server-error-row={server.id} class="border-b border-border/60 last:border-0">
                <td colspan="8" class="px-3.5 pb-2.5 pt-0">
                  <p data-mcp-server-error={server.id} class="text-[11px] text-destructive">
                    {server.error}
                  </p>
                </td>
              </tr>
            {/if}
            {#if server.probe}
              <tr data-mcp-probe-result={server.id} class="border-b border-border/60 bg-muted/30 last:border-0">
                <td colspan="8" class="px-3.5 py-2.5">
                  <div class="flex flex-col gap-1 text-[11px]">
                    <span class="flex flex-wrap items-center gap-3">
                      <span
                        data-probe-outcome={server.id}
                        class={cn(
                          "rounded-sm px-2 py-0.5 text-[10px] uppercase",
                          server.probe.outcome === "available"
                            ? "bg-success/15 text-success"
                            : "bg-destructive/15 text-destructive",
                        )}
                      >{server.probe.outcome}</span>
                      <span data-probe-version={server.id} class="font-mono">
                        version: {server.probe.version ?? "unknown"}
                      </span>
                      <span data-probe-tool-count={server.id} class="font-mono">
                        tools: {server.probe.toolCount}
                      </span>
                      <span data-probe-checked-at={server.id} class="font-mono text-muted-foreground">
                        checked: {server.probe.checkedAt}
                      </span>
                      {#if server.probe.tools.length > 0}
                        <button
                          type="button"
                          data-mcp-tools-toggle={server.id}
                          class="ml-auto inline-flex h-6 items-center rounded border border-border px-2 text-[11px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          onclick={() => toggleTools(server.id)}
                        >{server.showTools ? "Hide tools" : "Show tools"}</button>
                      {/if}
                    </span>
                    {#if server.probe.outcome === "unavailable" && server.probe.reason}
                      <span data-probe-reason={server.id} class="text-destructive">
                        {server.probe.reason}
                      </span>
                    {/if}
                  </div>
                </td>
              </tr>
            {/if}
            {#if server.probe && server.showTools && server.probe.tools.length > 0}
              <tr data-mcp-tools-row={server.id} class="border-b border-border/60 last:border-0">
                <td colspan="8" class="px-3.5 pb-3">
                  <ul
                    data-mcp-tools-list={server.id}
                    class="flex flex-col gap-1 rounded-md border border-border bg-background p-3 text-[11px]"
                  >
                    {#each server.probe.tools as tool (tool.name)}
                      <li data-mcp-tool={tool.name} class="flex flex-col">
                        <span class="font-mono font-medium">{tool.name}</span>
                        <span class="text-muted-foreground">{tool.description}</span>
                        <span class="font-mono text-[10px] text-muted-foreground">
                          schema: {tool.inputSchemaPreview}
                        </span>
                      </li>
                    {/each}
                  </ul>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  {#if showRegister}
    <form
      data-mcp-register-form
      method="dialog"
      class="rounded-md border border-border p-4"
      onsubmit={submitRegister}
    >
      <h2 class="text-base font-semibold">Add MCP server</h2>
      <p class="mt-1 text-xs text-muted-foreground">
        The server is registered for <strong class="font-semibold text-foreground">{scopeAgent.label}</strong>.
      </p>
      <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-sm">
          Name
          <input
            data-mcp-register-name
            type="text"
            bind:value={regName}
            required
            class="h-9 rounded-md border border-border px-2"
          />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          Protocol
          <select
            data-mcp-register-protocol
            bind:value={regProtocol}
            class="h-9 rounded-md border border-border px-2"
          >
            <option value="http">HTTP</option>
            <option value="stdio">stdio</option>
          </select>
        </label>

        {#if regProtocol === "http"}
          <label class="flex flex-col gap-1 text-sm sm:col-span-2">
            URL
            <input
              data-mcp-register-url
              type="text"
              placeholder="https://example.com/mcp"
              bind:value={regUrl}
              class="h-9 rounded-md border border-border px-2 font-mono"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Port (optional)
            <input
              data-mcp-register-port
              type="text"
              bind:value={regPort}
              class="h-9 rounded-md border border-border px-2"
            />
          </label>
          <label class="flex items-center gap-2 text-sm">
            <input
              data-mcp-register-verify-tls
              type="checkbox"
              bind:checked={regVerifyTls}
            />
            Verify TLS certificates
          </label>
        {:else}
          <label class="flex flex-col gap-1 text-sm sm:col-span-2">
            Command path
            <input
              data-mcp-register-command
              type="text"
              placeholder="/usr/local/bin/mcp-..."
              bind:value={regCommand}
              class="h-9 rounded-md border border-border px-2 font-mono"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm sm:col-span-2">
            Args (space-separated)
            <input
              data-mcp-register-args
              type="text"
              bind:value={regArgs}
              class="h-9 rounded-md border border-border px-2 font-mono"
            />
          </label>
          <label class="flex flex-col gap-1 text-sm sm:col-span-2">
            Env keys (comma-separated)
            <input
              data-mcp-register-env
              type="text"
              placeholder="PG_PASSWORD, API_KEY"
              bind:value={regEnv}
              class="h-9 rounded-md border border-border px-2 font-mono"
            />
          </label>
        {/if}

        <label class="flex flex-col gap-1 text-sm sm:col-span-2">
          Auth token (optional)
          <CredentialInput data-mcp-register-token bind:value={regToken} />
        </label>
      </div>

      {#if regError}
        <p
          data-mcp-register-error
          class="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-sm text-destructive"
        >{regError}</p>
      {/if}

      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          data-mcp-register-cancel
          class="h-9 rounded-md border border-border px-3 text-sm"
          onclick={cancelRegister}
        >Cancel</button>
        <button
          type="submit"
          data-mcp-register-submit
          class="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >Add server</button>
      </div>
    </form>
  {/if}
</section>
