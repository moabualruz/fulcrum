<script lang="ts">
  import { Badge, Button, Chip, Kbd, ModeRow, StatusBadge, TraceChip } from "@fulcrum/ui-kit";

  type AgentId = "claude-code" | "codex" | "gemini-cli" | "opencode" | "pi-cli";
  type RouteRole = "executor" | "validator" | "planner";

  const agentOptions: Array<{ id: AgentId; label: string; provider: string; client: string; tokens: number; source: "global" | "project" | "task" }> = [
    { id: "claude-code", label: "Claude Code Opus", provider: "Anthropic", client: "claude-code", tokens: 12480, source: "project" },
    { id: "codex", label: "Codex High", provider: "OpenAI", client: "codex", tokens: 10820, source: "task" },
    { id: "gemini-cli", label: "Gemini Pro", provider: "Google", client: "gemini-cli", tokens: 9340, source: "global" },
    { id: "opencode", label: "OpenCode Local", provider: "local", client: "opencode", tokens: 7680, source: "global" },
    { id: "pi-cli", label: "Pi Review", provider: "local", client: "pi-cli", tokens: 7120, source: "global" },
  ];

  const routeLabels: Record<RouteRole, string> = {
    executor: "Executor",
    validator: "Validator",
    planner: "Planner",
  };

  const storageKey = "fulcrum.ai-assist.agent-routes";

  const sources = [
    { kind: "Document", title: "Authentication rewrite brief", ref: "doc_auth_rewrite", detail: "Revision rev_142 · 4 source links" },
    { kind: "Attachment", title: "security-review.pdf", ref: "att_sec_review", detail: "2.4 MB · downloadable" },
    { kind: "Task", title: "AUTH-42 Persist issuance row per kid", ref: "task_auth_42", detail: "Blocked by schema review" },
  ];

  const suggestions = [
    "Draft implementation plan from this document",
    "List risks before planning starts",
    "Find similar past authentication work",
    "Create trace-linked follow-up tasks",
  ];

  const transcript = [
    { speaker: "User", text: "Use the selected document and attachment to start planning the authentication rewrite." },
    { speaker: "AI Assist", text: "I found 4 source refs, 2 task links, and 1 blocker. Planning can start with trace tr_8f29a4c1b3e0d5f7." },
    { speaker: "Tool", text: "read.document doc_auth_rewrite · read.attachment att_sec_review · list.related task_auth_42" },
  ];

  const agentRows = [
    { name: "claude-code", status: "Ready", latency: "0.8s", mcp: 12, plugins: 4 },
    { name: "codex", status: "Ready", latency: "0.6s", mcp: 9, plugins: 3 },
    { name: "gemini-cli", status: "Paused", latency: "n/a", mcp: 5, plugins: 2 },
  ];

  let selectedMode = $state<"play" | "discuss" | "ai-assist" | "trace">("ai-assist");
  let agentRoutes = $state<Record<RouteRole, AgentId>>({
    executor: "claude-code",
    validator: "codex",
    planner: "gemini-cli",
  });
  let savedNotice = $state("");

  function optionFor(agentId: AgentId) {
    return agentOptions.find((agent) => agent.id === agentId) ?? agentOptions[0]!;
  }

  function tokenEstimate(): number {
    return Object.values(agentRoutes).reduce((sum, agentId) => sum + optionFor(agentId).tokens, 0);
  }

  function persistAgentRoutes() {
    localStorage.setItem(storageKey, JSON.stringify(agentRoutes));
    savedNotice = "Agent overrides saved";
  }

  $effect(() => {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;
    try {
      agentRoutes = { ...agentRoutes, ...JSON.parse(saved) };
      savedNotice = "Saved agent overrides loaded";
    } catch {
      savedNotice = "";
    }
  });
</script>

<svelte:head>
  <title>AI Assist</title>
</svelte:head>

<main class="fixed inset-0 z-50 min-h-screen overflow-y-auto overflow-x-hidden bg-background text-foreground" data-ai-assist-page data-ai-assist-ready="true">
  <section class="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(420px,580px)]">
    <div class="flex min-w-0 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8" data-ai-assist-underlay>
      <nav class="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground" aria-label="Breadcrumb">
        <span>Plan</span>
        <span aria-hidden="true">/</span>
        <span>Documents</span>
        <span aria-hidden="true">/</span>
        <strong class="text-foreground">AI Assist</strong>
      </nav>

      <header class="flex flex-col gap-3 border-b border-border pb-5">
        <div class="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Plan</Badge>
          <StatusBadge status="running" />
          <TraceChip traceId="tr_8f29a4c1b3e0d5f7" />
        </div>
        <div class="grid gap-2">
          <h1 class="text-2xl font-semibold tracking-normal">AI Assist</h1>
          <p class="max-w-2xl text-sm leading-6 text-muted-foreground">
            Document context, attachments, task links, and trace refs stay visible while planning starts.
          </p>
        </div>
      </header>

      <section class="rounded-md border border-border bg-card p-4" data-ai-assist-anchor>
        <div class="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge status="blocked" />
              <h2 class="text-base font-semibold tracking-normal">Step 3 / 8 · Persist issuance row per key id</h2>
            </div>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Anchored to the selected document and attachment. Starting planning carries the same trace into tasks,
              run history, and source references.
            </p>
          </div>
          <ModeRow
            bind:value={selectedMode}
            modes={["play", "discuss", "ai-assist", "trace"]}
            ariaLabel="Step modes"
            data-ai-assist-mode-row
          />
        </div>
      </section>

      <section class="grid gap-3 md:grid-cols-3" aria-label="Source references" data-ai-assist-sources>
        {#each sources as source}
          <article class="rounded-md border border-border bg-card p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <Chip tone="neutral">{source.kind}</Chip>
                <h3 class="mt-3 truncate text-sm font-semibold tracking-normal">{source.title}</h3>
                <p class="mt-1 font-mono text-[11px] text-muted-foreground">{source.ref}</p>
              </div>
              <Button variant="ghost" size="sm">Open</Button>
            </div>
            <p class="mt-3 text-xs leading-5 text-muted-foreground">{source.detail}</p>
          </article>
        {/each}
      </section>

      <section class="rounded-md border border-border bg-card p-4" data-ai-assist-public-api-evidence>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold tracking-normal">Docs workbench evidence</h2>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">
              Create, edit, read, upload, download, and planning handoff use the public document surfaces.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <Chip tone="success">create/read persisted</Chip>
            <Chip tone="success">attachment downloadable</Chip>
            <Chip tone="success">trace refs ready</Chip>
          </div>
        </div>
      </section>
    </div>

    <aside
      class="flex min-h-screen w-full min-w-0 max-w-full flex-col overflow-x-hidden border-l border-border bg-card shadow-2xl lg:sticky lg:top-0"
      aria-label="AI Assist drawer"
      data-ai-assist-drawer
    >
      <header class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <span class="grid h-8 w-8 place-items-center rounded-md bg-accent/15 text-accent-foreground" aria-hidden="true">✨</span>
          <div class="min-w-0">
            <h2 class="truncate text-sm font-semibold tracking-normal">AI Assist</h2>
            <p class="font-mono text-[11px] text-muted-foreground">session run_8f29a4c · step 3 / 8</p>
          </div>
        </div>
        <select class="h-8 rounded-md border border-input bg-background px-2 text-xs" aria-label="Agent picker" data-ai-assist-agent-picker>
          <option>claude-code</option>
          <option>codex</option>
          <option>gemini-cli</option>
          <option>opencode</option>
          <option>pi-cli</option>
        </select>
        <Button variant="ghost" size="icon-sm" aria-label="Expand AI Assist">⛶</Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close AI Assist">×</Button>
      </header>

      <div class="flex flex-wrap gap-2 border-b border-border bg-muted/30 px-4 py-3 font-mono text-[11px] text-muted-foreground" data-ai-assist-meta>
        <span class="min-w-0 break-words">scope <strong class="text-foreground">doc_auth_rewrite</strong></span>
        <span class="min-w-0 break-words">policy <strong class="text-foreground">ask-on-write</strong></span>
        <span class="min-w-0 break-words">cost <strong class="text-foreground">$0.43</strong></span>
        <span class="min-w-0 break-words">tokens <strong class="text-foreground">12,480 / 4,312</strong></span>
      </div>

      <section class="grid gap-2 border-b border-border px-4 py-3" data-ai-assist-suggestions>
        <h3 class="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Suggestions for this screen</h3>
        <div class="grid gap-2">
          {#each suggestions as suggestion}
            <Button variant="outline" size="sm" class="justify-start text-left">{suggestion}</Button>
          {/each}
        </div>
      </section>

      <section class="grid gap-3 border-b border-border px-4 py-3" data-ai-assist-agent-routes>
        <details class="rounded-md border border-border bg-background p-3" open>
          <summary class="cursor-pointer text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            Agent routing
          </summary>
          <div class="mt-3 grid gap-3">
            {#each Object.keys(routeLabels) as role}
              {@const routeRole = role as RouteRole}
              {@const selected = optionFor(agentRoutes[routeRole])}
              <label class="grid gap-1 text-xs font-semibold text-muted-foreground">
                <span class="flex flex-wrap items-center gap-2">
                  {routeLabels[routeRole]}
                  <Chip tone={selected.source === "task" ? "success" : "neutral"}>{selected.source}</Chip>
                  <span class="font-mono text-[10px]">{selected.tokens.toLocaleString()} tokens</span>
                </span>
                <select
                  class="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground"
                  aria-label={`${routeLabels[routeRole]} agent`}
                  data-ai-assist-agent-route={routeRole}
                  bind:value={agentRoutes[routeRole]}
                >
                  {#each agentOptions as agent}
                    <option value={agent.id}>{agent.provider} / {agent.label} ({agent.client})</option>
                  {/each}
                </select>
              </label>
            {/each}
            <div class="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
              <span class="font-mono text-[11px] text-muted-foreground" data-ai-assist-token-estimate>
                estimate {tokenEstimate().toLocaleString()} tokens
              </span>
              <Button type="button" variant="outline" size="sm" data-ai-assist-save-agents onclick={persistAgentRoutes}>Change agent</Button>
            </div>
            {#if savedNotice}
              <p class="text-xs text-muted-foreground" data-ai-assist-agent-saved>{savedNotice}</p>
            {/if}
          </div>
        </details>
      </section>

      <section class="grid gap-2 border-b border-border px-4 py-3" data-ai-assist-agent-registry>
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Agent registry</h3>
          <a class="text-xs font-medium text-accent-foreground underline-offset-4 hover:underline" href="/settings#agents">Manage agents</a>
        </div>
        <input class="h-8 rounded-md border border-input bg-background px-2 text-xs" value="cod" aria-label="Filter agents" />
        <div class="grid gap-2">
          {#each agentRows as agent}
            <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-border bg-background px-3 py-2">
              <div class="min-w-0">
                <p class="truncate text-xs font-semibold">{agent.name}</p>
                <p class="font-mono text-[10px] text-muted-foreground">{agent.status} · {agent.latency}</p>
              </div>
              <p class="min-w-0 break-words text-right font-mono text-[10px] text-muted-foreground">{agent.mcp} mcp · {agent.plugins} plugins</p>
            </div>
          {/each}
        </div>
      </section>

      <section class="min-h-0 flex-1 overflow-auto px-4 py-4" data-ai-assist-transcript>
        <div class="grid gap-3">
          {#each transcript as message}
            <article class="rounded-md border border-border bg-background p-3">
              <div class="mb-2 flex items-center justify-between gap-3">
                <h3 class="text-xs font-semibold">{message.speaker}</h3>
                <span class="font-mono text-[10px] text-muted-foreground">tr_8f29a4c</span>
              </div>
              <p class="text-sm leading-6 text-muted-foreground">{message.text}</p>
            </article>
          {/each}
        </div>
      </section>

      <form class="grid gap-3 border-t border-border bg-background px-4 py-3" data-ai-assist-composer>
        <label class="grid gap-1 text-xs font-semibold text-muted-foreground">
          Composer
          <textarea
            class="min-h-24 resize-y rounded-md border border-input bg-card p-3 text-sm leading-6 text-foreground"
            aria-label="AI Assist composer"
          >@scope Draft a plan with source refs and acceptance criteria.</textarea>
        </label>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Chip tone="neutral">@ scope</Chip>
            <Chip tone="neutral">attach</Chip>
            <Kbd>⌘↵</Kbd>
          </div>
          <div class="flex gap-2">
            <Button type="button" variant="outline" size="sm">Save thread</Button>
            <Button type="button" size="sm">Send</Button>
          </div>
        </div>
      </form>
    </aside>
  </section>
</main>
