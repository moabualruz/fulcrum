<script lang="ts">
  /**
   * Operate · Plugins: OD `operate-plugins.html` fidelity surface.
   *
   * Canonical route: `/<ws>/projects/<projId>/operate/plugins` (IA-MAP.md §2.6 -
   * "Operate | :plugins | per-agent plugin scope | toggle / update /
   * install-across"). The live `operate-plugins` route folder is the migration
   * alias: `route-map.ts` `LEGACY_ROUTE_MAP` maps `operate-plugins → operate`,
   * so the `/operate-plugins` path resolves (no 404) while presenting as the
   * Operate stage, the same alias pattern as the sibling `operate-mcp` route.
   *
   * The defining interaction is the **per-agent scope selector** (DESIGN.md §11
   * item 9: "MCP servers and plugins are per agent … the Operate → MCP and
   * Operate → Plugins surfaces show a scope chip per agent, never a global
   * list"). Each CLI agent owns its own plugin registry; the segmented selector
   * switches the card grid between agents: the same `seg-group` the OD
   * `operate-plugins.html` and `operate-mcp.html` files share.
   *
   * Each plugin card carries the universal compact `ModeRow` (DESIGN.md §8.1 /
   * §4.13: "Universal: on every step header"; a plugin card is a Step) and an
   * on/off `Switch` (DESIGN.md §11: "Disabling a plugin keeps its files on
   * disk; uninstall removes them"). The toggle never removes files: it flips
   * the `enabled` flag only.
   *
   * The `Install across all agents` affordance ships disabled, labelled
   * "coming soon", until the `plugins.cross_agent` feature flag lands
   * (CLI-TUI-UX.md §1.6 `--all-agents`, design-alignment/operate.md
   * §operate-plugins.html "Migration notes").
   */
  import { page } from "$app/stores";
  import type { WorkflowMode } from "@fulcrum/shared-dto";
  import {
    Chip,
    EmptyState,
    ErrorBanner,
    ModeRow,
    Switch,
  } from "@fulcrum/ui-kit";
  import { cn } from "@fulcrum/ui-kit";

  /** OD plugin source: `npm` / `git` / `local` (the `.v` line). */
  type PluginSource = "npm" | "git" | "local";

  /** A plugin capability `tag-pill`: the OD `tag-pill` vocabulary. */
  type PluginTag =
    | "palette"
    | "prompt"
    | "subagent"
    | "step-action"
    | "review"
    | "policy"
    | "mcp"
    | "cli"
    | "skill"
    | "workflow";

  interface Plugin {
    id: string;
    name: string;
    version: string;
    source: PluginSource;
    description: string;
    tags: PluginTag[];
    /** OD card footer relative-time line: `last sync 2h ago` / `disabled 4d ago`. */
    lastSync: string;
    /** OD `update available · v2.1.5`: set only when a newer version exists. */
    updateVersion?: string;
    /** OD on/off `toggle`; `false` dims the card icon (the OD disabled card). */
    enabled: boolean;
    /** True when this agent installed the plugin: drives the `By me` filter. */
    installedByMe: boolean;
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
   * The seven CLI agents the OD `operate-plugins.html` scope `seg-group` lists,
   * matching the sibling `operate-mcp` route exactly so the shared ScopeChip
   * selector is identical across both Operate surfaces. Monogram avatar colors
   * follow DESIGN.md §4.16: Claude → `accent`, general → `success`,
   * Gemini → `accent`, OpenCode → `warning`, Pi → `secondary`,
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

  /**
   * Plugin registries keyed by CLI agent id: DESIGN.md §11 item 9: each agent
   * owns its own plugin set. Switching the scope selector swaps the card grid
   * source. The `claude-opus` registry mirrors the OD `operate-plugins.html`
   * card list verbatim (caveman, codex, compound-engineering, context-mode,
   * fulcrum-tools, superpowers, huashu-design).
   */
  const REGISTRY_BY_AGENT: Record<string, Plugin[]> = {
    "claude-opus": [
      {
        id: "caveman",
        name: "caveman",
        version: "v0.4.2",
        source: "npm",
        description:
          "Ultra-compressed communication mode for agents. Cuts token usage ~75% while preserving technical substance.",
        tags: ["palette", "prompt"],
        lastSync: "last sync 2h ago",
        enabled: true,
        installedByMe: true,
      },
      {
        id: "codex",
        name: "codex",
        version: "v1.2.0",
        source: "git",
        description:
          "Delegate investigation, fix requests, and rescue work to a Codex subagent via the shared runtime.",
        tags: ["subagent", "step-action"],
        lastSync: "last sync 5h ago",
        enabled: true,
        installedByMe: false,
      },
      {
        id: "compound-engineering",
        name: "compound-engineering",
        version: "v2.1.4",
        source: "git",
        description:
          "25+ specialized review agents (correctness, security, performance, data-integrity, …) for PRs and plans.",
        tags: ["review", "subagent", "policy"],
        lastSync: "update available · v2.1.5",
        updateVersion: "v2.1.5",
        enabled: true,
        installedByMe: true,
      },
      {
        id: "context-mode",
        name: "context-mode",
        version: "v3.0.1",
        source: "npm",
        description:
          "Sandbox tools that keep large tool output out of the model context window. Includes ctx_execute, ctx_search.",
        tags: ["mcp", "step-action"],
        lastSync: "last sync 12s ago",
        enabled: true,
        installedByMe: false,
      },
      {
        id: "fulcrum-tools",
        name: "fulcrum-tools",
        version: "v0.18.0",
        source: "local",
        description:
          "Default Fulcrum CLI surface as MCP tools: spotbugs, lizard, jq, yq, sd, fzf, watchexec, eza, just, ruff, biome, …",
        tags: ["mcp", "cli"],
        lastSync: "last sync 8s ago",
        enabled: true,
        installedByMe: true,
      },
      {
        id: "superpowers",
        name: "superpowers",
        version: "v0.7.0",
        source: "git",
        description:
          "Skills for systematic debugging, TDD, dispatching parallel agents, executing plans, requesting code review.",
        tags: ["skill", "workflow"],
        lastSync: "last sync 1d ago",
        enabled: true,
        installedByMe: false,
      },
      {
        id: "huashu-design",
        name: "huashu-design",
        version: "v0.2.0",
        source: "npm",
        description:
          "HTML prototype + animation + slide skill. Disabled because conflicts with the default Open Design embed.",
        tags: ["skill"],
        lastSync: "disabled 4d ago",
        enabled: false,
        installedByMe: true,
      },
    ],
    "claude-sonnet": [
      {
        id: "caveman",
        name: "caveman",
        version: "v0.4.2",
        source: "npm",
        description:
          "Ultra-compressed communication mode for agents. Cuts token usage ~75% while preserving technical substance.",
        tags: ["palette", "prompt"],
        lastSync: "last sync 1h ago",
        enabled: true,
        installedByMe: true,
      },
      {
        id: "fulcrum-tools",
        name: "fulcrum-tools",
        version: "v0.18.0",
        source: "local",
        description:
          "Default Fulcrum CLI surface as MCP tools: spotbugs, lizard, jq, yq, sd, fzf, watchexec, eza, just, ruff, biome, …",
        tags: ["mcp", "cli"],
        lastSync: "last sync 30s ago",
        enabled: false,
        installedByMe: true,
      },
    ],
    gpt: [
      {
        id: "fulcrum-tools",
        name: "fulcrum-tools",
        version: "v0.18.0",
        source: "local",
        description:
          "Default Fulcrum CLI surface as MCP tools: spotbugs, lizard, jq, yq, sd, fzf, watchexec, eza, just, ruff, biome, …",
        tags: ["mcp", "cli"],
        lastSync: "last sync 2m ago",
        enabled: true,
        installedByMe: true,
      },
    ],
    gemini: [],
    opencode: [
      {
        id: "context-mode",
        name: "context-mode",
        version: "v3.0.1",
        source: "npm",
        description:
          "Sandbox tools that keep large tool output out of the model context window. Includes ctx_execute, ctx_search.",
        tags: ["mcp", "step-action"],
        lastSync: "update available · v3.0.2",
        updateVersion: "v3.0.2",
        enabled: true,
        installedByMe: true,
      },
    ],
    pi: [],
    codex: [
      {
        id: "fulcrum-tools",
        name: "fulcrum-tools",
        version: "v0.18.0",
        source: "local",
        description:
          "Default Fulcrum CLI surface as MCP tools: spotbugs, lizard, jq, yq, sd, fzf, watchexec, eza, just, ruff, biome, …",
        tags: ["mcp", "cli"],
        lastSync: "last sync 3m ago",
        enabled: true,
        installedByMe: false,
      },
    ],
  };

  /** The OD filter `chip` row: All / Enabled / Disabled / Updates available / By me. */
  type PluginFilter = "all" | "enabled" | "disabled" | "updates" | "by-me";

  const FILTERS: { id: PluginFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "enabled", label: "Enabled" },
    { id: "disabled", label: "Disabled" },
    { id: "updates", label: "Updates available" },
    { id: "by-me", label: "By me" },
  ];

  /**
   * `?state=error` forces the sync-failure banner so design-e2e can prove the
   * OD failure copy without a live plugin server. The `error` data state is
   * declared in the PRD `states` array.
   */
  const errorState = $derived($page.url.searchParams.get("state") === "error");

  let scopeAgentId = $state<string>(CLI_AGENTS[0]!.id);
  let activeFilter = $state<PluginFilter>("all");
  /** Working copy of every agent's registry: scope-switching swaps the slice. */
  let registries = $state<Record<string, Plugin[]>>(
    structuredClone(REGISTRY_BY_AGENT),
  );

  const plugins = $derived(registries[scopeAgentId] ?? []);
  const scopeAgent = $derived(
    CLI_AGENTS.find((agent) => agent.id === scopeAgentId) ?? CLI_AGENTS[0]!,
  );
  const enabledCount = $derived(plugins.filter((p) => p.enabled).length);
  const updateCount = $derived(plugins.filter((p) => p.updateVersion).length);

  /** Plugins visible under the active filter chip. */
  const visiblePlugins = $derived(
    plugins.filter((plugin) => {
      switch (activeFilter) {
        case "enabled":
          return plugin.enabled;
        case "disabled":
          return !plugin.enabled;
        case "updates":
          return Boolean(plugin.updateVersion);
        case "by-me":
          return plugin.installedByMe;
        default:
          return true;
      }
    }),
  );

  /** OD count line: `14 installed · 11 enabled · 1 update · scoped to …`. */
  const countLabel = $derived(
    `${plugins.length} installed · ${enabledCount} enabled · ${updateCount} update · scoped to ${scopeAgent.label}`,
  );

  function patchPlugin(id: string, patch: Partial<Plugin>): void {
    registries = {
      ...registries,
      [scopeAgentId]: (registries[scopeAgentId] ?? []).map((plugin) =>
        plugin.id === id ? { ...plugin, ...patch } : plugin,
      ),
    };
  }

  function selectAgent(id: string): void {
    scopeAgentId = id;
    activeFilter = "all";
  }

  /**
   * Flip a plugin's `enabled` flag: DESIGN.md §11: disabling keeps files on
   * disk, it does NOT uninstall. The plugin row stays in the registry; only the
   * flag changes (and the OD `last sync` line reflects the new state).
   */
  function toggleEnabled(id: string, next: boolean): void {
    patchPlugin(id, {
      enabled: next,
      lastSync: next ? "enabled just now" : "disabled just now",
    });
  }

  /** Apply an available update: clears `updateVersion`, bumps `version`. */
  function applyUpdate(id: string): void {
    const plugin = (registries[scopeAgentId] ?? []).find((p) => p.id === id);
    if (!plugin?.updateVersion) return;
    patchPlugin(id, {
      version: plugin.updateVersion,
      updateVersion: undefined,
      lastSync: "updated just now",
    });
  }

  function setMode(id: string, mode: WorkflowMode): void {
    patchPlugin(id, { mode });
  }
</script>

<svelte:head>
  <title>Operate · Plugins | Fulcrum</title>
</svelte:head>

<section
  data-operate-plugins
  data-state={errorState ? "error" : plugins.length === 0 ? "empty" : "populated"}
  class="mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-6 py-5 pb-20"
>
  <header data-plugins-head class="flex flex-wrap items-baseline gap-3">
    <h1 data-operate-plugins-header class="text-[22px] font-semibold tracking-tight">
      Plugins
    </h1>
    <span data-plugins-count class="font-mono text-xs text-muted-foreground">
      {countLabel}
    </span>
    <div class="ml-auto inline-flex gap-2">
      <button
        type="button"
        data-plugins-install
        class={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground",
          "hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
      >
        <span aria-hidden="true">+</span> Install plugin
      </button>
    </div>
  </header>

  <p data-plugins-intro class="mt-1 text-xs text-muted-foreground">
    Plugins extend Fulcrum with new commands, palette entries, and step modes.
    Plugins are installed
    <strong class="font-semibold text-foreground">per CLI agent</strong>: switch
    the scope below to see what's installed for another agent. Disabling a plugin
    keeps its files on disk; uninstall removes them.
  </p>

  <!-- Per-agent scope selector: plugins are per CLI agent (DESIGN.md §11 item 9). -->
  <div
    data-plugins-scope
    class="mt-1 flex flex-wrap items-center gap-2.5 rounded-md border border-border bg-muted/40 px-3.5 py-2.5"
  >
    <span class="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      Scope
    </span>
    <div
      data-plugins-scope-group
      role="radiogroup"
      aria-label="Plugin scope: CLI agent"
      class="inline-flex flex-wrap gap-0.5 rounded-md border border-border bg-card p-0.5"
    >
      {#each CLI_AGENTS as agent (agent.id)}
        {@const active = agent.id === scopeAgentId}
        <button
          type="button"
          role="radio"
          aria-checked={active}
          data-plugins-scope-option={agent.id}
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
    <button
      type="button"
      data-plugins-install-across
      disabled
      title="Cross-agent install is staged behind the plugins.cross_agent feature flag."
      class="inline-flex h-6 cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[11px] text-muted-foreground opacity-70"
    >
      <span aria-hidden="true">⟳</span> Install across all agents (coming soon)
    </button>
  </div>

  <!-- Filter chip row: All / Enabled / Disabled / Updates available / By me. -->
  <div data-plugins-filters role="group" aria-label="Filter plugins" class="flex flex-wrap gap-1.5">
    {#each FILTERS as filter (filter.id)}
      {@const active = filter.id === activeFilter}
      <Chip
        tone={active ? "accent" : "neutral"}
        removable={false}
        data-plugins-filter={filter.id}
        data-active={active ? "true" : undefined}
        role="button"
        tabindex={0}
        aria-pressed={active}
        class="cursor-pointer rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onclick={() => (activeFilter = filter.id)}
        onkeydown={(event: KeyboardEvent) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activeFilter = filter.id;
          }
        }}
      >
        {filter.label}
      </Chip>
    {/each}
  </div>

  {#if errorState}
    <ErrorBanner
      data-plugins-sync-error
      surface="block"
      title="Plugin sync failed for {scopeAgent.label}"
      message="The last plugin sync could not reach the registry. Re-sync to refresh, or open the agent logs."
      traceId="tr_8f29a4c1b3e0d5f7"
      retryLabel="Re-sync"
      onRetry={() => selectAgent(scopeAgentId)}
    />
  {/if}

  {#if plugins.length === 0}
    <div data-plugins-empty class="mt-2">
      <EmptyState
        title="No plugins installed."
        description="Plugins extend Fulcrum with new commands, palette entries, and step modes. Install one to start."
      >
        {#snippet actions()}
          <button
            type="button"
            data-plugins-empty-install
            class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/80"
          >
            <span aria-hidden="true">+</span> Install plugin
          </button>
          <button
            type="button"
            data-plugins-empty-registry
            class="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs hover:bg-muted"
          >Browse registry</button>
        {/snippet}
      </EmptyState>
    </div>
  {:else if visiblePlugins.length === 0}
    <p data-plugins-filter-empty class="mt-2 rounded-md border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
      No plugins match this filter.
    </p>
  {:else}
    <div
      data-plugins-grid
      class="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(330px,1fr))]"
    >
      {#each visiblePlugins as plugin (plugin.id)}
        <article
          data-plugin-card={plugin.id}
          data-enabled={plugin.enabled ? "true" : "false"}
          class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
        >
          <div class="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              data-plugin-icon={plugin.id}
              class={cn(
                "inline-grid size-8 shrink-0 place-items-center rounded-md text-[13px] font-semibold uppercase",
                plugin.enabled
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground opacity-50",
              )}
            >{plugin.name.slice(0, 2)}</span>
            <div class="min-w-0">
              <h3 data-plugin-name={plugin.id} class="truncate text-[13px] font-semibold">
                {plugin.name}
              </h3>
              <div data-plugin-version={plugin.id} class="font-mono text-[10px] text-muted-foreground">
                {plugin.version} · {plugin.source}
              </div>
            </div>
          </div>

          <p data-plugin-desc={plugin.id} class="text-xs leading-relaxed text-muted-foreground">
            {plugin.description}
          </p>

          <div data-plugin-tags={plugin.id} class="flex flex-wrap gap-1">
            {#each plugin.tags as tag (tag)}
              <span
                data-plugin-tag={tag}
                class="rounded-sm bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground"
              >{tag}</span>
            {/each}
          </div>

          <div
            class="mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 pt-2.5"
          >
            <span data-plugin-last-sync={plugin.id} class="font-mono text-[10px] text-muted-foreground">
              {plugin.lastSync}
            </span>
            {#if plugin.updateVersion}
              <button
                type="button"
                data-plugin-update={plugin.id}
                class="inline-flex h-6 items-center rounded border border-warning/40 bg-warning/15 px-2 text-[10px] font-medium text-warning-foreground hover:bg-warning/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onclick={() => applyUpdate(plugin.id)}
              >Update to {plugin.updateVersion}</button>
            {/if}
            <span class="flex-1"></span>
            <Switch
              data-plugin-toggle={plugin.id}
              aria-label="{plugin.enabled ? 'Disable' : 'Enable'} {plugin.name}"
              checked={plugin.enabled}
              onCheckedChange={(next) => toggleEnabled(plugin.id, next)}
            />
            <ModeRow
              data-plugin-mode-row={plugin.id}
              density="compact"
              value={plugin.mode ?? "manual"}
              onSelect={(mode) => setMode(plugin.id, mode)}
            />
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>
