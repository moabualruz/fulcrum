<script lang="ts">
  /**
   * The one canonical `⌘K` CommandPalette (IA-MAP §6, DESIGN.md §4.12,
   * apps/web/CONTEXT.md "CommandPalette"). Mounted ONCE in `+layout.svelte`;
   * the two former preview routes (`/palette`, `/palette-cmd-k`) are retired
   * and redirect here.
   *
   * Composition: this component is a thin renderer over the `@fulcrum/ui-kit`
   * `command-palette` primitive set (Root / Input / List / Item / Empty /
   * Group) — it never hand-rolls an overlay, input, or section header. The
   * section MODEL (which sections, their order, their rows) is owned by the
   * pure `palette-sections.ts` resolver; the Scope tuple is derived by
   * `palette-scope.ts`. This file only wires the resolver output into the
   * ui-kit primitive and forwards row activation.
   *
   * Sections render in the locked IA-MAP §6 order: Recent → Workflow stage nav
   * → Project switcher → Step actions (Step-only) → Federated search →
   * Settings search → Workspace + theme → Help. The Step-actions section is
   * present only when a Step is in scope, and its Play / Discuss / AI Assist
   * rows delegate to the `mode-affordance-host` action set — the palette never
   * forks the `prd-web-mode-affordance-system` action list.
   */
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { toggleMode } from "mode-watcher";
  import {
    CommandPalette as PalettePrimitive,
    CommandPaletteInput,
    CommandPaletteList,
    CommandPaletteItem,
    CommandPaletteEmpty,
    CommandPaletteGroup,
  } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";
  import { oramaIndex } from "$lib/search/OramaIndex";
  import type { CommandItem } from "./command-palette-filter";
  import {
    paletteScopeChip,
    resolvePaletteSections,
    type FederatedHit,
    type PaletteRow,
    type PaletteSection,
  } from "./palette-sections.ts";
  import {
    deriveRouteScope,
    withStepScope,
    PALETTE_STEP_SCOPE_EVENT,
    type PaletteStepScopeDetail,
  } from "./palette-scope.ts";

  interface SearchHit {
    id: string;
    score: number;
    document: {
      title: string;
      body: string;
      kind: string;
      project: string;
      status: string;
      entityId: string;
    };
  }

  interface Props {
    /** Project/navigation command rows fed by `+layout.svelte` via `buildProjectCommandItems`. */
    items?: CommandItem[];
    open: boolean;
    onOpenChange: (next: boolean) => void;
    onSelect: (item: CommandItem) => void;
  }

  let { items = [], open, onOpenChange, onSelect }: Props = $props();

  let query = $state("");
  let searchHits = $state<SearchHit[]>([]);
  let stepScope = $state<PaletteStepScopeDetail>(null);

  onMount(() => {
    const openPalette = () => onOpenChange(true);
    window.addEventListener("fulcrum:open-command-palette", openPalette);

    // A Step-bearing surface scopes the palette to a Step (IA-MAP §6.4) by
    // dispatching `fulcrum:palette-step-scope`; a null detail clears it.
    const onStepScope = (event: Event) => {
      stepScope = (event as CustomEvent<PaletteStepScopeDetail>).detail ?? null;
    };
    window.addEventListener(PALETTE_STEP_SCOPE_EVENT, onStepScope);

    return () => {
      window.removeEventListener("fulcrum:open-command-palette", openPalette);
      window.removeEventListener(PALETTE_STEP_SCOPE_EVENT, onStepScope);
    };
  });

  // ── Scope tuple (workspace, project, stage, step, trace) ─────────────────────
  // Derived live from the route + the active Step event — the palette result
  // set changes whenever any Scope field changes (DESIGN.md §4.12).
  const scope = $derived(
    withStepScope(
      deriveRouteScope({
        pathname: page.url.pathname,
        activeProjectId: (page.data as { activeProjectId?: string | null })?.activeProjectId ?? null,
      }),
      stepScope,
    ),
  );

  const scopeChip = $derived(paletteScopeChip(scope));

  // ── Federated search (2+ chars) ──────────────────────────────────────────────
  const isSearchQuery = $derived(query.trim().length >= 2);

  $effect(() => {
    if (!isSearchQuery || !oramaIndex.ready) {
      searchHits = [];
      return;
    }
    oramaIndex
      .search(query.trim(), { limit: 8 })
      .then((result) => {
        searchHits = (result.hits ?? []) as SearchHit[];
      })
      .catch(() => {
        searchHits = [];
      });
  });

  const federatedHits = $derived<FederatedHit[]>(
    searchHits.map((hit) => ({
      id: hit.document.entityId || hit.id,
      title: hit.document.title || hit.document.entityId,
      kind: hit.document.kind || "doc",
      href: `/${hit.document.kind ?? "search"}/${hit.document.entityId}`,
    })),
  );

  // ── Recent rows ──────────────────────────────────────────────────────────────
  // Frecency-ranked Recent (IA-MAP §6.1, 4 entries). Until a recents service
  // lands, the most-relevant navigation rows from the layout-fed `items` stand
  // in — the section stays Scope-aware because `items` is rebuilt per project.
  const recentRows = $derived<PaletteRow[]>(
    items.slice(0, 4).map((item) => ({
      id: `recent-${item.id}`,
      label: item.label,
      href: item.href,
      section: "recent" as const,
      icon: "activity",
    })),
  );

  // ── Settings search rows ─────────────────────────────────────────────────────
  // Every Settings destination by name (IA-MAP §6.6). Sourced from the
  // layout-fed command items whose href targets `/settings`.
  const settingsRows = $derived<PaletteRow[]>(
    items
      .filter((item) => item.href?.startsWith("/settings"))
      .map((item) => ({
        id: `setting-${item.id}`,
        label: item.label,
        href: item.href,
        section: "settings-search" as const,
        icon: "settings",
      })),
  );

  // ── Resolved IA-MAP §6 ordered sections ──────────────────────────────────────
  const sections = $derived<PaletteSection[]>(
    resolvePaletteSections({
      scope,
      recent: recentRows,
      federatedHits,
      settingsRows,
      handlers: {
        onToggleTheme: () => toggleMode(),
        onShortcuts: () => dispatchWindow("fulcrum:open-shortcut-help"),
      },
    }),
  );

  function dispatchWindow(name: string): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(name));
  }

  /** Activate a palette row: run its imperative action or navigate to its href. */
  function activate(row: PaletteRow): void {
    onOpenChange(false);
    if (row.run) {
      row.run();
      return;
    }
    if (row.href) {
      onSelect({ id: row.id, label: row.label, href: row.href });
      void goto(row.href);
    }
  }

  // The ui-kit CommandPalette primitive owns a `$bindable` `open`; the shell
  // owns the canonical `open` prop + `onOpenChange` callback. Bridge the two:
  // `paletteOpen` mirrors the prop into the primitive, and the effect below
  // propagates a primitive-driven close (Esc / backdrop) back up the shell.
  let paletteOpen = $state(open);

  $effect(() => {
    paletteOpen = open;
  });

  $effect(() => {
    if (paletteOpen !== open) {
      if (!paletteOpen) query = "";
      onOpenChange(paletteOpen);
    }
  });
</script>

<div data-command-palette data-state={open ? "open" : "closed"} class="contents">
  <PalettePrimitive
    bind:open={paletteOpen}
    title="Command palette"
    class="w-full max-w-xl"
  >
    <!-- Active-context chip — DESIGN.md §4.12 "menu never ambiguous" -->
    <div
      class="flex items-center gap-2 border-b border-border px-3 py-1.5"
      data-palette-scope-chip
    >
      <span class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        In scope
      </span>
      <span class="truncate text-xs font-medium text-foreground" data-palette-scope-value>
        {scopeChip}
      </span>
    </div>

    <CommandPaletteInput
      bind:value={query}
      data-command-palette-input
      placeholder="Search commands, projects, docs, runs…"
    />

    <CommandPaletteList>
      <CommandPaletteEmpty>No matches in this scope.</CommandPaletteEmpty>

      {#each sections as section (section.id)}
        <CommandPaletteGroup
          heading={section.label}
          data-palette-section={section.id}
        >
          {#each section.rows as row (row.id)}
            <CommandPaletteItem
              value={row.label}
              keywords={[row.id, row.section, row.description ?? ""]}
              data-command-palette-item
              data-palette-row={row.id}
              data-palette-row-section={section.id}
              onSelect={() => activate(row)}
            >
              <span
                class={cn(
                  "flex w-full items-center gap-2.5",
                )}
              >
                <span class="flex min-w-0 flex-1 items-center gap-2.5">
                  <span class="truncate text-foreground">{row.label}</span>
                  {#if row.description}
                    <span class="truncate text-xs text-muted-foreground" data-palette-row-desc>
                      {row.description}
                    </span>
                  {/if}
                </span>
                {#if row.kbd}
                  <kbd
                    class="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                    data-palette-row-kbd
                  >{row.kbd}</kbd>
                {/if}
              </span>
            </CommandPaletteItem>
          {/each}
        </CommandPaletteGroup>
      {/each}
    </CommandPaletteList>
  </PalettePrimitive>
</div>
