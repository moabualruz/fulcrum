<script lang="ts">
  import { cn } from "$lib/utils.js";

  type LabelStatus = "active" | "archived";

  interface ProjectLabel {
    id: string;
    name: string;
    parentId: string | null;
    color: string;
    status: LabelStatus;
  }

  const COLORS = [
    "oklch(0.72 0.16 250)",
    "oklch(0.68 0.18 30)",
    "oklch(0.72 0.16 145)",
    "oklch(0.74 0.14 70)",
    "oklch(0.66 0.18 305)",
  ];

  let labels = $state<ProjectLabel[]>([
    { id: "lbl_bug", name: "bug", parentId: null, color: COLORS[1], status: "active" },
    { id: "lbl_bug_p1", name: "p1", parentId: "lbl_bug", color: COLORS[1], status: "active" },
    { id: "lbl_design", name: "design", parentId: null, color: COLORS[0], status: "active" },
    { id: "lbl_legacy", name: "legacy-flag", parentId: null, color: COLORS[3], status: "archived" },
  ]);

  let newName = $state("");
  let newParent = $state<string>("");
  let newColor = $state(COLORS[0]);
  let renameTarget = $state<string | null>(null);
  let renameDraft = $state("");
  let error = $state<string | null>(null);

  function topLevel(): ProjectLabel[] {
    return labels.filter((label) => label.parentId === null);
  }

  function addLabel(event: Event): void {
    event.preventDefault();
    const name = newName.trim();
    if (!name) { error = "Label name is required."; return; }
    if (labels.some((label) => label.name === name && label.parentId === (newParent || null))) {
      error = "Label with that name already exists at this level.";
      return;
    }
    labels = [
      ...labels,
      {
        id: `lbl_${Math.random().toString(36).slice(2, 8)}`,
        name,
        parentId: newParent || null,
        color: newColor,
        status: "active",
      },
    ];
    newName = "";
    newParent = "";
    newColor = COLORS[0];
    error = null;
  }

  function startRename(label: ProjectLabel): void {
    renameTarget = label.id;
    renameDraft = label.name;
  }

  function commitRename(): void {
    if (!renameTarget) return;
    labels = labels.map((label) => label.id === renameTarget
      ? { ...label, name: renameDraft.trim() || label.name }
      : label);
    renameTarget = null;
    renameDraft = "";
  }

  function cancelRename(): void {
    renameTarget = null;
    renameDraft = "";
  }

  function archiveLabel(id: string): void {
    labels = labels.map((label) => label.id === id ? { ...label, status: "archived" } : label);
  }

  function restoreLabel(id: string): void {
    labels = labels.map((label) => label.id === id ? { ...label, status: "active" } : label);
  }

  function deleteLabel(id: string): void {
    const target = labels.find((label) => label.id === id);
    if (!target || target.status !== "archived") return;
    labels = labels.filter((label) => label.id !== id && label.parentId !== id);
  }

  type StartDay = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

  let cycleDuration = $state<number>(14);
  let autoCreate = $state(true);
  let namingPattern = $state("Sprint {n}");
  let cycleStartDay = $state<StartDay>("monday");
  let cycleSaved = $state(false);
  let cycleError = $state<string | null>(null);

  const START_DAYS: StartDay[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  function saveCycle(event: Event): void {
    event.preventDefault();
    if (!Number.isInteger(cycleDuration) || cycleDuration < 1 || cycleDuration > 90) {
      cycleError = "Cycle duration must be an integer between 1 and 90 days.";
      cycleSaved = false;
      return;
    }
    if (!namingPattern.includes("{n}")) {
      cycleError = "Naming pattern must include the {n} placeholder.";
      cycleSaved = false;
      return;
    }
    cycleError = null;
    cycleSaved = true;
  }

  const TIMEZONES = [
    "UTC",
    "America/Los_Angeles",
    "America/New_York",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Singapore",
    "Australia/Sydney",
  ];

  let workspaceName = $state("Fulcrum HQ");
  let workspaceSlug = $state("fulcrum-hq");
  let workspaceTimezone = $state("UTC");
  let logoName = $state<string | null>(null);
  let workspaceSaved = $state(false);
  let workspaceError = $state<string | null>(null);

  function onLogoChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0] ?? null;
    if (!file) { logoName = null; return; }
    if (file.size > 2 * 1024 * 1024) {
      workspaceError = "Logo exceeds 2 MB upload limit.";
      logoName = null;
      if (target) target.value = "";
      return;
    }
    logoName = file.name;
    workspaceError = null;
  }

  function deleteLogo(): void {
    logoName = null;
  }

  function saveWorkspace(event: Event): void {
    event.preventDefault();
    if (!workspaceName.trim()) {
      workspaceError = "Workspace name is required.";
      workspaceSaved = false;
      return;
    }
    workspaceError = null;
    workspaceSaved = true;
  }
</script>

<svelte:head>
  <title>Project · Labels | Fulcrum</title>
</svelte:head>

<section data-project-settings class="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-1 border-b border-border pb-3">
    <h1 data-project-settings-header class="text-2xl font-semibold tracking-tight">Labels</h1>
    <p class="text-sm text-muted-foreground">Manage label taxonomy with hierarchical grouping.</p>
  </header>

  <section data-workspace-general class="flex flex-col gap-3 rounded-md border border-border p-4">
    <header>
      <h2 class="text-base font-medium">Workspace</h2>
      <p class="text-xs text-muted-foreground">Configure workspace identity, URL slug (locked after creation), logo, and timezone.</p>
    </header>
    <form
      data-workspace-form
      class="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onsubmit={saveWorkspace}
    >
      <label class="flex flex-col gap-1 text-sm">
        Workspace name
        <input
          type="text"
          data-workspace-name
          bind:value={workspaceName}
          aria-required="true"
          class="h-9 rounded-md border border-input bg-background px-2"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        URL slug
        <input
          type="text"
          data-workspace-slug
          value={workspaceSlug}
          readonly
          class="h-9 rounded-md border border-input bg-muted px-2 font-mono"
          aria-readonly="true"
        />
        <span class="text-xs text-muted-foreground">Slug is locked after workspace creation.</span>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Timezone
        <select
          data-workspace-timezone
          bind:value={workspaceTimezone}
          class="h-9 rounded-md border border-input bg-background px-2"
        >
          {#each TIMEZONES as tz (tz)}
            <option value={tz}>{tz}</option>
          {/each}
        </select>
      </label>
      <div class="flex flex-col gap-1 text-sm">
        Logo (max 2 MB)
        <input
          type="file"
          data-workspace-logo
          accept="image/png,image/jpeg,image/svg+xml"
          onchange={onLogoChange}
          class="h-9 rounded-md border border-input bg-background px-2 text-xs"
        />
        {#if logoName}
          <div class="flex items-center gap-2 text-xs">
            <span data-workspace-logo-name>{logoName}</span>
            <button
              type="button"
              data-workspace-logo-delete
              class="rounded border border-destructive/40 px-2 py-0.5 text-destructive"
              onclick={deleteLogo}
            >Remove</button>
          </div>
        {/if}
      </div>
      <div class="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          data-workspace-save
          class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >Save workspace</button>
        {#if workspaceSaved && !workspaceError}
          <span data-workspace-saved class="text-sm text-green-600">Workspace settings saved.</span>
        {/if}
        {#if workspaceError}
          <span data-workspace-error class="text-sm text-destructive">{workspaceError}</span>
        {/if}
      </div>
    </form>
  </section>

  <form data-label-create-form class="flex flex-wrap items-end gap-3 rounded-md border border-border p-4" onsubmit={addLabel}>
    <label class="flex min-w-40 flex-1 flex-col gap-1 text-sm">
      Name
      <input
        type="text"
        data-label-name-input
        bind:value={newName}
        class="h-9 rounded-md border border-input bg-background px-2"
      />
    </label>
    <label class="flex min-w-40 flex-col gap-1 text-sm">
      Parent
      <select
        data-label-parent-select
        bind:value={newParent}
        class="h-9 rounded-md border border-input bg-background px-2"
      >
        <option value="">No parent</option>
        {#each topLevel() as parent (parent.id)}
          <option value={parent.id}>{parent.name}</option>
        {/each}
      </select>
    </label>
    <fieldset class="flex flex-col gap-1 text-sm">
      <legend>Color</legend>
      <div class="flex items-center gap-2">
        {#each COLORS as color (color)}
          <label class="inline-flex items-center gap-1">
            <input
              type="radio"
              name="color"
              data-label-color-option={color}
              value={color}
              bind:group={newColor}
              class="sr-only"
            />
            <span
              data-color-swatch={color}
              aria-checked={newColor === color}
              class={cn(
                "inline-block h-5 w-5 rounded-full border",
                newColor === color ? "ring-2 ring-primary" : "border-border",
              )}
              style={`background-color: ${color}`}
            ></span>
          </label>
        {/each}
      </div>
    </fieldset>
    <button
      type="submit"
      data-add-label
      class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
    >Add label</button>
    {#if error}
      <span data-label-create-error class="basis-full text-sm text-destructive">{error}</span>
    {/if}
  </form>

  <section data-label-list class="flex flex-col gap-3 rounded-md border border-border p-4">
    <h2 class="text-base font-medium">Active</h2>
    <ul class="flex flex-col gap-2">
      {#each labels.filter((label) => label.status === "active" && label.parentId === null) as label (label.id)}
        {@const children = labels.filter((child) => child.parentId === label.id && child.status === "active")}
        <li data-label-row={label.id} class="flex flex-col gap-1 rounded border border-border p-2">
          <div class="flex items-center gap-2">
            <span
              data-label-color={label.id}
              class="inline-block h-3 w-3 rounded-full"
              style={`background-color: ${label.color}`}
            ></span>
            {#if renameTarget === label.id}
              <input
                type="text"
                data-rename-input={label.id}
                bind:value={renameDraft}
                class="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
              />
              <button type="button" data-rename-commit={label.id} class="h-8 rounded-md bg-primary px-2 text-xs text-primary-foreground" onclick={commitRename}>Save</button>
              <button type="button" data-rename-cancel={label.id} class="h-8 rounded-md border border-border px-2 text-xs" onclick={cancelRename}>Cancel</button>
            {:else}
              <span data-label-name={label.id} class="font-medium">{label.name}</span>
              <div class="ml-auto flex gap-1">
                <button type="button" data-label-rename={label.id} class="rounded border border-border px-2 py-0.5 text-xs" onclick={() => startRename(label)}>Rename</button>
                <button type="button" data-label-archive={label.id} class="rounded border border-border px-2 py-0.5 text-xs" onclick={() => archiveLabel(label.id)}>Archive</button>
              </div>
            {/if}
          </div>
          {#if children.length > 0}
            <ul data-label-children={label.id} class="ml-6 flex flex-col gap-1">
              {#each children as child (child.id)}
                <li data-label-child={child.id} class="flex items-center gap-2 text-sm">
                  <span data-label-color={child.id} class="inline-block h-2 w-2 rounded-full" style={`background-color: ${child.color}`}></span>
                  <span data-label-name={child.id}>{child.name}</span>
                  <div class="ml-auto flex gap-1">
                    <button type="button" data-label-rename={child.id} class="rounded border border-border px-2 py-0.5 text-xs" onclick={() => startRename(child)}>Rename</button>
                    <button type="button" data-label-archive={child.id} class="rounded border border-border px-2 py-0.5 text-xs" onclick={() => archiveLabel(child.id)}>Archive</button>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <section data-cycle-settings class="flex flex-col gap-3 rounded-md border border-border p-4">
    <header>
      <h2 class="text-base font-medium">Cycles</h2>
      <p class="text-xs text-muted-foreground">Configure sprint duration, auto-creation, naming pattern, and start day.</p>
    </header>
    <form data-cycle-form class="grid grid-cols-1 gap-3 sm:grid-cols-2" onsubmit={saveCycle}>
      <label class="flex flex-col gap-1 text-sm">
        Cycle duration (days)
        <input
          type="number"
          data-cycle-duration
          min="1"
          max="90"
          bind:value={cycleDuration}
          class="h-9 rounded-md border border-input bg-background px-2"
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Start day
        <select
          data-cycle-start-day
          bind:value={cycleStartDay}
          class="h-9 rounded-md border border-input bg-background px-2 capitalize"
        >
          {#each START_DAYS as day (day)}
            <option value={day}>{day}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm sm:col-span-2">
        Naming pattern
        <input
          type="text"
          data-cycle-naming-pattern
          bind:value={namingPattern}
          class="h-9 rounded-md border border-input bg-background px-2 font-mono"
        />
        <span class="text-xs text-muted-foreground">Use {`{n}`} as the cycle sequence number placeholder.</span>
      </label>
      <label class="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          data-cycle-auto-create
          bind:checked={autoCreate}
        />
        Auto-create next cycle when current cycle ends
      </label>
      <div class="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          data-cycle-save
          class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >Save cycle settings</button>
        {#if cycleSaved && !cycleError}
          <span data-cycle-saved class="text-sm text-green-600">Cycle settings saved.</span>
        {/if}
        {#if cycleError}
          <span data-cycle-error class="text-sm text-destructive">{cycleError}</span>
        {/if}
      </div>
    </form>
  </section>

  <section data-label-archived class="flex flex-col gap-3 rounded-md border border-border p-4">
    <h2 class="text-base font-medium">Archived</h2>
    {#if labels.some((label) => label.status === "archived")}
      <ul class="flex flex-col gap-1">
        {#each labels.filter((label) => label.status === "archived") as label (label.id)}
          <li data-label-archived-row={label.id} class="flex items-center gap-2 text-sm">
            <span class="inline-block h-3 w-3 rounded-full" style={`background-color: ${label.color}`}></span>
            <span>{label.name}</span>
            <div class="ml-auto flex gap-1">
              <button type="button" data-label-restore={label.id} class="rounded border border-border px-2 py-0.5 text-xs" onclick={() => restoreLabel(label.id)}>Restore</button>
              <button type="button" data-label-delete={label.id} class="rounded border border-destructive/40 px-2 py-0.5 text-xs text-destructive" onclick={() => deleteLabel(label.id)}>Delete</button>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-xs text-muted-foreground">No archived labels.</p>
    {/if}
  </section>
</section>
