<script lang="ts">
  /**
   * `/<ws>/projects/<projId>/plan/prompts`: the Plan-stage prompt library
   * (`prd-web-plan-prompts-od-fidelity`; OD `plan-prompts.html`; IA-MAP.md §3
   * `:prompts` "prompt library · tag filter"; CLI-TUI-UX.md §1 line 466;
   * DESIGN.md §4.11/§4.13 per-step mode row; COPY.md §2 empty-state shape).
   *
   * The OD prototype renders the prompt library as a single scrolling page:
   *
   *   page-head ("Prompt library" + sync count) → subtitle →
   *   toolbar (search input + stage-filter chips) → prompt rows
   *
   * Each prompt row is an icon tile + title + monospace preview + tag pills +
   * usage count + author·age, with a four-button ModeRow underneath (Manual /
   * Play / Discuss / AI Assist): prompts feed any ▶ Play step in any stage.
   *
   * Before this rebuild `plan-prompts/+page.svelte` rendered a Build/Operate
   * "Workflow states" config editor (`<title>Project States</title>`,
   * `<h1>Workflow states</h1>`): the wrong surface entirely. That workflow-
   * state editor has a canonical home that already ships: the `WorkflowEditor`
   * component mounted at `/projects/<projId>/settings/workflow`. Re-homing the
   * mislabelled content therefore strands no feature: the canonical Workflow
   * settings route already owns state groups, the create-state form, the
   * palette, default-state selection, and the delete-with-usage guard. This
   * file is now the rendered prompt-library target; the `/plan-prompts` route
   * path keeps resolving (no 404).
   *
   * Composes `@fulcrum/ui-kit` primitives only: `Badge`, `Button`, `Chip`,
   * `EmptyState`, `Input`, `ModeRow`: never re-implements a primitive
   * (AGENTS.md ui-kit rule). The OD shell chrome (StageRail / ScopeBar /
   * StatusFooter / AcpDrawer) is provided by the root `+layout.svelte`; this
   * route renders the prompt-library page only.
   */
  import { page } from "$app/state";
  import { Badge, Button, Chip, EmptyState, Input, ModeRow } from "@fulcrum/ui-kit";
  import type { WorkflowMode } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  /**
   * A workflow stage a prompt is tagged for. `mine` is the synthetic "My
   * prompts" facet: author-owned rather than a real stage. Matches the OD
   * toolbar chip set (All / Capture / Plan / Build / Review / Ship / Operate /
   * My prompts) and CLI-TUI-UX.md §1 stage vocabulary.
   */
  type StageFilter =
    | "all"
    | "capture"
    | "plan"
    | "build"
    | "review"
    | "ship"
    | "operate"
    | "mine";

  /**
   * Prompt provenance: where a prompt was synced from. Mirrors the
   * `session > user > org > built-in` resolution model documented in
   * `apps/web/CONTEXT.md` (AiAssistSettingsRoute). A project-scoped prompt
   * shadows a global one of the same title; the higher-precedence source wins.
   */
  type PromptSource = "session" | "user" | "org" | "built-in";

  /** Resolution precedence: first match wins. Higher index = lower priority. */
  const SOURCE_PRECEDENCE: PromptSource[] = ["session", "user", "org", "built-in"];

  /** One reusable agent-handoff prompt in the library. */
  type Prompt = {
    id: string;
    /** OD icon glyph (the prototype uses lucide ids; here a stable glyph). */
    glyph: string;
    title: string;
    /** Monospace preview: the first line of the prompt body. */
    preview: string;
    /** Tag pills: `[step, model]` in OD (`plan` / `opus`, `review` / `sonnet`). */
    tags: string[];
    /** Usage telemetry: OD `used 47×`. */
    usage: number;
    author: string;
    /** Relative age: OD `3d`. */
    age: string;
    /** The stages this prompt is tagged for (drives the chip filter). */
    stages: StageFilter[];
    /** Sync provenance: drives the session>user>org>built-in precedence. */
    source: PromptSource;
    /** True when the current operator authored it (the "My prompts" facet). */
    authoredByMe: boolean;
  };

  /** The current operator: the "My prompts" facet keys off this. */
  const CURRENT_USER = "mkh";

  /**
   * The library: project + global prompts synced together (OD count
   * "34 prompts · synced from project + global"). Seven exemplars match the OD
   * rows verbatim; the rest cover every stage so the filter chips narrow a
   * non-empty list. This is design-surface fixture data, not a production
   * source: the real library derives from a prompt-sync query.
   */
  const library: Prompt[] = [
    {
      id: "plan-from-capture",
      glyph: "✦",
      title: "Plan from a capture",
      preview: "You are a senior product engineer. Given the capture below, produce a plan with…",
      tags: ["plan", "opus"],
      usage: 47,
      author: "mkh",
      age: "3d",
      stages: ["plan"],
      source: "user",
      authoredByMe: true,
    },
    {
      id: "critique-pr",
      glyph: "⌥",
      title: "Critique a PR for correctness",
      preview: "Read this PR diff. Identify race conditions, off-by-one errors, missing null guards…",
      tags: ["review", "sonnet"],
      usage: 132,
      author: "sarah",
      age: "8d",
      stages: ["review"],
      source: "org",
      authoredByMe: false,
    },
    {
      id: "repro-from-trace",
      glyph: "△",
      title: "Repro a bug from a trace",
      preview: "Given trace_id={trace}, produce a minimal reproduction script and a hypothesis for…",
      tags: ["debug", "opus"],
      usage: 22,
      author: "mkh",
      age: "5d",
      stages: ["build", "review"],
      source: "user",
      authoredByMe: true,
    },
    {
      id: "migration-risk",
      glyph: "▤",
      title: "Migration risk analysis",
      preview: "Given the schema diff, identify locking risk, backfill cost, and rollback strategy…",
      tags: ["migration", "opus"],
      usage: 4,
      author: "mkh",
      age: "14d",
      stages: ["build", "ship"],
      source: "user",
      authoredByMe: true,
    },
    {
      id: "release-notes",
      glyph: "➶",
      title: "Draft release notes",
      preview: "Read merged PRs since {previous-tag}. Group by user-facing change, infra, internal…",
      tags: ["ship", "sonnet"],
      usage: 18,
      author: "sarah",
      age: "2d",
      stages: ["ship"],
      source: "org",
      authoredByMe: false,
    },
    {
      id: "stride-threat-model",
      glyph: "⛨",
      title: "STRIDE threat model",
      preview: "Treat this design as a system under attack. Enumerate spoofing, tampering, repudiation…",
      tags: ["security", "opus"],
      usage: 6,
      author: "mkh",
      age: "18d",
      stages: ["plan", "review"],
      source: "user",
      authoredByMe: true,
    },
    {
      id: "flame-graph",
      glyph: "◉",
      title: "Flame-graph hypothesis",
      preview: "Given the attached profile, name the top 3 hot frames and propose a targeted fix…",
      tags: ["perf", "opus"],
      usage: 9,
      author: "mkh",
      age: "6d",
      stages: ["operate"],
      source: "user",
      authoredByMe: true,
    },
    {
      id: "intake-triage",
      glyph: "✎",
      title: "Triage an inbound capture",
      preview: "Read this raw capture. Classify it, name the affected module, and draft a one-line title…",
      tags: ["capture", "sonnet"],
      usage: 31,
      author: "org",
      age: "21d",
      stages: ["capture"],
      source: "built-in",
      authoredByMe: false,
    },
    {
      id: "doctor-probe-summary",
      glyph: "❡",
      title: "Summarize a doctor probe",
      preview: "Given the doctor JSON envelope, rank degraded subsystems and propose the first fix…",
      tags: ["operate", "sonnet"],
      usage: 12,
      author: "org",
      age: "9d",
      stages: ["operate"],
      source: "built-in",
      authoredByMe: false,
    },
  ];

  /**
   * Apply the `session > user > org > built-in` precedence: when two prompts
   * share a title, the higher-precedence source shadows the lower. Returns the
   * resolved, deduplicated library: the same model `apps/web/CONTEXT.md`
   * documents for skill/route resolution.
   */
  function resolveLibrary(prompts: Prompt[]): Prompt[] {
    const byTitle = new Map<string, Prompt>();
    for (const prompt of prompts) {
      const existing = byTitle.get(prompt.title);
      if (
        !existing ||
        SOURCE_PRECEDENCE.indexOf(prompt.source) < SOURCE_PRECEDENCE.indexOf(existing.source)
      ) {
        byTitle.set(prompt.title, prompt);
      }
    }
    return [...byTitle.values()];
  }

  const resolvedLibrary = resolveLibrary(library);

  /** The toolbar stage-filter chips, in OD order. */
  const stageChips: { id: StageFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "capture", label: "Capture" },
    { id: "plan", label: "Plan" },
    { id: "build", label: "Build" },
    { id: "review", label: "Review" },
    { id: "ship", label: "Ship" },
    { id: "operate", label: "Operate" },
    { id: "mine", label: "My prompts" },
  ];

  let activeStage = $state<StageFilter>("all");
  let query = $state("");
  /** Per-row selected mode: keyed by prompt id, defaults to `manual`. */
  let rowModes = $state<Record<string, WorkflowMode>>({});

  /**
   * Declared data states (`populated` | `empty`). `populated` is the default;
   * `?state=empty` renders the COPY.md §2 prompts empty state. This is a
   * design-surface state selector, not a production data source: the real
   * library derives its empty state from a zero-length prompt-sync query.
   */
  const isEmptyState = $derived(page.url.searchParams.get("state") === "empty");

  /** The library after the stage chip + search query are applied. */
  const visiblePrompts = $derived(
    resolvedLibrary.filter((prompt) => {
      const stageOk =
        activeStage === "all" ||
        (activeStage === "mine" ? prompt.authoredByMe : prompt.stages.includes(activeStage));
      const q = query.trim().toLowerCase();
      const queryOk =
        q === "" ||
        prompt.title.toLowerCase().includes(q) ||
        prompt.preview.toLowerCase().includes(q) ||
        prompt.tags.some((tag) => tag.toLowerCase().includes(q));
      return stageOk && queryOk;
    }),
  );

  /** The OD page-head count: recomputed from the resolved library. */
  const promptCount = resolvedLibrary.length;
  /** True when the filtered view is empty but the library itself is not. */
  const noMatches = $derived(!isEmptyState && visiblePrompts.length === 0);

  /** The data-state attribute the route exposes for design-e2e. */
  const dataState = $derived(isEmptyState ? "empty" : "populated");

  function modeFor(promptId: string): WorkflowMode {
    return rowModes[promptId] ?? "manual";
  }

  function selectMode(promptId: string, mode: WorkflowMode): void {
    rowModes = { ...rowModes, [promptId]: mode };
  }
</script>

<svelte:head>
  <title>Plan · Prompts</title>
</svelte:head>

<main
  data-plan-prompts-page
  data-state={dataState}
  class={cn("mx-auto flex w-full max-w-[1180px] flex-col gap-4 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8")}
>
  <header data-plan-prompts-head class={cn("flex flex-col gap-2")}>
    <div class={cn("flex flex-wrap items-baseline gap-3")}>
      <h1 class={cn("text-[22px] font-semibold tracking-[-0.01em] text-foreground")}>Prompt library</h1>
      <span
        data-plan-prompts-count
        class={cn("font-mono text-xs text-muted-foreground")}
      >{promptCount} prompts · synced from project + global</span>
    </div>
    <p class={cn("text-xs text-muted-foreground")}>
      Reusable prompts for agent handoff. Tagged by step, model, and policy. Prompts feed any ▶ Play step in any stage.
    </p>
  </header>

  {#if isEmptyState}
    <EmptyState
      data-plan-prompts-empty
      title="No prompts yet."
      description="Prompts are reusable agent instructions tagged by step, model, and policy. Save your first prompt to populate this library."
    >
      {#snippet icon()}
        <span aria-hidden="true">✦</span>
      {/snippet}
      {#snippet actions()}
        <Button data-plan-prompts-empty-action="new-prompt" size="sm">New prompt</Button>
        <Button data-plan-prompts-empty-action="import" variant="secondary" size="sm">
          Import from project
        </Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div
      data-plan-prompts-toolbar
      role="search"
      class={cn("flex flex-wrap items-center gap-2")}
    >
      <div class={cn("flex max-w-[360px] flex-1 items-center gap-1.5")}>
        <Input
          data-plan-prompts-search
          type="search"
          bind:value={query}
          placeholder="Search prompts…"
          aria-label="Search prompts"
          class={cn("h-8 text-xs")}
        />
      </div>
      <div
        data-plan-prompts-stage-filter
        role="group"
        aria-label="Filter prompts by stage"
        class={cn("flex flex-wrap items-center gap-1.5")}
      >
        {#each stageChips as chip (chip.id)}
          {@const active = activeStage === chip.id}
          <Chip
            data-plan-prompts-stage-chip={chip.id}
            data-active={active ? "true" : undefined}
            tone={active ? "accent" : "neutral"}
            interactive
            role="button"
            tabindex={0}
            aria-pressed={active}
            onclick={() => (activeStage = chip.id)}
            onkeydown={(event: KeyboardEvent) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activeStage = chip.id;
              }
            }}
            class={cn("cursor-pointer rounded-full px-2.5 py-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40")}
          >{chip.label}</Chip>
        {/each}
      </div>
    </div>

    {#if noMatches}
      <EmptyState
        data-plan-prompts-no-matches
        title="No prompts match."
        description="No prompts match this stage or search. Clear the filter to see the full library."
      >
        {#snippet icon()}
          <span aria-hidden="true">✦</span>
        {/snippet}
        {#snippet actions()}
          <Button
            data-plan-prompts-clear-filter
            variant="secondary"
            size="sm"
            onclick={() => {
              activeStage = "all";
              query = "";
            }}
          >Clear filter</Button>
        {/snippet}
      </EmptyState>
    {:else}
      <ul data-plan-prompts-rows class={cn("flex flex-col")}>
        {#each visiblePrompts as prompt (prompt.id)}
          <li
            data-plan-prompts-row={prompt.id}
            data-prompt-source={prompt.source}
            class={cn("grid grid-cols-[28px_1fr] gap-x-3.5 gap-y-1.5 border-b border-border/60 px-4 py-3 sm:grid-cols-[28px_1fr_auto]")}
          >
            <span
              data-slot="prompt-icon"
              aria-hidden="true"
              class={cn("flex size-7 items-center justify-center rounded-md bg-accent/10 text-sm text-accent-foreground")}
            >{prompt.glyph}</span>

            <div class={cn("min-w-0")}>
              <div class={cn("truncate text-[13px] font-medium text-foreground")}>{prompt.title}</div>
              <div
                data-slot="prompt-preview"
                class={cn("mt-0.5 truncate font-mono text-[11px] text-muted-foreground")}
              >{prompt.preview}</div>
            </div>

            <div class={cn("col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 sm:col-start-3 sm:justify-end")}>
              <div data-slot="prompt-tags" class={cn("flex items-center gap-1")}>
                {#each prompt.tags as tag (tag)}
                  <span
                    data-plan-prompts-tag={tag}
                    class={cn("inline-flex rounded-[3px] bg-muted px-1.5 py-px font-mono text-[10px] text-muted-foreground")}
                  >{tag}</span>
                {/each}
              </div>
              <span
                data-slot="prompt-usage"
                class={cn("font-mono text-[11px] text-muted-foreground")}
              >used {prompt.usage}×</span>
              <span
                data-slot="prompt-author"
                class={cn("font-mono text-[11px] text-muted-foreground")}
              >{prompt.author} · {prompt.age}</span>
              {#if prompt.author === CURRENT_USER}
                <Badge data-plan-prompts-mine={prompt.id} variant="accent" size="sm">Mine</Badge>
              {/if}
            </div>

            <ModeRow
              data-plan-prompts-mode-row={prompt.id}
              density="compact"
              value={modeFor(prompt.id)}
              ariaLabel="Prompt modes"
              onSelect={(mode) => selectMode(prompt.id, mode)}
              class={cn("col-span-full mt-0.5 sm:col-start-2 sm:col-span-2 sm:justify-self-start")}
            />
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>
