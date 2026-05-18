<script lang="ts">
  import { cn } from "$lib/utils.js";

  type Protocol = "http" | "stdio";
  type Status = "connected" | "disconnected" | "connecting" | "error";

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
    status: Status;
    toolCount: number;
    url?: string;
    command?: string;
    args?: string[];
    envKeys?: string[];
    error?: string;
    probe?: ProbeResult;
    probeBusy?: boolean;
    showTools?: boolean;
  }

  const TOOL_FIXTURE: Record<string, McpTool[]> = {
    mcp_github: [
      { name: "create_issue", description: "Open a new GitHub issue", inputSchemaPreview: "{ owner, repo, title, body }" },
      { name: "list_prs", description: "List pull requests", inputSchemaPreview: "{ owner, repo, state? }" },
      { name: "comment_pr", description: "Append a comment to a PR", inputSchemaPreview: "{ owner, repo, number, body }" },
    ],
    mcp_filesystem: [
      { name: "read_file", description: "Read a file as UTF-8", inputSchemaPreview: "{ path }" },
      { name: "write_file", description: "Overwrite a file", inputSchemaPreview: "{ path, content }" },
    ],
    mcp_postgres: [
      { name: "query", description: "Run a parameterized SELECT", inputSchemaPreview: "{ sql, params? }" },
    ],
  };

  function fixtureTools(id: string): McpTool[] {
    return TOOL_FIXTURE[id] ?? [
      { name: "ping", description: "Probe handshake echo", inputSchemaPreview: "{}" },
    ];
  }

  const INITIAL_SERVERS: McpServer[] = [
    {
      id: "mcp_github",
      name: "GitHub MCP",
      protocol: "http",
      status: "connected",
      toolCount: 23,
      url: "https://api.github.com/mcp",
    },
    {
      id: "mcp_filesystem",
      name: "Filesystem",
      protocol: "stdio",
      status: "connected",
      toolCount: 11,
      command: "/usr/local/bin/mcp-filesystem",
      args: ["--root", "/Users/dev/projects"],
    },
    {
      id: "mcp_postgres",
      name: "Postgres",
      protocol: "stdio",
      status: "error",
      toolCount: 0,
      command: "/usr/local/bin/mcp-postgres",
      args: ["--dsn", "postgres://localhost/dev"],
      envKeys: ["PG_PASSWORD"],
      error: "connection refused on port 5432",
    },
  ];

  let servers = $state<McpServer[]>(INITIAL_SERVERS);
  let showRegister = $state(false);
  let confirmDisconnect = $state<string | null>(null);
  let busyId = $state<string | null>(null);

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

  function startRegister(): void {
    showRegister = true;
    regError = "";
  }

  function cancelRegister(): void {
    showRegister = false;
    regName = ""; regUrl = ""; regPort = ""; regCommand = ""; regArgs = ""; regEnv = ""; regToken = "";
    regProtocol = "http"; regVerifyTls = true; regError = "";
  }

  function submitRegister(event: Event): void {
    event.preventDefault();
    if (!regName.trim()) { regError = "Name is required"; return; }
    if (regProtocol === "http" && !regUrl.trim()) { regError = "URL is required for HTTP servers"; return; }
    if (regProtocol === "stdio" && !regCommand.trim()) { regError = "Command path is required for stdio servers"; return; }

    const server: McpServer = {
      id: `mcp_${regName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      name: regName.trim(),
      protocol: regProtocol,
      status: "disconnected",
      toolCount: 0,
      ...(regProtocol === "http" ? { url: regPort ? `${regUrl.trim()}:${regPort.trim()}` : regUrl.trim() } : {}),
      ...(regProtocol === "stdio" ? {
        command: regCommand.trim(),
        args: regArgs ? regArgs.split(/\s+/).filter(Boolean) : [],
        envKeys: regEnv ? regEnv.split(",").map((k) => k.trim()).filter(Boolean) : [],
      } : {}),
    };
    servers = [...servers, server];
    cancelRegister();
  }

  function connect(id: string): void {
    busyId = id;
    servers = servers.map((server) => server.id === id ? { ...server, status: "connecting" } : server);
    setTimeout(() => {
      servers = servers.map((server) => server.id === id
        ? { ...server, status: "connected", toolCount: server.toolCount || 4 }
        : server);
      busyId = null;
    }, 200);
  }

  function requestDisconnect(id: string): void {
    confirmDisconnect = id;
  }

  function confirmDisconnectAction(): void {
    if (!confirmDisconnect) return;
    servers = servers.map((server) => server.id === confirmDisconnect
      ? { ...server, status: "disconnected", toolCount: 0 }
      : server);
    confirmDisconnect = null;
  }

  function cancelDisconnect(): void {
    confirmDisconnect = null;
  }

  function probeServer(id: string): void {
    servers = servers.map((server) => server.id === id
      ? { ...server, probeBusy: true }
      : server);
    setTimeout(() => {
      const checkedAt = new Date().toISOString();
      servers = servers.map((server) => {
        if (server.id !== id) return server;
        if (server.status === "error") {
          return {
            ...server,
            probeBusy: false,
            probe: {
              outcome: "unavailable" as const,
              version: null,
              toolCount: 0,
              checkedAt,
              reason: server.error ?? "probe handshake failed",
              tools: [],
            },
          };
        }
        const tools = fixtureTools(server.id);
        return {
          ...server,
          probeBusy: false,
          probe: {
            outcome: "available" as const,
            version: "1.0.0",
            toolCount: tools.length,
            checkedAt,
            tools,
          },
        };
      });
    }, 150);
  }

  function toggleTools(id: string): void {
    servers = servers.map((server) => server.id === id
      ? { ...server, showTools: !server.showTools }
      : server);
  }
</script>

<svelte:head>
  <title>Operate · MCP servers | Fulcrum</title>
</svelte:head>

<section data-operate-mcp class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
  <header class="flex items-center justify-between gap-3">
    <div class="flex flex-col gap-1">
      <h1 data-operate-mcp-header class="text-2xl font-semibold tracking-tight">MCP servers</h1>
      <p class="text-sm text-muted-foreground">
        Manage agent-facing MCP servers without editing <code class="font-mono">~/.fulcrum/mcp-servers.json</code>.
      </p>
    </div>
    <button
      type="button"
      data-mcp-register-open
      class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      onclick={startRegister}
    >Register server</button>
  </header>

  <div class="overflow-x-auto rounded-md border border-border">
    <table data-mcp-server-table class="w-full text-sm">
      <thead class="border-b border-border bg-muted/50">
        <tr>
          <th class="px-4 py-2 text-left font-medium">Name</th>
          <th class="px-4 py-2 text-left font-medium">Protocol</th>
          <th class="px-4 py-2 text-left font-medium">Status</th>
          <th class="px-4 py-2 text-right font-medium">Tools</th>
          <th class="px-4 py-2 text-right font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each servers as server (server.id)}
          <tr data-mcp-server-row={server.id} class="border-b border-border last:border-0">
            <td class="px-4 py-2">
              <div class="flex flex-col">
                <span class="font-medium">{server.name}</span>
                {#if server.protocol === "http"}
                  <span data-mcp-server-url={server.id} class="font-mono text-xs text-muted-foreground">{server.url}</span>
                {:else}
                  <span data-mcp-server-command={server.id} class="font-mono text-xs text-muted-foreground">{server.command}{server.args && server.args.length ? " " + server.args.join(" ") : ""}</span>
                {/if}
              </div>
            </td>
            <td class="px-4 py-2" data-mcp-server-protocol={server.id}>{server.protocol.toUpperCase()}</td>
            <td class="px-4 py-2" data-mcp-server-status={server.id}>
              <span
                data-status-value={server.status}
                class={cn(
                  "rounded-sm px-2 py-0.5 text-xs",
                  server.status === "connected" && "bg-success/15 text-success",
                  server.status === "connecting" && "bg-warning/15 text-warning-foreground",
                  server.status === "disconnected" && "bg-muted text-muted-foreground",
                  server.status === "error" && "bg-destructive/15 text-destructive",
                )}
              >{server.status}</span>
              {#if server.status === "error" && server.error}
                <p data-mcp-server-error={server.id} class="mt-1 text-xs text-destructive">{server.error}</p>
              {/if}
            </td>
            <td class="px-4 py-2 text-right font-mono text-xs" data-mcp-server-tool-count={server.id}>{server.toolCount}</td>
            <td class="px-4 py-2 text-right">
              <div class="flex justify-end gap-2">
                <button
                  type="button"
                  data-mcp-probe={server.id}
                  class="h-8 rounded-md border border-border px-2 text-xs"
                  disabled={server.probeBusy === true}
                  onclick={() => probeServer(server.id)}
                >{server.probeBusy ? "Probing…" : "Probe"}</button>
                {#if server.status === "disconnected" || server.status === "error"}
                  <button
                    type="button"
                    data-mcp-connect={server.id}
                    class="h-8 rounded-md border border-border px-2 text-xs"
                    disabled={busyId === server.id}
                    onclick={() => connect(server.id)}
                  >{busyId === server.id ? "Connecting…" : "Connect"}</button>
                {:else}
                  <button
                    type="button"
                    data-mcp-disconnect={server.id}
                    class="h-8 rounded-md border border-destructive/40 px-2 text-xs text-destructive"
                    onclick={() => requestDisconnect(server.id)}
                  >Disconnect</button>
                {/if}
              </div>
            </td>
          </tr>
          {#if server.probe}
            <tr data-mcp-probe-result={server.id} class="border-b border-border last:border-0 bg-muted/20">
              <td colspan="5" class="px-4 py-2">
                <div class="flex flex-col gap-1 text-xs">
                  <span class="flex flex-wrap items-center gap-3">
                    <span data-probe-outcome={server.id} class={cn(
                      "rounded-sm px-2 py-0.5 text-[10px] uppercase",
                      server.probe.outcome === "available" && "bg-success/15 text-success",
                      server.probe.outcome === "unavailable" && "bg-destructive/15 text-destructive",
                    )}>{server.probe.outcome}</span>
                    <span data-probe-version={server.id} class="font-mono">version: {server.probe.version ?? "unknown"}</span>
                    <span data-probe-tool-count={server.id} class="font-mono">tools: {server.probe.toolCount}</span>
                    <span data-probe-checked-at={server.id} class="font-mono text-muted-foreground">checked: {server.probe.checkedAt}</span>
                    {#if server.probe.tools.length > 0}
                      <button
                        type="button"
                        data-mcp-tools-toggle={server.id}
                        class="ml-auto h-7 rounded-md border border-border px-2 text-[11px]"
                        onclick={() => toggleTools(server.id)}
                      >{server.showTools ? "Hide tools" : "Show tools"}</button>
                    {/if}
                  </span>
                  {#if server.probe.outcome === "unavailable" && server.probe.reason}
                    <span data-probe-reason={server.id} class="text-destructive">{server.probe.reason}</span>
                  {/if}
                </div>
              </td>
            </tr>
          {/if}
          {#if server.probe && server.showTools && server.probe.tools.length > 0}
            <tr data-mcp-tools-row={server.id} class="border-b border-border last:border-0">
              <td colspan="5" class="px-4 pb-3">
                <ul data-mcp-tools-list={server.id} class="flex flex-col gap-1 rounded-md border border-border bg-background p-3 text-xs">
                  {#each server.probe.tools as tool (tool.name)}
                    <li data-mcp-tool={tool.name} class="flex flex-col">
                      <span class="font-mono font-medium">{tool.name}</span>
                      <span class="text-muted-foreground">{tool.description}</span>
                      <span class="font-mono text-[10px] text-muted-foreground">schema: {tool.inputSchemaPreview}</span>
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

  {#if showRegister}
    <form
      data-mcp-register-form
      method="dialog"
      class="rounded-md border border-border p-4"
      onsubmit={submitRegister}
    >
      <h2 class="text-base font-semibold">Register MCP server</h2>
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
          <input
            data-mcp-register-token
            type="password"
            bind:value={regToken}
            class="h-9 rounded-md border border-border px-2 font-mono"
          />
        </label>
      </div>

      {#if regError}
        <p data-mcp-register-error class="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-sm text-destructive">{regError}</p>
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
        >Register</button>
      </div>
    </form>
  {/if}

  {#if confirmDisconnect}
    <div
      data-mcp-disconnect-confirm={confirmDisconnect}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mcp-disconnect-title"
      class="rounded-md border border-destructive/40 bg-destructive/5 p-4"
    >
      <p id="mcp-disconnect-title" class="text-sm font-medium">Disconnect MCP server?</p>
      <p class="text-xs text-muted-foreground">Dependent agent tools from this server will become unavailable.</p>
      <div class="mt-3 flex gap-2">
        <button
          type="button"
          data-mcp-disconnect-confirm-yes
          class="h-9 rounded-md bg-destructive px-3 text-sm text-destructive-foreground"
          onclick={confirmDisconnectAction}
        >Confirm disconnect</button>
        <button
          type="button"
          data-mcp-disconnect-confirm-cancel
          class="h-9 rounded-md border border-border px-3 text-sm"
          onclick={cancelDisconnect}
        >Cancel</button>
      </div>
    </div>
  {/if}
</section>
