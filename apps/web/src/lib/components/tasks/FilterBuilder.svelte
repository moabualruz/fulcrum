<script lang="ts">
  /**
   * FilterBuilder: chip-based filter UI (Linear-style).
   */
  import { createEventDispatcher } from "svelte";
  import type { SavedViewQuery, FilterClause, FilterOp } from "@work-management/interface/saved-view-filters.ts";
  import { SavedViewQuerySchema } from "@work-management/interface/saved-view-filters.ts";

  import { Popover, PopoverTrigger, PopoverContent } from "@fulcrum/ui-kit";
  import { Button } from "@fulcrum/ui-kit";
  import { Badge } from "@fulcrum/ui-kit";
  import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@fulcrum/ui-kit";
  import { Input } from "@fulcrum/ui-kit";

  // ── Props ──────────────────────────────────────────────────────────
  interface Props {
    currentUserId?: string;
    customFieldDefs?: Array<{
      id: string;
      name: string;
      fieldType: string;
      config?: Record<string, unknown>;
    }>;
    initialQuery?: SavedViewQuery;
    includeArchived?: boolean;
  }

  let {
    currentUserId = "",
    customFieldDefs = [],
    initialQuery = { filters: [], text: "", facets: {} },
    includeArchived = false,
  }: Props = $props();

  const dispatch = createEventDispatcher<{
    filterChange: SavedViewQuery;
    export: SavedViewQuery;
  }>();

  // ── Priority levels ─────────────────────────────────────────
  const PRIORITY_LEVELS = [
    { value: "0", label: "Urgent" },
    { value: "1", label: "High" },
    { value: "2", label: "Medium" },
    { value: "3", label: "Low" },
    { value: "4", label: "No Priority" },
  ];

  // ── Field definitions ──────────────────────────────────────────────
  type FieldDef = {
    key: string;
    label: string;
    type: "text" | "number" | "date" | "select" | "multi_select" | "boolean";
    options?: Array<{ value: string; label: string }>;
    customFieldId?: string;
  };

  const BUILT_IN_FIELDS: FieldDef[] = [
    { key: "status", label: "Status", type: "select", options: [
      { value: "backlog", label: "Backlog" },
      { value: "todo", label: "To Do" },
      { value: "in_progress", label: "In Progress" },
      { value: "done", label: "Done" },
      { value: "cancelled", label: "Cancelled" },
    ]},
    { key: "priority", label: "Priority", type: "select", options: PRIORITY_LEVELS },
    { key: "assigneeId", label: "Assignee", type: "text" },
    { key: "labels", label: "Label", type: "text" },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "sprint", label: "Sprint", type: "text" },
    { key: "title", label: "Title", type: "text" },
  ];

  const allFields = $derived([
    ...BUILT_IN_FIELDS,
    ...customFieldDefs.map((cf) => ({
      key: `custom_fields.${cf.id}`,
      label: cf.name,
      type: mapCustomFieldType(cf.fieldType),
      customFieldId: cf.id,
      options: getCustomFieldOptions(cf),
    } as FieldDef)),
  ]);

  function mapCustomFieldType(type: string): FieldDef["type"] {
    switch (type) {
      case "select": return "select";
      case "multi_select": return "multi_select";
      case "number": return "number";
      case "date": return "date";
      case "boolean": return "boolean";
      default: return "text";
    }
  }

  function getCustomFieldOptions(cf: typeof customFieldDefs[0]): Array<{ value: string; label: string }> | undefined {
    if (cf.fieldType === "select" || cf.fieldType === "multi_select") {
      const opts = (cf.config as any)?.options;
      if (Array.isArray(opts)) return opts.map((o: any) => ({ value: o.value, label: o.label }));
    }
    return undefined;
  }

  // ── Operators per type ─────────────────────────────────────────────
  type OpDef = { value: FilterOp; label: string };

  function getOperators(type: FieldDef["type"]): OpDef[] {
    switch (type) {
      case "text":
        return [
          { value: "contains", label: "contains" },
          { value: "eq", label: "equals" },
          { value: "neq", label: "not equals" },
          { value: "is_empty", label: "is empty" },
          { value: "is_not_empty", label: "is not empty" },
        ];
      case "number":
        return [
          { value: "eq", label: "equals" },
          { value: "neq", label: "not equals" },
          { value: "gt", label: "greater than" },
          { value: "lt", label: "less than" },
          { value: "is_empty", label: "is empty" },
          { value: "is_not_empty", label: "is not empty" },
        ];
      case "date":
        return [
          { value: "lt", label: "before" },
          { value: "gt", label: "after" },
          { value: "eq", label: "on" },
          { value: "is_empty", label: "is empty" },
          { value: "is_not_empty", label: "is not empty" },
        ];
      case "select":
      case "multi_select":
      case "boolean":
        return [
          { value: "in", label: "is" },
          { value: "nin", label: "is not" },
          { value: "is_empty", label: "is empty" },
          { value: "is_not_empty", label: "is not empty" },
        ];
    }
  }

  // ── State ──────────────────────────────────────────────────────────
  let activeFilters: FilterClause[] = [...(initialQuery.filters ?? [])];
  let combinator: "and" | "or" = "and";
  let addFilterOpen = false;

  // New filter being built
  let newFieldKey: string = "";
  let newOp: FilterOp = "eq";
  let newValue: string = "";

  const selectedFieldDef = $derived(allFields.find((f) => f.key === newFieldKey));
  const availableOps = $derived(selectedFieldDef ? getOperators(selectedFieldDef.type) : []);

  function addFilter() {
    if (!newFieldKey || !newOp) return;
    const hasValue = newOp !== "is_empty" && newOp !== "is_not_empty";
    const clause: FilterClause = {
      field: newFieldKey,
      op: newOp,
      value: hasValue ? parseValue(newValue, selectedFieldDef?.type) : undefined,
    };
    activeFilters = [...activeFilters, clause];
    // reset
    newFieldKey = "";
    newOp = "eq";
    newValue = "";
    addFilterOpen = false;
    emitChange();
  }

  function removeFilter(index: number) {
    activeFilters = activeFilters.filter((_, i) => i !== index);
    emitChange();
  }

  function parseValue(raw: string, type?: FieldDef["type"]): unknown {
    if (type === "number") return Number(raw);
    if (type === "date") return raw; // ISO string
    if (type === "select" || type === "multi_select") return raw.split(",").map((s) => s.trim()).filter(Boolean);
    return raw;
  }

  function emitChange() {
    const query = SavedViewQuerySchema.parse({
      filters: activeFilters,
      text: "",
      facets: {},
    });
    dispatch("filterChange", query);
  }

  function handleExport() {
    const query = SavedViewQuerySchema.parse({
      filters: activeFilters,
      text: "",
      facets: {},
    });
    dispatch("export", query);
  }

  function toggleIncludeArchived() {
    includeArchived = !includeArchived;
    emitChange();
  }

  function chipLabel(clause: FilterClause): string {
    const field = allFields.find((f) => f.key === clause.field);
    const fieldLabel = field?.label ?? clause.field;
    const opLabel = getOperators(field?.type ?? "text").find((o) => o.value === clause.op)?.label ?? clause.op;
    const val = clause.value !== undefined ? String(clause.value) : "";
    return `${fieldLabel} ${opLabel}${val ? ` "${val}"` : ""}`;
  }
</script>

<div class="filter-builder flex flex-wrap items-center gap-2 p-2 border rounded-md bg-background">
  <!-- Active filter chips -->
  {#each activeFilters as clause, i}
    {#if i > 0}
      <span class="text-xs text-muted-foreground font-medium uppercase">{combinator}</span>
    {/if}
    <Badge variant="secondary" class="flex items-center gap-1 pr-1">
      <span class="text-xs">{chipLabel(clause)}</span>
      <button
        type="button"
        class="ml-1 rounded-full hover:bg-muted p-0.5"
        aria-label="Remove filter"
        on:click={() => removeFilter(i)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>
    </Badge>
  {/each}

  <!-- AND/OR combinator toggle (shown only when >1 filter) -->
  {#if activeFilters.length > 1}
    <Button
      variant="ghost"
      size="sm"
      class="h-6 px-2 text-xs"
      on:click={() => { combinator = combinator === "and" ? "or" : "and"; emitChange(); }}
    >
      {combinator === "and" ? "AND" : "OR"}
    </Button>
  {/if}

  <!-- Add filter popover -->
  <Popover bind:open={addFilterOpen}>
    <PopoverTrigger asChild let:builder>
      <Button builders={[builder]} variant="secondary" size="sm" class="h-7 gap-1 text-xs">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
        </svg>
        Add filter
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-80 p-4 space-y-3">
      <!-- Field picker -->
      <div class="space-y-1">
        <label class="text-xs font-medium text-muted-foreground">Field</label>
        <Select
          onSelectedChange={(v) => {
            newFieldKey = v?.value ?? "";
            newOp = getOperators(allFields.find((f) => f.key === newFieldKey)?.type ?? "text")[0]?.value ?? "eq";
          }}
        >
          <SelectTrigger class="w-full h-8 text-xs">
            <SelectValue placeholder="Select field..." />
          </SelectTrigger>
          <SelectContent>
            {#each allFields as field}
              <SelectItem value={field.key} label={field.label}>{field.label}</SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </div>

      <!-- Operator picker -->
      {#if selectedFieldDef}
        <div class="space-y-1">
          <label class="text-xs font-medium text-muted-foreground">Operator</label>
          <Select
            onSelectedChange={(v) => { newOp = (v?.value ?? "eq") as FilterOp; }}
          >
            <SelectTrigger class="w-full h-8 text-xs">
              <SelectValue placeholder="Select operator..." />
            </SelectTrigger>
            <SelectContent>
              {#each availableOps as op}
                <SelectItem value={op.value} label={op.label}>{op.label}</SelectItem>
              {/each}
            </SelectContent>
          </Select>
        </div>

        <!-- Value input (type-aware) -->
        {#if newOp !== "is_empty" && newOp !== "is_not_empty"}
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground">Value</label>
            {#if selectedFieldDef.type === "date"}
              <Input type="date" bind:value={newValue} class="h-8 text-xs" />
            {:else if selectedFieldDef.options}
              <Select onSelectedChange={(v) => { newValue = v?.value ?? ""; }}>
                <SelectTrigger class="w-full h-8 text-xs">
                  <SelectValue placeholder="Select value..." />
                </SelectTrigger>
                <SelectContent>
                  {#each selectedFieldDef.options as opt}
                    <SelectItem value={opt.value} label={opt.label}>{opt.label}</SelectItem>
                  {/each}
                </SelectContent>
              </Select>
            {:else if selectedFieldDef.type === "number"}
              <Input type="number" bind:value={newValue} class="h-8 text-xs" placeholder="Enter number..." />
            {:else}
              <Input type="text" bind:value={newValue} class="h-8 text-xs" placeholder="Enter value..." />
            {/if}
          </div>
        {/if}
      {/if}

      <Button size="sm" class="w-full" on:click={addFilter} disabled={!newFieldKey}>
        Apply filter
      </Button>
    </PopoverContent>
  </Popover>

  <!-- Spacer -->
  <div class="flex-1" />

  <!-- Include archived toggle -->
  <label class="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
    <input
      type="checkbox"
      class="h-3.5 w-3.5 rounded"
      checked={includeArchived}
      on:change={toggleIncludeArchived}
    />
    Include archived
  </label>

  <!-- Export button -->
  <Button variant="secondary" size="sm" class="h-7 text-xs" on:click={handleExport}>
    Export
  </Button>
</div>
