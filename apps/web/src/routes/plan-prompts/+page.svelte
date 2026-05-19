<script lang="ts">
  import { Badge, Button, Chip, Input } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  type StateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

  type WorkflowState = {
    id: string;
    name: string;
    group: StateGroup;
    color: string;
    issues: number;
  };

  const groups: { id: StateGroup; label: string; purpose: string }[] = [
    { id: "backlog", label: "Backlog", purpose: "Intake states before a task is ready." },
    { id: "unstarted", label: "Unstarted", purpose: "Ready work not yet picked up." },
    { id: "started", label: "Started", purpose: "Work actively moving through agents or humans." },
    { id: "completed", label: "Completed", purpose: "Accepted work with evidence attached." },
    { id: "cancelled", label: "Cancelled", purpose: "Closed work that should not continue." },
  ];

  const palette = [
    { id: "slate", label: "Slate", className: "bg-slate-500" },
    { id: "blue", label: "Blue", className: "bg-blue-500" },
    { id: "purple", label: "Purple", className: "bg-purple-500" },
    { id: "amber", label: "Amber", className: "bg-amber-500" },
    { id: "emerald", label: "Emerald", className: "bg-emerald-500" },
    { id: "rose", label: "Rose", className: "bg-rose-500" },
  ];

  let states = $state<WorkflowState[]>([
    { id: "backlog", name: "Backlog", group: "backlog", color: "slate", issues: 12 },
    { id: "todo", name: "Todo", group: "unstarted", color: "blue", issues: 8 },
    { id: "in-progress", name: "In Progress", group: "started", color: "amber", issues: 5 },
    { id: "done", name: "Done", group: "completed", color: "emerald", issues: 19 },
    { id: "cancelled", name: "Cancelled", group: "cancelled", color: "rose", issues: 1 },
  ]);

  let selectedStateId = $state("in-progress");
  let defaultStateId = $state("todo");
  let newStateName = $state("");
  let newStateGroup = $state<StateGroup>("started");
  let validationMessage = $state("");
  let deletePromptStateId = $state<string | null>(null);
  let lastAction = $state("No edits yet");

  const selectedState = $derived(states.find((state) => state.id === selectedStateId) ?? states[0]);

  function slugify(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function statesForGroup(group: StateGroup): WorkflowState[] {
    return states.filter((state) => state.group === group);
  }

  function colorClass(color: string): string {
    return palette.find((item) => item.id === color)?.className ?? "bg-slate-500";
  }

  function createState(): void {
    const name = newStateName.trim();
    const duplicate = states.some((state) => state.name.toLowerCase() === name.toLowerCase());
    if (!name) {
      validationMessage = "Name required";
      return;
    }
    if (duplicate) {
      validationMessage = "State name already exists";
      return;
    }

    const id = slugify(name);
    states = [...states, { id, name, group: newStateGroup, color: "purple", issues: 0 }];
    selectedStateId = id;
    newStateName = "";
    validationMessage = "";
    lastAction = `Created ${name} in ${newStateGroup}`;
  }

  function updateGroup(stateId: string, group: StateGroup): void {
    states = states.map((state) => state.id === stateId ? { ...state, group } : state);
    selectedStateId = stateId;
    lastAction = `Moved ${states.find((state) => state.id === stateId)?.name ?? stateId} to ${group}`;
  }

  function updateColor(stateId: string, color: string): void {
    states = states.map((state) => state.id === stateId ? { ...state, color } : state);
    selectedStateId = stateId;
    lastAction = `Changed color to ${color}`;
  }

  function setDefault(stateId: string): void {
    defaultStateId = stateId;
    selectedStateId = stateId;
    lastAction = `Default state set to ${states.find((state) => state.id === stateId)?.name ?? stateId}`;
  }

  function reorder(stateId: string, direction: -1 | 1): void {
    const index = states.findIndex((state) => state.id === stateId);
    const state = states[index];
    if (!state) return;
    const groupIndexes = states
      .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
      .filter(({ candidate }) => candidate.group === state.group);
    const groupPosition = groupIndexes.findIndex(({ candidate }) => candidate.id === stateId);
    const swapTarget = groupIndexes[groupPosition + direction];
    if (!swapTarget) return;
    const next = [...states];
    next[index] = swapTarget.candidate;
    next[swapTarget.candidateIndex] = state;
    states = next;
    selectedStateId = stateId;
    lastAction = `Reordered ${state.name}`;
  }

  function requestDelete(stateId: string): void {
    deletePromptStateId = stateId;
    selectedStateId = stateId;
  }

  function confirmDelete(stateId: string): void {
    const target = states.find((state) => state.id === stateId);
    if (!target || target.issues > 0) return;
    states = states.filter((state) => state.id !== stateId);
    if (defaultStateId === stateId) defaultStateId = states[0]?.id ?? "";
    selectedStateId = states[0]?.id ?? "";
    deletePromptStateId = null;
    lastAction = `Deleted ${target.name}`;
  }
</script>

<svelte:head>
  <title>Project States</title>
</svelte:head>

<main data-project-states-page class={cn("mx-auto flex w-full max-w-7xl flex-col gap-4 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8")}>
  <header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
    <div class={cn("min-w-0")}>
      <p class={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground")}>Project settings</p>
      <h1 class={cn("text-2xl font-semibold tracking-normal text-foreground")}>Workflow states</h1>
      <p class={cn("mt-1 max-w-3xl text-sm text-muted-foreground")}>
        Group custom states by semantics, keep the default explicit, and block unsafe deletion while open issues still use a state.
      </p>
    </div>
    <Badge data-default-state variant="accent" size="sm">Default: {states.find((state) => state.id === defaultStateId)?.name}</Badge>
  </header>

  <section class={cn("grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]")}>
    <div class={cn("min-w-0 space-y-4")}>
      <section data-state-create-panel class={cn("rounded-md border border-border bg-card p-4")}>
        <h2 class={cn("text-base font-semibold")}>Create state</h2>
        <form class={cn("mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]")} onsubmit={(event) => { event.preventDefault(); createState(); }}>
          <label class={cn("min-w-0 text-sm font-medium")}>
            Name
            <Input data-state-name-input bind:value={newStateName} placeholder="In Code Review" class={cn("mt-1")} />
          </label>
          <label class={cn("text-sm font-medium")}>
            Group
            <select data-state-group-input bind:value={newStateGroup} class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")}>
              {#each groups as group}
                <option value={group.id}>{group.label}</option>
              {/each}
            </select>
          </label>
          <Button data-create-state type="submit" class={cn("self-end")}>Create</Button>
        </form>
        {#if validationMessage}
          <p data-state-validation role="alert" class={cn("mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive")}>{validationMessage}</p>
        {/if}
      </section>

      <section data-state-groups class={cn("grid min-w-0 gap-3")}>
        {#each groups as group}
          <article data-state-group={group.id} class={cn("min-w-0 rounded-md border border-border bg-card p-4")}>
            <div class={cn("flex flex-wrap items-center justify-between gap-2")}>
              <div class={cn("min-w-0")}>
                <h2 class={cn("text-base font-semibold")}>{group.label}</h2>
                <p class={cn("text-sm text-muted-foreground")}>{group.purpose}</p>
              </div>
              <Chip tone="neutral">{statesForGroup(group.id).length} states</Chip>
            </div>
            <div class={cn("mt-3 grid gap-2")}>
              {#each statesForGroup(group.id) as state, index (state.id)}
                <div
                  data-state-row={state.id}
                  data-state-group-row={state.group}
                  data-state-color-row={state.color}
                  data-state-default={defaultStateId === state.id}
                  class={cn("grid min-w-0 gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-[minmax(0,1fr)_8rem_10rem_auto]")}
                >
                  <button type="button" data-select-state={state.id} onclick={() => (selectedStateId = state.id)} class={cn("flex min-w-0 items-center gap-3 text-left")}>
                    <span class={cn("size-3 shrink-0 rounded-full", colorClass(state.color))}></span>
                    <span class={cn("min-w-0")}>
                      <span class={cn("block truncate text-sm font-medium")}>{state.name}</span>
                      <span data-state-usage={state.id} class={cn("text-xs text-muted-foreground")}>{state.issues} open issues</span>
                    </span>
                  </button>
                  <div class={cn("flex items-center gap-1")}>
                    <Button data-reorder-up={state.id} type="button" variant="outline" size="sm" disabled={index === 0} onclick={() => reorder(state.id, -1)}>Up</Button>
                    <Button data-reorder-down={state.id} type="button" variant="outline" size="sm" disabled={index === statesForGroup(group.id).length - 1} onclick={() => reorder(state.id, 1)}>Down</Button>
                  </div>
                  <select data-move-state={state.id} value={state.group} onchange={(event) => updateGroup(state.id, (event.currentTarget as HTMLSelectElement).value as StateGroup)} class={cn("h-9 rounded-md border border-input bg-background px-2 text-sm")}>
                    {#each groups as option}
                      <option value={option.id}>{option.label}</option>
                    {/each}
                  </select>
                  <div class={cn("flex flex-wrap gap-1")}>
                    <Button data-set-default={state.id} type="button" variant="outline" size="sm" onclick={() => setDefault(state.id)}>Default</Button>
                    <Button data-delete-state={state.id} type="button" variant="destructive" size="sm" onclick={() => requestDelete(state.id)}>Delete</Button>
                  </div>
                </div>
              {/each}
            </div>
          </article>
        {/each}
      </section>
    </div>

    <aside class={cn("min-w-0 space-y-3")}>
      <section data-state-editor class={cn("rounded-md border border-border bg-card p-4")}>
        <div class={cn("flex flex-wrap items-center justify-between gap-2")}>
          <h2 class={cn("text-base font-semibold")}>Selected state</h2>
          <Badge variant={selectedState?.issues ? "warning" : "success"} size="sm">{selectedState?.issues ?? 0} issues</Badge>
        </div>
        <p data-selected-state class={cn("mt-2 text-sm font-medium")}>{selectedState?.name}</p>
        <div data-color-picker class={cn("mt-4 grid grid-cols-3 gap-2")}>
          {#each palette as color}
            <button
              type="button"
              data-color-option={color.id}
              data-color-selected={selectedState?.color === color.id}
              onclick={() => selectedState && updateColor(selectedState.id, color.id)}
              class={cn("flex h-10 items-center gap-2 rounded-md border border-border px-2 text-xs", selectedState?.color === color.id && "border-primary")}
            >
              <span class={cn("size-3 rounded-full", color.className)}></span>
              {color.label}
            </button>
          {/each}
        </div>
      </section>

      {#if deletePromptStateId}
        {@const promptState = states.find((state) => state.id === deletePromptStateId)}
        {#if promptState}
          <div data-delete-state-prompt role="dialog" aria-labelledby="delete-state-title" class={cn("rounded-md border border-destructive/30 bg-card p-4")}>
            <h2 id="delete-state-title" class={cn("text-base font-semibold")}>Delete {promptState.name}</h2>
            <p data-delete-state-usage class={cn("mt-2 text-sm text-muted-foreground")}>{promptState.issues} open issues use this state.</p>
            {#if promptState.issues > 0}
              <p data-delete-state-warning class={cn("mt-3 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm")}>
                Move or close these issues before deleting this state.
              </p>
            {/if}
            <div class={cn("mt-3 flex flex-wrap gap-2")}>
              <Button data-cancel-delete-state type="button" variant="outline" onclick={() => (deletePromptStateId = null)}>Cancel</Button>
              <Button data-confirm-delete-state type="button" variant="destructive" disabled={promptState.issues > 0} onclick={() => confirmDelete(promptState.id)}>Delete state</Button>
            </div>
          </div>
        {/if}
      {/if}

      <section data-state-audit class={cn("rounded-md border border-border bg-muted/35 p-4")}>
        <h2 class={cn("text-base font-semibold")}>Audit trail</h2>
        <p data-state-last-action class={cn("mt-2 text-sm text-muted-foreground")}>{lastAction}</p>
      </section>
    </aside>
  </section>
</main>
