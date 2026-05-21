<script lang="ts">
  /**
   * System · Settings — the OD `settings.html` surface.
   *
   * The workspace-scoped settings surface (`IA-MAP.md §"System (workspace
   * scope)"`, canonical route `/settings`): a sticky section-nav rail plus
   * nine stacked panels — General, Appearance, Keyboard, Privacy & safety,
   * AI agents, Default routes, Integrations, Account, Danger zone — matching
   * the OD `settings.html` IA anchors `#general · #appearance · #keyboard ·
   * #privacy · #agents · #routes · #integrations · #account · #danger`
   * (`IA-MAP.md §3` line 280). Every panel header carries the universal tight
   * mode affordance row (`DESIGN.md §4.13` — `▶ Suggest / 💬 Discuss` only on
   * settings rows). Section labels are copy-locked against IA-MAP/COPY.md.
   *
   * Composes `@fulcrum/ui-kit` primitives only — Avatar / Badge / Button /
   * Input / Kbd / Switch / AlertDialog — plus the shared `mode-affordance-host`
   * ModeRow. No route-local re-implementations of a ui-kit primitive.
   *
   * Value preservation (`migration-strategy.md` checklist): the pre-existing
   * `/settings/*` sub-routes (theme, routing, connectors, api, flags, secrets,
   * …) are NOT removed — they remain reachable as deep links from the relevant
   * panels, so every old path still resolves and no feature is lost. Safe
   * edits still persist to `localStorage`.
   */
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle,
    AlertDialogTrigger,
    Avatar,
    AvatarFallback,
    Badge,
    Button,
    Input,
    Kbd,
    Switch,
  } from "@fulcrum/ui-kit";
  import { ModeRow, createStepModeRow } from "$lib/components/app/mode-affordance-host.ts";

  /** A persisted safe-edit settings draft. Mirrors the OD `settings.html` controls. */
  type SettingsDraft = {
    experienceMode: "simple" | "pro";
    defaultStage: "capture" | "plan" | "build";
    coldBootPrefetch: boolean;
    theme: "light" | "dark" | "auto";
    density: "compact" | "cozy" | "comfortable";
    reduceMotion: boolean;
    accentHue: string;
    vimNav: boolean;
    paletteKey: string;
    assistKey: string;
    railKey: string;
    diagnostics: boolean;
    confirmDestructive: boolean;
    redactSecrets: boolean;
    email: string;
  };

  const storageKey = "fulcrum.settings.system";

  const defaultDraft: SettingsDraft = {
    experienceMode: "pro",
    defaultStage: "plan",
    coldBootPrefetch: true,
    theme: "dark",
    density: "cozy",
    reduceMotion: false,
    accentHue: "250°",
    vimNav: true,
    paletteKey: "⌘ K",
    assistKey: "⌘ /",
    railKey: "[",
    diagnostics: true,
    confirmDestructive: true,
    redactSecrets: true,
    email: "mkh.ruzz@gmail.com",
  };

  /** The nine OD settings sections, in IA-MAP `§3` line-280 order. */
  const navSections = [
    { id: "general", label: "General", icon: "⚙" },
    { id: "appearance", label: "Appearance", icon: "◐" },
    { id: "keyboard", label: "Keyboard", icon: "⌘" },
    { id: "privacy", label: "Privacy & safety", icon: "🛡" },
    { id: "agents", label: "AI agents", icon: "✦" },
    { id: "routes", label: "Default routes", icon: "⤳" },
    { id: "integrations", label: "Integrations", icon: "🔌" },
    { id: "account", label: "Account", icon: "◍" },
    { id: "danger", label: "Danger zone", icon: "⚠", danger: true },
  ] as const;

  type SectionId = (typeof navSections)[number]["id"];

  /** Deep links into the pre-existing `/settings/*` sub-routes — value preservation. */
  const subRouteLinks: Partial<Record<SectionId, { href: string; label: string }[]>> = {
    appearance: [{ href: "/settings/theme", label: "Theme & display defaults" }],
    routes: [{ href: "/settings/routing", label: "Advanced routing rules & dry-run" }],
    integrations: [
      { href: "/settings/connectors", label: "Source connectors & sync health" },
      { href: "/settings/api", label: "API base URL, OpenAPI & keys" },
    ],
    general: [
      { href: "/settings/flags", label: "Feature flags" },
      { href: "/settings/secrets", label: "Secrets & rotation" },
    ],
  };

  type AgentHealth = "ready" | "paused" | "failing";

  /** Configured CLI agents — OD `#agents` panel registry. */
  const agents: ReadonlyArray<{
    id: string;
    initials: string;
    name: string;
    client: string;
    status: AgentHealth;
    latency: string;
    mcp: number;
    plugins: number;
    ring: string;
    isDefault: boolean;
  }> = [
    { id: "claude-opus-4.7", initials: "CL", name: "Claude Opus 4.7", client: "claude-code", status: "ready", latency: "142ms", mcp: 7, plugins: 12, ring: "preferred", isDefault: true },
    { id: "claude-sonnet-4.6", initials: "CL", name: "Claude Sonnet 4.6", client: "claude-code", status: "ready", latency: "88ms", mcp: 7, plugins: 12, ring: "preferred", isDefault: false },
    { id: "gpt-5.4", initials: "GP", name: "GPT-5.4", client: "codex", status: "ready", latency: "210ms", mcp: 4, plugins: 6, ring: "stable", isDefault: false },
    { id: "gemini-3-pro", initials: "GE", name: "Gemini 3 Pro", client: "gemini-cli", status: "ready", latency: "124ms", mcp: 5, plugins: 3, ring: "stable", isDefault: false },
    { id: "opencode-llama-3", initials: "OC", name: "OpenCode · Llama-3 70B", client: "opencode", status: "ready", latency: "305ms", mcp: 3, plugins: 0, ring: "experimental", isDefault: false },
    { id: "pi-cli-mistral", initials: "PI", name: "pi-cli · Mistral Large", client: "pi-cli", status: "paused", latency: "—", mcp: 2, plugins: 0, ring: "experimental", isDefault: false },
    { id: "codex-gpt-4o", initials: "CX", name: "Codex · GPT-4o", client: "codex", status: "failing", latency: "540ms", mcp: 4, plugins: 6, ring: "stable", isDefault: false },
  ];

  const healthTone: Record<AgentHealth, string> = {
    ready: "text-success",
    paused: "text-muted-foreground",
    failing: "text-destructive",
  };

  /** Default-route rules — OD `#routes` action-kind → agent table. */
  const routeRules = [
    { action: "plan.draft", agent: "Claude Opus 4.7", initials: "CL", why: "high-context planning" },
    { action: "plan.refactor", agent: "Claude Opus 4.7", initials: "CL", why: "—" },
    { action: "build.run.step", agent: "Claude Sonnet 4.6", initials: "CL", why: "fast iteration" },
    { action: "build.test.write", agent: "GPT-5.4", initials: "GP", why: "—" },
    { action: "review.suggest", agent: "Gemini 3 Pro", initials: "GE", why: "second opinion" },
    { action: "ship.changelog", agent: "Claude Sonnet 4.6", initials: "CL", why: "—" },
    { action: "operate.probe", agent: "OpenCode · Llama-3", initials: "OC", why: "local only · no cloud calls" },
  ] as const;

  const integrations = [
    { id: "github", label: "GitHub", connected: true, desc: "Connected as mkh · scopes: repo, workflow, read:org" },
    { id: "linear", label: "Linear", connected: false, desc: "Not connected." },
    { id: "slack", label: "Slack", connected: false, desc: "Not connected." },
  ] as const;

  /**
   * The signed-in operator's settings permission. A `member` cannot mutate the
   * Danger zone — the panel renders a read-only permission notice instead.
   * Resolved from the `permission` query param for the design-e2e permission
   * state.
   */
  let canAdminister = $state(true);
  /** True when the workspace has no configured CLI agents — OD empty state. */
  let agentsEmpty = $state(false);

  let draft = $state<SettingsDraft>({ ...defaultDraft });
  let savedAt = $state<string | null>(null);
  let search = $state("");
  let activeSection = $state<SectionId>("general");

  const normalizedSearch = $derived(search.trim().toLowerCase());

  /** Section visibility map, driven by the settings-search field filter. */
  const sectionMatches = $derived.by(() => {
    const matches = {
      general: true, appearance: true, keyboard: true, privacy: true,
      agents: true, routes: true, integrations: true, account: true, danger: true,
    } satisfies Record<SectionId, boolean>;
    if (!normalizedSearch) return matches;
    const fieldIndex: Record<SectionId, string> = {
      general: "general experience mode default stage cold boot prefetch feature flags secrets",
      appearance: "appearance theme density reduce motion accent hue display",
      keyboard: "keyboard vim navigation open palette key toggle ai assist left rail shortcut",
      privacy: "privacy safety anonymous diagnostics confirm destructive auto-redact secrets logs",
      agents: "ai agents cli claude codex gemini opencode pi-cli mcp plugins ring",
      routes: "default routes action kind agent assignment override",
      integrations: "integrations github linear slack connect connector api",
      account: "account email plan upgrade billing",
      danger: "danger zone reset local state delete workspace",
    };
    for (const section of navSections) {
      matches[section.id] = fieldIndex[section.id].includes(normalizedSearch);
    }
    return matches;
  });

  const visibleSectionCount = $derived(
    navSections.filter((s) => sectionMatches[s.id]).length,
  );

  onMount(() => {
    if (!browser) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("permission") === "member") canAdminister = false;
    if (params.get("agents") === "empty") agentsEmpty = true;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        draft = { ...defaultDraft, ...JSON.parse(saved) };
        savedAt = "restored";
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
    const hash = window.location.hash.replace("#", "") as SectionId;
    if (hash && navSections.some((s) => s.id === hash)) activeSection = hash;
  });

  function persist(): void {
    if (browser) window.localStorage.setItem(storageKey, JSON.stringify(draft));
    savedAt = new Date().toISOString();
  }

  function selectSection(id: SectionId): void {
    activeSection = id;
    if (browser) {
      document.getElementById(`panel-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /** Build a tight mode-affordance row for one settings panel header. */
  function panelModeRow(id: SectionId) {
    return createStepModeRow({ stepId: `settings.${id}`, kind: "setting-row", title: id });
  }

  function resetLocalState(): void {
    if (browser) window.localStorage.removeItem(storageKey);
    draft = { ...defaultDraft };
    savedAt = null;
  }

  function deleteWorkspace(): void {
    // Destructive action stub — the AlertDialog confirmation is the gate the
    // PRD interaction assertion proves. Wiring to the platform mutation lands
    // with the operate-stage workbench PRD.
    savedAt = null;
  }
</script>

<svelte:head>
  <title>Settings | Fulcrum</title>
</svelte:head>

<main
  data-settings-system
  data-settings-ready="true"
  data-permission={canAdminister ? "admin" : "member"}
  class="mx-auto flex w-full max-w-[1100px] flex-col gap-1 px-6 pt-5 pb-20"
>
  <header class="flex flex-col gap-3">
    <div class="flex items-baseline gap-3.5">
      <h1 class="type-h1 font-semibold tracking-tight">Settings</h1>
      <span class="type-code text-muted-foreground">workspace: mkh / fulcrum</span>
    </div>
    <div class="flex max-w-md items-center gap-2">
      <Input
        data-settings-search
        type="search"
        placeholder="Search settings…"
        bind:value={search}
        aria-label="Search settings"
      />
    </div>
    {#if normalizedSearch}
      <p data-settings-search-count class="type-caption text-muted-foreground">
        {visibleSectionCount} section{visibleSectionCount === 1 ? "" : "s"} match “{search}”
      </p>
    {/if}
  </header>

  <div class="mt-5 grid gap-7 lg:grid-cols-[220px_1fr]">
    <nav class="sticky top-[60px] hidden h-max flex-col gap-0.5 self-start lg:flex" aria-label="Settings sections">
      {#each navSections as section}
        <a
          data-settings-nav-link={section.id}
          href={`#${section.id}`}
          aria-current={activeSection === section.id ? "true" : undefined}
          class="flex items-center gap-2 rounded-md px-2.5 py-1.5 type-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
            {activeSection === section.id
              ? 'bg-primary/10 font-medium text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'}
            {section.danger ? 'text-destructive hover:text-destructive' : ''}"
          onclick={(e) => {
            e.preventDefault();
            selectSection(section.id);
          }}
        >
          <span aria-hidden="true">{section.icon}</span>
          {section.label}
        </a>
      {/each}
    </nav>

    <div class="flex min-w-0 flex-col gap-5">
      <!-- General -->
      {#if sectionMatches.general}
        <section id="panel-general" data-settings-panel="general" class="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-4.5 py-3.5">
            <h2 class="type-h3 font-semibold">General</h2>
            <div class="ml-auto"><ModeRow {...panelModeRow("general")} /></div>
          </header>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Experience mode</p>
              <p class="type-caption text-muted-foreground">Simple hides keyboard hints and expands controls. Pro keeps everything visible.</p>
            </div>
            <div class="inline-flex overflow-hidden rounded-md border border-border" role="radiogroup" aria-label="Experience mode">
              {#each [["simple", "Simple"], ["pro", "Pro"]] as [value, label]}
                <Button
                  variant={draft.experienceMode === value ? "default" : "ghost"}
                  size="xs"
                  role="radio"
                  aria-checked={draft.experienceMode === value}
                  data-settings-field="experience-mode"
                  class="rounded-none"
                  onclick={() => {
                    draft.experienceMode = value as SettingsDraft["experienceMode"];
                    persist();
                  }}
                >
                  {label}
                </Button>
              {/each}
            </div>
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Default stage on launch</p>
              <p class="type-caption text-muted-foreground">The stage Fulcrum jumps to when you cold-boot.</p>
            </div>
            <div class="inline-flex overflow-hidden rounded-md border border-border" role="radiogroup" aria-label="Default stage on launch">
              {#each [["capture", "Capture"], ["plan", "Plan"], ["build", "Build"]] as [value, label]}
                <Button
                  variant={draft.defaultStage === value ? "default" : "ghost"}
                  size="xs"
                  role="radio"
                  aria-checked={draft.defaultStage === value}
                  data-settings-field="default-stage"
                  class="rounded-none"
                  onclick={() => {
                    draft.defaultStage = value as SettingsDraft["defaultStage"];
                    persist();
                  }}
                >
                  {label}
                </Button>
              {/each}
            </div>
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Cold boot prefetch</p>
              <p class="type-caption text-muted-foreground">Warms the live planning + run feed caches at startup. Adds ~200ms.</p>
            </div>
            <Switch
              data-settings-field="cold-boot-prefetch"
              aria-label="Cold boot prefetch"
              bind:checked={draft.coldBootPrefetch}
              onCheckedChange={persist}
            />
          </div>

          {#each subRouteLinks.general ?? [] as link}
            <a
              data-settings-subroute={link.href}
              href={link.href}
              class="flex items-center gap-2 border-t border-border/60 px-4.5 py-2.5 type-caption text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label} →
            </a>
          {/each}
        </section>
      {/if}

      <!-- Appearance -->
      {#if sectionMatches.appearance}
        <section id="panel-appearance" data-settings-panel="appearance" class="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-4.5 py-3.5">
            <h2 class="type-h3 font-semibold">Appearance</h2>
            <div class="ml-auto"><ModeRow {...panelModeRow("appearance")} /></div>
          </header>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Theme</p>
              <p class="type-caption text-muted-foreground">Auto matches your OS.</p>
            </div>
            <div class="inline-flex overflow-hidden rounded-md border border-border" role="radiogroup" aria-label="Theme">
              {#each [["light", "Light"], ["dark", "Dark"], ["auto", "Auto"]] as [value, label]}
                <Button
                  variant={draft.theme === value ? "default" : "ghost"}
                  size="xs"
                  role="radio"
                  aria-checked={draft.theme === value}
                  data-settings-field="theme"
                  class="rounded-none"
                  onclick={() => {
                    draft.theme = value as SettingsDraft["theme"];
                    persist();
                  }}
                >
                  {label}
                </Button>
              {/each}
            </div>
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Density</p>
              <p class="type-caption text-muted-foreground">Row height and base font size across tables and lists.</p>
            </div>
            <div class="inline-flex overflow-hidden rounded-md border border-border" role="radiogroup" aria-label="Density">
              {#each [["compact", "Compact"], ["cozy", "Cozy"], ["comfortable", "Comfortable"]] as [value, label]}
                <Button
                  variant={draft.density === value ? "default" : "ghost"}
                  size="xs"
                  role="radio"
                  aria-checked={draft.density === value}
                  data-settings-field="density"
                  class="rounded-none"
                  onclick={() => {
                    draft.density = value as SettingsDraft["density"];
                    persist();
                  }}
                >
                  {label}
                </Button>
              {/each}
            </div>
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Reduce motion</p>
              <p class="type-caption text-muted-foreground">Disables non-essential animations regardless of OS setting.</p>
            </div>
            <Switch
              data-settings-field="reduce-motion"
              aria-label="Reduce motion"
              bind:checked={draft.reduceMotion}
              onCheckedChange={persist}
            />
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Accent hue</p>
              <p class="type-caption text-muted-foreground">Hue 0–360 for the single product accent. Default 250° (cool blue).</p>
            </div>
            <Input
              data-settings-field="accent-hue"
              aria-label="Accent hue"
              class="w-24 font-mono text-xs"
              bind:value={draft.accentHue}
              onblur={persist}
            />
          </div>

          {#each subRouteLinks.appearance ?? [] as link}
            <a
              data-settings-subroute={link.href}
              href={link.href}
              class="flex items-center gap-2 border-t border-border/60 px-4.5 py-2.5 type-caption text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label} →
            </a>
          {/each}
        </section>
      {/if}

      <!-- Keyboard -->
      {#if sectionMatches.keyboard}
        <section id="panel-keyboard" data-settings-panel="keyboard" class="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-4.5 py-3.5">
            <h2 class="type-h3 font-semibold">Keyboard</h2>
            <div class="ml-auto"><ModeRow {...panelModeRow("keyboard")} /></div>
          </header>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Vim-style list navigation</p>
              <p class="type-caption text-muted-foreground">
                Enables <Kbd>j</Kbd> / <Kbd>k</Kbd>, <Kbd>gg</Kbd> / <Kbd>G</Kbd> in all lists.
              </p>
            </div>
            <Switch
              data-settings-field="vim-nav"
              aria-label="Vim-style list navigation"
              bind:checked={draft.vimNav}
              onCheckedChange={persist}
            />
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Open palette key</p>
              <p class="type-caption text-muted-foreground">
                Default <Kbd>⌘ K</Kbd>. TUI uses <Kbd>:</Kbd>.
              </p>
            </div>
            <Input
              data-settings-field="palette-key"
              aria-label="Open palette key"
              class="w-28 font-mono text-xs"
              bind:value={draft.paletteKey}
              onblur={persist}
            />
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Toggle AI Assist</p>
              <p class="type-caption text-muted-foreground">Slide-over AI Assist on web/mobile; inline :ai screen on TUI.</p>
            </div>
            <Input
              data-settings-field="assist-key"
              aria-label="Toggle AI Assist"
              class="w-28 font-mono text-xs"
              bind:value={draft.assistKey}
              onblur={persist}
            />
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Toggle left rail</p>
            </div>
            <Input
              data-settings-field="rail-key"
              aria-label="Toggle left rail"
              class="w-28 font-mono text-xs"
              bind:value={draft.railKey}
              onblur={persist}
            />
          </div>
        </section>
      {/if}

      <!-- Privacy & safety -->
      {#if sectionMatches.privacy}
        <section id="panel-privacy" data-settings-panel="privacy" class="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-4.5 py-3.5">
            <h2 class="type-h3 font-semibold">Privacy &amp; safety</h2>
            <div class="ml-auto"><ModeRow {...panelModeRow("privacy")} /></div>
          </header>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Send anonymous diagnostics</p>
              <p class="type-caption text-muted-foreground">Cold-boot time, panic backtraces, MCP latency. No code, prompts, or trace bodies.</p>
            </div>
            <Switch
              data-settings-field="diagnostics"
              aria-label="Send anonymous diagnostics"
              bind:checked={draft.diagnostics}
              onCheckedChange={persist}
            />
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Confirm before destructive actions</p>
              <p class="type-caption text-muted-foreground">Always show a confirm dialog for delete, force push, drop migration.</p>
            </div>
            <Switch
              data-settings-field="confirm-destructive"
              aria-label="Confirm before destructive actions"
              bind:checked={draft.confirmDestructive}
              onCheckedChange={persist}
            />
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Auto-redact secrets in logs</p>
              <p class="type-caption text-muted-foreground">
                Replaces AWS keys, GitHub tokens, OAuth tokens with <Kbd>[REDACTED]</Kbd> before persisting.
              </p>
            </div>
            <Switch
              data-settings-field="redact-secrets"
              aria-label="Auto-redact secrets in logs"
              bind:checked={draft.redactSecrets}
              onCheckedChange={persist}
            />
          </div>
        </section>
      {/if}

      <!-- AI agents -->
      {#if sectionMatches.agents}
        <section id="panel-agents" data-settings-panel="agents" class="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-4.5 py-3.5">
            <h2 class="type-h3 font-semibold">AI agents</h2>
            <span class="type-caption text-muted-foreground">unlimited CLI clients · per-agent MCP &amp; plugins</span>
            <div class="ml-auto"><ModeRow {...panelModeRow("agents")} /></div>
          </header>

          <div class="px-4.5 py-3.5">
            <p class="type-caption mb-3.5 text-muted-foreground">
              Connect any number of CLI agents — Claude Code, Codex, Gemini, OpenCode, pi-cli, or anything that
              speaks the agent protocol. Each agent runs locally with its own MCP server set and plugin selection.
              Use the picker in any chat to pick one for that thread; use
              <a href="#routes" class="text-primary hover:underline" onclick={(e) => { e.preventDefault(); selectSection("routes"); }}>Default routes</a>
              below to auto-assign action kinds to a preferred agent (you can always override per-action).
            </p>

            {#if agentsEmpty}
              <div data-settings-agents-empty class="rounded-md border border-dashed border-border px-4 py-8 text-center">
                <p class="type-body font-medium">No CLI agents connected yet.</p>
                <p class="type-caption mt-1 text-muted-foreground">
                  Connect a CLI agent to route planning, build, and review actions. Press <Kbd>a</Kbd> to add one.
                </p>
                <Button data-settings-add-agent variant="outline" size="sm" class="mt-4">+ Add CLI agent</Button>
              </div>
            {:else}
              <ul class="flex flex-col gap-2" aria-label="Configured CLI agents">
                {#each agents as agent}
                  <li
                    data-settings-agent-row={agent.id}
                    class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border bg-background px-3 py-2.5
                      {agent.isDefault ? 'border-primary' : 'border-border'}"
                  >
                    <Avatar class="size-7 rounded-md text-[10px]">
                      <AvatarFallback>{agent.initials}</AvatarFallback>
                    </Avatar>
                    <div class="min-w-0 flex-1">
                      <p class="type-body flex min-w-0 flex-wrap items-center gap-1.5 font-medium">
                        {agent.name}
                        {#if agent.isDefault}
                          <span class="type-caption text-muted-foreground" title="Default agent">📌</span>
                        {/if}
                      </p>
                      <p class="type-caption flex flex-wrap items-center gap-1.5 text-muted-foreground">
                        <span>{agent.client}</span>
                        <span aria-hidden="true">·</span>
                        <span class={healthTone[agent.status]}>● {agent.status}</span>
                        <span aria-hidden="true">·</span>
                        <span>{agent.latency}</span>
                        <span aria-hidden="true">·</span>
                        <span>{agent.mcp} MCP</span>
                        <span aria-hidden="true">·</span>
                        <span>{agent.plugins} plugins</span>
                      </p>
                    </div>
                    <Badge variant="outline" class="capitalize">{agent.ring}</Badge>
                    <Button variant="ghost" size="icon-sm" aria-label={`Configure MCP & plugins for ${agent.name}`}>⚙</Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${agent.name}`}>⋯</Button>
                  </li>
                {/each}
              </ul>
              <Button data-settings-add-agent variant="outline" size="sm" class="mt-3.5 w-full justify-start">
                + Add CLI agent (claude-code · codex · gemini-cli · opencode · pi-cli · custom)
              </Button>
            {/if}

            <p class="type-caption mt-3.5 text-muted-foreground">
              <strong class="text-foreground">Per-agent MCP &amp; plugins:</strong>
              MCP servers and plugins are configured per agent until we can support cross-agent install. Click the
              gear on any agent row to manage that agent's MCP servers, plugin set, ring (preferred / stable /
              experimental), tool permissions, and rate limits.
            </p>
          </div>
        </section>
      {/if}

      <!-- Default routes -->
      {#if sectionMatches.routes}
        <section id="panel-routes" data-settings-panel="routes" class="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-4.5 py-3.5">
            <h2 class="type-h3 font-semibold">Default routes</h2>
            <span class="type-caption text-muted-foreground">per-action agent assignment · override anytime</span>
            <div class="ml-auto"><ModeRow {...panelModeRow("routes")} /></div>
          </header>

          <div class="min-w-0 px-4.5 py-3.5">
            <p class="type-caption mb-3.5 text-muted-foreground">
              Map an action kind (planning, code edit, test write, review, changelog, doctor probe) to a preferred
              agent. When you trigger that action without picking an agent, Fulcrum routes it to the default. The
              mode picker on every step still lets you override.
            </p>
            <div class="min-w-0 overflow-x-auto rounded-md border border-border">
              <table class="w-full min-w-[36rem] type-caption">
                <thead>
                  <tr class="bg-muted text-left text-muted-foreground">
                    <th class="px-2.5 py-2 font-semibold uppercase tracking-wide">When action is</th>
                    <th class="px-2.5 py-2 font-semibold uppercase tracking-wide">Route to</th>
                    <th class="px-2.5 py-2 font-semibold uppercase tracking-wide">Why</th>
                    <th class="px-2.5 py-2 font-semibold uppercase tracking-wide">Override</th>
                    <th class="px-2.5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {#each routeRules as rule}
                    <tr data-settings-route-rule={rule.action} class="border-t border-border">
                      <td class="px-2.5 py-2 font-mono">{rule.action}</td>
                      <td class="px-2.5 py-2">
                        <span class="inline-flex items-center gap-1.5">
                          <Avatar class="size-5 rounded text-[9px]">
                            <AvatarFallback>{rule.initials}</AvatarFallback>
                          </Avatar>
                          {rule.agent}
                        </span>
                      </td>
                      <td class="px-2.5 py-2 text-muted-foreground">{rule.why}</td>
                      <td class="px-2.5 py-2">
                        <Switch checked aria-label={`Allow inline override for ${rule.action}`} />
                      </td>
                      <td class="px-2.5 py-2">
                        <Button variant="outline" size="xs">Edit</Button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" class="mt-3.5">+ Add route rule</Button>
          </div>

          {#each subRouteLinks.routes ?? [] as link}
            <a
              data-settings-subroute={link.href}
              href={link.href}
              class="flex items-center gap-2 border-t border-border/60 px-4.5 py-2.5 type-caption text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label} →
            </a>
          {/each}
        </section>
      {/if}

      <!-- Integrations -->
      {#if sectionMatches.integrations}
        <section id="panel-integrations" data-settings-panel="integrations" class="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-4.5 py-3.5">
            <h2 class="type-h3 font-semibold">Integrations</h2>
            <div class="ml-auto"><ModeRow {...panelModeRow("integrations")} /></div>
          </header>

          {#each integrations as integration, i}
            <div
              data-settings-integration={integration.id}
              class="grid grid-cols-[1fr_auto] items-center gap-4 px-4.5 py-3.5
                {i < integrations.length - 1 ? 'border-b border-border/60' : ''}"
            >
              <div>
                <p class="type-body font-medium">{integration.label}</p>
                <p class="type-caption text-muted-foreground">{integration.desc}</p>
              </div>
              {#if integration.connected}
                <Button variant="destructive" size="xs" data-settings-integration-action="disconnect">Disconnect</Button>
              {:else}
                <Button variant="default" size="xs" data-settings-integration-action="connect">Connect</Button>
              {/if}
            </div>
          {/each}

          {#each subRouteLinks.integrations ?? [] as link}
            <a
              data-settings-subroute={link.href}
              href={link.href}
              class="flex items-center gap-2 border-t border-border/60 px-4.5 py-2.5 type-caption text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label} →
            </a>
          {/each}
        </section>
      {/if}

      <!-- Account -->
      {#if sectionMatches.account}
        <section id="panel-account" data-settings-panel="account" class="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-4.5 py-3.5">
            <h2 class="type-h3 font-semibold">Account</h2>
            <div class="ml-auto"><ModeRow {...panelModeRow("account")} /></div>
          </header>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
            <div><p class="type-body font-medium">Email</p></div>
            <Input
              data-settings-field="email"
              type="email"
              aria-label="Email"
              class="w-64"
              bind:value={draft.email}
              onblur={persist}
            />
          </div>

          <div class="grid grid-cols-[1fr_auto] items-center gap-4 px-4.5 py-3.5">
            <div>
              <p class="type-body font-medium">Plan</p>
              <p class="type-caption text-muted-foreground">Free tier · local-only · no cloud sync.</p>
            </div>
            <Button variant="outline" size="xs" data-settings-account-action="upgrade" class="border-primary text-primary">Upgrade</Button>
          </div>
        </section>
      {/if}

      <!-- Danger zone -->
      {#if sectionMatches.danger}
        <section
          id="panel-danger"
          data-settings-panel="danger"
          class="min-w-0 overflow-hidden rounded-lg border bg-card"
          style="border-color: color-mix(in oklch, var(--destructive) 30%, var(--border));"
        >
          <header class="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border px-4.5 py-3.5">
            <h2 class="type-h3 font-semibold text-destructive">Danger zone</h2>
            <div class="ml-auto"><ModeRow {...panelModeRow("danger")} /></div>
          </header>

          {#if !canAdminister}
            <div data-settings-danger-permission class="px-4.5 py-6">
              <p class="type-body font-medium">Workspace owner permission required.</p>
              <p class="type-caption mt-1 text-muted-foreground">
                Destructive actions — reset local state, delete workspace — are restricted to the workspace owner.
                Ask an owner to make these changes.
              </p>
            </div>
          {:else}
            <div class="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border/60 px-4.5 py-3.5">
              <div>
                <p class="type-body font-medium">Reset all local state</p>
                <p class="type-caption text-muted-foreground">Clears caches, MCP probes, agent transcripts. Captured plans and runs stay on disk.</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger>
                  {#snippet child({ props })}
                    <Button {...props} variant="destructive" size="xs" data-settings-danger-action="reset">Reset</Button>
                  {/snippet}
                </AlertDialogTrigger>
                <AlertDialogContent data-settings-confirm="reset">
                  <AlertDialogTitle>Reset all local state?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This clears caches, MCP probes, and agent transcripts. Captured plans and runs stay on disk.
                  </AlertDialogDescription>
                  <div class="mt-4 flex justify-end gap-2">
                    <AlertDialogCancel>
                      {#snippet child({ props })}
                        <Button {...props} variant="outline" size="sm">Cancel</Button>
                      {/snippet}
                    </AlertDialogCancel>
                    <AlertDialogAction>
                      {#snippet child({ props })}
                        <Button {...props} variant="destructive" size="sm" data-settings-confirm-action="reset" onclick={resetLocalState}>Reset</Button>
                      {/snippet}
                    </AlertDialogAction>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div class="grid grid-cols-[1fr_auto] items-center gap-4 px-4.5 py-3.5">
              <div>
                <p class="type-body font-medium">Delete workspace</p>
                <p class="type-caption text-muted-foreground">
                  Removes everything under
                  <code class="break-all font-mono text-[11px]">~/Library/Application Support/Open Design/…/fulcrum</code>.
                  Cannot be undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger>
                  {#snippet child({ props })}
                    <Button {...props} variant="destructive" size="xs" data-settings-danger-action="delete">Delete workspace</Button>
                  {/snippet}
                </AlertDialogTrigger>
                <AlertDialogContent data-settings-confirm="delete">
                  <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes everything under the Fulcrum workspace directory. This action cannot be undone.
                  </AlertDialogDescription>
                  <div class="mt-4 flex justify-end gap-2">
                    <AlertDialogCancel>
                      {#snippet child({ props })}
                        <Button {...props} variant="outline" size="sm">Cancel</Button>
                      {/snippet}
                    </AlertDialogCancel>
                    <AlertDialogAction>
                      {#snippet child({ props })}
                        <Button {...props} variant="destructive" size="sm" data-settings-confirm-action="delete" onclick={deleteWorkspace}>Delete workspace</Button>
                      {/snippet}
                    </AlertDialogAction>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          {/if}
        </section>
      {/if}

      {#if normalizedSearch && visibleSectionCount === 0}
        <div data-settings-no-results class="rounded-lg border border-dashed border-border px-6 py-12 text-center">
          <p class="type-body font-medium">No settings match “{search}”.</p>
          <p class="type-caption mt-1 text-muted-foreground">Try a section name like General, Keyboard, or Integrations.</p>
        </div>
      {/if}

      {#if savedAt}
        <p data-settings-saved class="type-caption text-muted-foreground">Saved · {savedAt}</p>
      {/if}
    </div>
  </div>
</main>
