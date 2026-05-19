<script lang="ts">
  import { cn } from "$lib/utils.js";

  type LogicMode = "and" | "or";

  interface TaskRow {
    id: string;
    key: string;
    title: string;
    state: string;
    assignee: string;
    labels: string[];
    priority: string;
    dueDate: string;
    cycle: string;
    module: string;
    customFields: {
      severity: string;
      customer: string;
    };
  }

  interface FilterState {
    state: string;
    assignee: string;
    labels: string[];
    priority: string;
    dueDate: string;
    cycle: string;
    module: string;
    severity: string;
    customer: string;
  }

  interface SavedFilterView {
    id: string;
    name: string;
    filters: FilterState;
    logic: LogicMode;
  }

  const EMPTY_FILTERS: FilterState = {
    state: "",
    assignee: "",
    labels: [],
    priority: "",
    dueDate: "",
    cycle: "",
    module: "",
    severity: "",
    customer: "",
  };

  const TASKS: TaskRow[] = [
    {
      id: "task-1",
      key: "FUL-127",
      title: "Wire saved-view filter persistence",
      state: "In Progress",
      assignee: "Maya",
      labels: ["bug", "backend"],
      priority: "High",
      dueDate: "2026-05-22",
      cycle: "Cycle 14",
      module: "Views",
      customFields: { severity: "S1", customer: "Acme" },
    },
    {
      id: "task-2",
      key: "FUL-128",
      title: "Review label picker keyboard state",
      state: "Todo",
      assignee: "Omar",
      labels: ["ux", "frontend"],
      priority: "Medium",
      dueDate: "2026-05-28",
      cycle: "Cycle 14",
      module: "Filters",
      customFields: { severity: "S2", customer: "Northstar" },
    },
    {
      id: "task-3",
      key: "FUL-129",
      title: "Close stale custom-field query gap",
      state: "Blocked",
      assignee: "Ada",
      labels: ["bug", "custom-field"],
      priority: "Urgent",
      dueDate: "2026-05-19",
      cycle: "Cycle 13",
      module: "Fields",
      customFields: { severity: "S1", customer: "Acme" },
    },
    {
      id: "task-4",
      key: "FUL-130",
      title: "Ship filtered board snapshot",
      state: "Done",
      assignee: "Maya",
      labels: ["release"],
      priority: "Low",
      dueDate: "2026-06-03",
      cycle: "Cycle 15",
      module: "Views",
      customFields: { severity: "S3", customer: "Internal" },
    },
  ];

  const STATES = ["Todo", "In Progress", "Blocked", "Done"];
  const ASSIGNEES = ["Ada", "Maya", "Omar"];
  const LABELS = ["backend", "bug", "custom-field", "frontend", "release", "ux"];
  const PRIORITIES = ["Urgent", "High", "Medium", "Low"];
  const CYCLES = ["Cycle 13", "Cycle 14", "Cycle 15"];
  const MODULES = ["Fields", "Filters", "Views"];
  const SEVERITIES = ["S1", "S2", "S3"];
  const CUSTOMERS = ["Acme", "Internal", "Northstar"];

  let logic = $state<LogicMode>("and");
  let filters = $state<FilterState>({
    ...EMPTY_FILTERS,
    state: "In Progress",
    assignee: "Maya",
    labels: ["bug"],
  });
  let assigneeSearch = $state("");
  let labelSearch = $state("");
  let viewName = $state("Sprint triage");
  let activeViewId = $state("default");
  let editingViewId = $state<string | null>(null);
  let savedViews = $state<SavedFilterView[]>([
    {
      id: "default",
      name: "Bugs in flight",
      logic: "and",
      filters: {
        ...EMPTY_FILTERS,
        state: "In Progress",
        assignee: "Maya",
        labels: ["bug"],
      },
    },
  ]);

  const filteredAssignees = $derived(ASSIGNEES.filter((assignee) =>
    assignee.toLowerCase().includes(assigneeSearch.toLowerCase()),
  ));
  const filteredLabels = $derived(LABELS.filter((label) =>
    label.toLowerCase().includes(labelSearch.toLowerCase()),
  ));
  const activeFilterCount = $derived(countActiveFilters(filters));
  const filteredTasks = $derived(TASKS.filter((task) => matchesFilters(task, filters, logic)));

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]): void {
    filters = { ...filters, [key]: value };
  }

  function toggleLabel(label: string): void {
    const labels = filters.labels.includes(label)
      ? filters.labels.filter((item) => item !== label)
      : [...filters.labels, label];
    updateFilter("labels", labels);
  }

  function clearFilters(): void {
    filters = { ...EMPTY_FILTERS };
    logic = "and";
    activeViewId = "";
  }

  function saveCurrentView(): void {
    const id = `view-${viewName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "filtered"}`;
    const next = {
      id,
      name: viewName || "Filtered view",
      filters: cloneFilters(filters),
      logic,
    };
    savedViews = [...savedViews.filter((view) => view.id !== id), next];
    activeViewId = id;
    editingViewId = null;
  }

  function applyView(view: SavedFilterView): void {
    filters = cloneFilters(view.filters);
    logic = view.logic;
    activeViewId = view.id;
  }

  function editView(view: SavedFilterView): void {
    applyView(view);
    viewName = view.name;
    editingViewId = view.id;
  }

  function deleteView(id: string): void {
    savedViews = savedViews.filter((view) => view.id !== id);
    if (activeViewId === id) activeViewId = "";
    if (editingViewId === id) editingViewId = null;
  }

  function cloneFilters(value: FilterState): FilterState {
    return { ...value, labels: [...value.labels] };
  }

  function countActiveFilters(value: FilterState): number {
    return Object.entries(value).filter(([, filterValue]) =>
      Array.isArray(filterValue) ? filterValue.length > 0 : filterValue !== "",
    ).length;
  }

  function matchesFilters(task: TaskRow, value: FilterState, mode: LogicMode): boolean {
    const checks = [
      value.state ? task.state === value.state : null,
      value.assignee ? task.assignee === value.assignee : null,
      value.labels.length > 0 ? value.labels.every((label) => task.labels.includes(label)) : null,
      value.priority ? task.priority === value.priority : null,
      value.dueDate ? task.dueDate <= value.dueDate : null,
      value.cycle ? task.cycle === value.cycle : null,
      value.module ? task.module === value.module : null,
      value.severity ? task.customFields.severity === value.severity : null,
      value.customer ? task.customFields.customer === value.customer : null,
    ].filter((check): check is boolean => check !== null);
    if (checks.length === 0) return true;
    return mode === "and" ? checks.every(Boolean) : checks.some(Boolean);
  }
</script>

<svelte:head>
  <title>Task filters</title>
</svelte:head>

<main data-task-filters-page class={cn("min-h-screen bg-background text-foreground")}>
  <div class={cn("mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 lg:px-6")}>
    <header data-task-filters-header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
      <div>
        <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Views</p>
        <h1 class={cn("text-2xl font-semibold tracking-normal")}>Task filters</h1>
      </div>
      <div class={cn("flex items-center gap-2")}>
        <span data-filter-count-badge class={cn("rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium")}>{activeFilterCount} filters</span>
        <span data-result-count class={cn("rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium")}>{filteredTasks.length} tasks</span>
      </div>
    </header>

    <div class={cn("grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]")}>
      <aside data-persistent-filter-panel class={cn("space-y-4 rounded-md border border-border bg-card p-3 lg:sticky lg:top-4 lg:self-start")}>
        <div class={cn("flex items-center justify-between gap-2")}>
          <h2 class={cn("text-sm font-semibold")}>Filters</h2>
          <button data-clear-filters type="button" onclick={clearFilters} class={cn("h-8 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent")}>Clear</button>
        </div>

        <div data-filter-logic class={cn("grid grid-cols-2 rounded-md border border-border bg-muted p-1")}>
          {#each ["and", "or"] as mode}
            <button
              type="button"
              data-logic-mode={mode}
              aria-pressed={logic === mode}
              onclick={() => (logic = mode as LogicMode)}
              class={cn("h-8 rounded-sm text-xs font-medium", logic === mode ? "bg-background shadow-xs" : "text-muted-foreground")}
            >{mode.toUpperCase()}</button>
          {/each}
        </div>

        <label class={cn("block text-xs font-medium text-muted-foreground")}>
          State
          <select data-filter-state bind:value={filters.state} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
            <option value="">Any state</option>
            {#each STATES as state}<option value={state}>{state}</option>{/each}
          </select>
        </label>

        <div data-filter-assignee class={cn("space-y-2")}>
          <label for="assignee-search" class={cn("block text-xs font-medium text-muted-foreground")}>Assignee</label>
          <input id="assignee-search" data-assignee-search bind:value={assigneeSearch} type="search" class={cn("h-9 w-full rounded-md border border-input bg-background px-2 text-sm")} placeholder="Search assignees" />
          <div class={cn("flex flex-wrap gap-2")}>
            {#each filteredAssignees as assignee}
              <button type="button" data-assignee-option={assignee} onclick={() => updateFilter("assignee", assignee)} class={cn("rounded-full border px-2 py-1 text-xs", filters.assignee === assignee ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")}>{assignee}</button>
            {/each}
          </div>
        </div>

        <div data-filter-labels class={cn("space-y-2")}>
          <label for="label-search" class={cn("block text-xs font-medium text-muted-foreground")}>Labels</label>
          <input id="label-search" data-label-search bind:value={labelSearch} type="search" class={cn("h-9 w-full rounded-md border border-input bg-background px-2 text-sm")} placeholder="Search labels" />
          <div class={cn("flex flex-wrap gap-2")}>
            {#each filteredLabels as label}
              <button type="button" data-label-chip={label} aria-pressed={filters.labels.includes(label)} onclick={() => toggleLabel(label)} class={cn("rounded-full border px-2 py-1 text-xs", filters.labels.includes(label) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")}>{label}</button>
            {/each}
          </div>
        </div>

        <div data-filter-priority class={cn("space-y-2")}>
          <span class={cn("block text-xs font-medium text-muted-foreground")}>Priority</span>
          <div class={cn("grid grid-cols-2 gap-2")}>
            {#each PRIORITIES as priority}
              <button type="button" data-priority-option={priority} onclick={() => updateFilter("priority", priority)} class={cn("h-8 rounded-md border text-xs", filters.priority === priority ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background")}>{priority}</button>
            {/each}
          </div>
        </div>

        <label class={cn("block text-xs font-medium text-muted-foreground")}>
          Due before
          <input data-filter-due-date bind:value={filters.dueDate} type="date" class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")} />
        </label>

        <label class={cn("block text-xs font-medium text-muted-foreground")}>
          Cycle
          <select data-filter-cycle bind:value={filters.cycle} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
            <option value="">Any cycle</option>
            {#each CYCLES as cycle}<option value={cycle}>{cycle}</option>{/each}
          </select>
        </label>

        <label class={cn("block text-xs font-medium text-muted-foreground")}>
          Module
          <select data-filter-module bind:value={filters.module} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
            <option value="">Any module</option>
            {#each MODULES as module}<option value={module}>{module}</option>{/each}
          </select>
        </label>

        <div data-filter-custom-fields class={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-1")}>
          <label class={cn("block text-xs font-medium text-muted-foreground")}>
            Severity
            <select data-filter-custom-severity bind:value={filters.severity} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
              <option value="">Any severity</option>
              {#each SEVERITIES as severity}<option value={severity}>{severity}</option>{/each}
            </select>
          </label>
          <label class={cn("block text-xs font-medium text-muted-foreground")}>
            Customer
            <select data-filter-custom-customer bind:value={filters.customer} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
              <option value="">Any customer</option>
              {#each CUSTOMERS as customer}<option value={customer}>{customer}</option>{/each}
            </select>
          </label>
        </div>
      </aside>

      <section class={cn("min-w-0 space-y-4")}>
        <div data-save-filtered-view class={cn("rounded-md border border-border bg-card p-3")}>
          <div class={cn("flex flex-wrap items-end gap-3")}>
            <label class={cn("min-w-56 flex-1 text-xs font-medium text-muted-foreground")}>
              View name
              <input data-saved-view-name bind:value={viewName} type="text" class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")} />
            </label>
            <button data-save-view type="button" onclick={saveCurrentView} class={cn("h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90")}>
              {editingViewId ? "Update view" : "Save view"}
            </button>
          </div>
          <div data-saved-filtered-views class={cn("mt-3 flex flex-wrap gap-2")}>
            {#each savedViews as view (view.id)}
              <div data-saved-view-row={view.id} class={cn("inline-flex items-center gap-1 rounded-full border px-1 py-0.5", activeViewId === view.id ? "border-primary" : "border-border")}>
                <button
                  type="button"
                  data-saved-view={view.id}
                  aria-pressed={activeViewId === view.id}
                  onclick={() => applyView(view)}
                  class={cn("rounded-full px-2 py-0.5 text-xs", activeViewId === view.id ? "bg-primary text-primary-foreground" : "bg-background")}
                >{view.name}</button>
                <button
                  type="button"
                  data-edit-view={view.id}
                  onclick={() => editView(view)}
                  class={cn("rounded-full px-1 text-[10px] text-muted-foreground hover:text-foreground")}
                  aria-label={`Edit ${view.name}`}
                >Edit</button>
                <button
                  type="button"
                  data-delete-view={view.id}
                  onclick={() => deleteView(view.id)}
                  class={cn("rounded-full px-1 text-[10px] text-destructive hover:text-destructive/80")}
                  aria-label={`Delete ${view.name}`}
                >×</button>
              </div>
            {/each}
          </div>
        </div>

        <div data-active-filter-summary class={cn("flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs")}>
          {#if filters.state}<span class={cn("rounded-full bg-background px-2 py-1")}>State: {filters.state}</span>{/if}
          {#if filters.assignee}<span class={cn("rounded-full bg-background px-2 py-1")}>Assignee: {filters.assignee}</span>{/if}
          {#each filters.labels as label}<span class={cn("rounded-full bg-background px-2 py-1")}>Label: {label}</span>{/each}
          {#if filters.priority}<span class={cn("rounded-full bg-background px-2 py-1")}>Priority: {filters.priority}</span>{/if}
          {#if filters.dueDate}<span class={cn("rounded-full bg-background px-2 py-1")}>Due: {filters.dueDate}</span>{/if}
          {#if filters.cycle}<span class={cn("rounded-full bg-background px-2 py-1")}>Cycle: {filters.cycle}</span>{/if}
          {#if filters.module}<span class={cn("rounded-full bg-background px-2 py-1")}>Module: {filters.module}</span>{/if}
          {#if filters.severity}<span class={cn("rounded-full bg-background px-2 py-1")}>Severity: {filters.severity}</span>{/if}
          {#if filters.customer}<span class={cn("rounded-full bg-background px-2 py-1")}>Customer: {filters.customer}</span>{/if}
          {#if activeFilterCount === 0}<span class={cn("text-muted-foreground")}>No filters applied</span>{/if}
        </div>

        <div data-filtered-task-list class={cn("overflow-hidden rounded-md border border-border bg-card")}>
          <div class={cn("grid grid-cols-[96px_minmax(0,1fr)_110px_110px] gap-3 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground")}>
            <span>Key</span>
            <span>Task</span>
            <span>State</span>
            <span>Due</span>
          </div>
          {#each filteredTasks as task (task.id)}
            <article data-filtered-task data-task-id={task.id} class={cn("grid grid-cols-[96px_minmax(0,1fr)_110px_110px] gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0")}>
              <span class={cn("font-mono text-xs text-muted-foreground")}>{task.key}</span>
              <div class={cn("min-w-0")}>
                <h2 class={cn("truncate font-medium")}>{task.title}</h2>
                <p class={cn("mt-1 text-xs text-muted-foreground")}>{task.assignee} · {task.priority} · {task.module}</p>
                <div class={cn("mt-2 flex flex-wrap gap-1")}>
                  {#each task.labels as label}<span class={cn("rounded-full bg-muted px-2 py-0.5 text-[11px]")}>{label}</span>{/each}
                </div>
              </div>
              <span class={cn("text-xs")}>{task.state}</span>
              <span class={cn("text-xs text-muted-foreground")}>{task.dueDate}</span>
            </article>
          {:else}
            <div data-no-filtered-tasks class={cn("p-6 text-sm text-muted-foreground")}>No tasks match the current filters.</div>
          {/each}
        </div>
      </section>
    </div>
  </div>
</main>
