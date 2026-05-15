<script lang="ts">
  /**
   * QuickFilters — sidebar preset filter buttons.
   * Presets: My Work, Due Today, Overdue, Unassigned, Blocked.
   */
  import { createEventDispatcher } from "svelte";
  import type { SavedViewQuery } from "@work-management/interface/saved-view-filters.ts";
  import { SavedViewQuerySchema } from "@work-management/interface/saved-view-filters.ts";
  import { Button } from "$lib/components/ui/button/index.js";

  interface Props {
    currentUserId?: string;
    activePreset?: string | null;
    includeArchived?: boolean;
  }

  let { currentUserId = "", activePreset = null, includeArchived = false }: Props = $props();

  const dispatch = createEventDispatcher<{
    filterChange: { query: SavedViewQuery; preset: string | null };
    export: SavedViewQuery;
    includeArchivedChange: boolean;
  }>();

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  // Preset definitions
  const PRESETS: Array<{ id: string; label: string; query: () => SavedViewQuery }> = [
    {
      id: "my_work",
      label: "My Work",
      query: () => SavedViewQuerySchema.parse({
        filters: [{ field: "assigneeId", op: "eq", value: currentUserId }],
        facets: {},
      }),
    },
    {
      id: "due_today",
      label: "Due Today",
      query: () => SavedViewQuerySchema.parse({
        filters: [{ field: "dueDate", op: "eq", value: todayIso }],
        facets: {},
      }),
    },
    {
      id: "overdue",
      label: "Overdue",
      query: () => SavedViewQuerySchema.parse({
        filters: [
          { field: "dueDate", op: "lt", value: todayIso },
          { field: "status", op: "nin", value: ["done", "cancelled"] },
        ],
        facets: {},
      }),
    },
    {
      id: "unassigned",
      label: "Unassigned",
      query: () => SavedViewQuerySchema.parse({
        filters: [{ field: "assigneeId", op: "is_empty" }],
        facets: {},
      }),
    },
    {
      id: "blocked",
      label: "Blocked",
      query: () => SavedViewQuerySchema.parse({
        // Blocked tasks have a blocking relationship — filter by dependencies
        filters: [{ field: "custom_fields.blocked", op: "is_not_empty" }],
        facets: {},
      }),
    },
  ];

  function selectPreset(preset: typeof PRESETS[0]) {
    if (activePreset === preset.id) {
      // Deselect
      activePreset = null;
      dispatch("filterChange", { query: SavedViewQuerySchema.parse({}), preset: null });
    } else {
      activePreset = preset.id;
      dispatch("filterChange", { query: preset.query(), preset: preset.id });
    }
  }

  function handleIncludeArchivedChange(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    includeArchived = checked;
    dispatch("includeArchivedChange", checked);
  }

  function handleExport() {
    const current = PRESETS.find((p) => p.id === activePreset);
    dispatch("export", current ? current.query() : SavedViewQuerySchema.parse({}));
  }
</script>

<div class="quick-filters flex flex-col gap-1 p-2">
  <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-1">
    Quick Filters
  </div>

  {#each PRESETS as preset}
    <Button
      variant={activePreset === preset.id ? "secondary" : "ghost"}
      size="sm"
      class="justify-start h-8 text-sm font-normal"
      on:click={() => selectPreset(preset)}
    >
      {preset.label}
    </Button>
  {/each}

  <div class="mt-2 px-2 space-y-2">
    <!-- Include archived toggle -->
    <label class="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
      <input
        type="checkbox"
        class="h-3.5 w-3.5 rounded"
        checked={includeArchived}
        on:change={handleIncludeArchivedChange}
      />
      Include archived
    </label>

    <!-- Export button -->
    <Button variant="outline" size="sm" class="w-full h-7 text-xs" on:click={handleExport}>
      Export
    </Button>
  </div>
</div>
