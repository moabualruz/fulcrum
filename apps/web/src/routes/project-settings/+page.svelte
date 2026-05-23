<script lang="ts">
  import { cn, Select } from "@fulcrum/ui-kit";

  type LabelStatus = "active" | "archived";

  interface ProjectLabel {
    id: string;
    name: string;
    parentId: string | null;
    color: string;
    status: LabelStatus;
    usageCount: number;
    archivedAt: string | null;
  }

  const COLORS = [
    "oklch(0.72 0.16 250)",
    "oklch(0.68 0.18 30)",
    "oklch(0.72 0.16 145)",
    "oklch(0.74 0.14 70)",
    "oklch(0.66 0.18 305)",
  ];

  let labels = $state<ProjectLabel[]>([
    { id: "lbl_bug", name: "bug", parentId: null, color: COLORS[1], status: "active", usageCount: 18, archivedAt: null },
    { id: "lbl_bug_p1", name: "p1", parentId: "lbl_bug", color: COLORS[1], status: "active", usageCount: 7, archivedAt: null },
    { id: "lbl_design", name: "design", parentId: null, color: COLORS[0], status: "active", usageCount: 11, archivedAt: null },
    { id: "lbl_legacy", name: "legacy-flag", parentId: null, color: COLORS[3], status: "archived", usageCount: 0, archivedAt: "2026-05-01" },
  ]);

  let newName = $state("");
  let newParent = $state<string>("");
  let newColor = $state(COLORS[0]);
  let renameTarget = $state<string | null>(null);
  let renameDraft = $state("");
  let error = $state<string | null>(null);
  let archiveNotice = $state<string | null>(null);
  let orderSaved = $state(false);
  let archivedSelection = $state<string[]>([]);
  let archivedBulkError = $state<string | null>(null);

  function topLevel(): ProjectLabel[] {
    return labels.filter((label) => label.parentId === null && label.status === "active");
  }

  function parentOptions(): ProjectLabel[] {
    return labels.filter((label) => label.parentId === null && label.status === "active");
  }

  function archivedLabels(): ProjectLabel[] {
    return labels.filter((label) => label.status === "archived");
  }

  function isSelectedArchived(id: string): boolean {
    return archivedSelection.includes(id);
  }

  function toggleArchivedSelection(id: string): void {
    archivedSelection = isSelectedArchived(id)
      ? archivedSelection.filter((selectedId) => selectedId !== id)
      : [...archivedSelection, id];
    archivedBulkError = null;
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
        usageCount: 0,
        archivedAt: null,
      },
    ];
    newName = "";
    newParent = "";
    newColor = COLORS[0];
    error = null;
    archiveNotice = null;
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
    const target = labels.find((label) => label.id === id);
    if (!target) return;
    const movedChildren = labels.filter((label) => label.parentId === id && label.status === "active").length;
    labels = labels.map((label) => {
      if (label.id === id) return { ...label, status: "archived", archivedAt: "2026-05-19" };
      if (label.parentId === id) return { ...label, parentId: null };
      return label;
    });
    archiveNotice = movedChildren > 0
      ? `Archived ${target.name}; ${movedChildren} child ${movedChildren === 1 ? "label" : "labels"} moved to root.`
      : `Archived ${target.name}.`;
    orderSaved = false;
  }

  function restoreLabel(id: string): void {
    labels = labels.map((label) => label.id === id ? { ...label, status: "active", archivedAt: null } : label);
    archivedSelection = archivedSelection.filter((selectedId) => selectedId !== id);
    archivedBulkError = null;
  }

  function moveLabel(id: string, direction: -1 | 1): void {
    const roots = labels.filter((label) => label.status === "active" && label.parentId === null);
    const index = roots.findIndex((label) => label.id === id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= roots.length) return;

    const reorderedRootIds = roots.map((label) => label.id);
    const [moved] = reorderedRootIds.splice(index, 1);
    reorderedRootIds.splice(targetIndex, 0, moved);
    const rootOrder = new Map(reorderedRootIds.map((labelId, order) => [labelId, order]));
    labels = [...labels].sort((a, b) => {
      const aOrder = rootOrder.get(a.id);
      const bOrder = rootOrder.get(b.id);
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
      if (aOrder !== undefined) return -1;
      if (bOrder !== undefined) return 1;
      return 0;
    });
    orderSaved = true;
  }

  function bulkDeleteArchived(): void {
    const selected = labels.filter((label) => archivedSelection.includes(label.id));
    if (selected.length === 0) return;
    const withUsage = selected.find((label) => label.usageCount > 0);
    if (withUsage) {
      archivedBulkError = `Cannot delete ${withUsage.name}; archive keeps ${withUsage.usageCount} linked uses.`;
      return;
    }
    labels = labels.filter((label) => !archivedSelection.includes(label.id));
    archivedSelection = [];
    archivedBulkError = null;
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

  type EstimateScale = "xs-xl" | "fibonacci" | "linear" | "custom";

  interface EstimateSetting {
    scale: EstimateScale;
    customValues: number[];
  }

  const SCALE_VALUES: Record<EstimateScale, number[]> = {
    "xs-xl": [1, 2, 3, 5, 8],
    fibonacci: [1, 2, 3, 5, 8, 13, 21],
    linear: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    custom: [],
  };

  let estimateScale = $state<EstimateScale>("fibonacci");
  let customScaleRaw = $state("1,2,4,8,16");
  let estimateSaved = $state(false);
  let estimateError = $state<string | null>(null);

  interface PlanTask {
    id: string;
    title: string;
    estimate: number | null;
    selected: boolean;
  }

  let planTasks = $state<PlanTask[]>([
    { id: "FUL-201", title: "Wire skill probe API", estimate: 3, selected: false },
    { id: "FUL-202", title: "Refactor outbox flush", estimate: null, selected: false },
    { id: "FUL-203", title: "Onboard mobile capture", estimate: 5, selected: false },
  ]);

  let bulkEstimate = $state<number | "">("");

  function effectiveScale(): number[] {
    if (estimateScale !== "custom") return SCALE_VALUES[estimateScale];
    return customScaleRaw
      .split(",")
      .map((piece) => Number.parseInt(piece.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);
  }

  function saveEstimate(event: Event): void {
    event.preventDefault();
    const values = effectiveScale();
    if (values.length === 0) {
      estimateError = "Provide at least one estimate value.";
      estimateSaved = false;
      return;
    }
    estimateError = null;
    estimateSaved = true;
  }

  function setTaskEstimate(id: string, value: number | null): void {
    planTasks = planTasks.map((task) => task.id === id ? { ...task, estimate: value } : task);
  }

  function toggleTaskSelection(id: string): void {
    planTasks = planTasks.map((task) => task.id === id ? { ...task, selected: !task.selected } : task);
  }

  function bulkApply(): void {
    if (bulkEstimate === "") return;
    planTasks = planTasks.map((task) => task.selected ? { ...task, estimate: Number(bulkEstimate) } : task);
  }

  function totalPoints(): number {
    return planTasks.reduce((acc, task) => acc + (task.estimate ?? 0), 0);
  }

  type ModuleCategory = "feature" | "bug" | "research" | "ops";

  interface ProjectModule {
    id: string;
    name: string;
    category: ModuleCategory;
    lead: string;
    completed: number;
    total: number;
  }

  let modulesEnabled = $state(true);
  let modules = $state<ProjectModule[]>([
    { id: "mod_payments", name: "Payments rollout", category: "feature", lead: "maya", completed: 8, total: 12 },
    { id: "mod_dx", name: "Dev experience", category: "ops", lead: "kieran", completed: 3, total: 5 },
  ]);
  let newModuleName = $state("");
  let newModuleCategory = $state<ModuleCategory>("feature");
  let newModuleLead = $state("");
  let moduleError = $state<string | null>(null);

  function addModule(event: Event): void {
    event.preventDefault();
    if (!modulesEnabled) { moduleError = "Enable modules first."; return; }
    if (!newModuleName.trim()) { moduleError = "Module name is required."; return; }
    moduleError = null;
    modules = [
      ...modules,
      {
        id: `mod_${newModuleName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        name: newModuleName.trim(),
        category: newModuleCategory,
        lead: newModuleLead.trim() || "unassigned",
        completed: 0,
        total: 0,
      },
    ];
    newModuleName = "";
    newModuleLead = "";
  }

  type AutomationRuleStatus = "enabled" | "disabled";

  interface AutomationRuleFixture {
    id: string;
    name: string;
    trigger: string;
    action: string;
    status: AutomationRuleStatus;
    project: string;
    executions: number;
  }

  let automationSearch = $state("");
  let automationRules = $state<AutomationRuleFixture[]>([
    {
      id: "rule_auto_close",
      name: "auto-close stale done tasks",
      trigger: "Status changes",
      action: "Archive after 3 months",
      status: "enabled",
      project: "Authentication rewrite",
      executions: 42,
    },
    {
      id: "rule_assign_review",
      name: "assign review owner",
      trigger: "Label added",
      action: "Set assignee to review captain",
      status: "enabled",
      project: "Authentication rewrite",
      executions: 18,
    },
    {
      id: "rule_priority_escalate",
      name: "escalate overdue blockers",
      trigger: "Due date passed",
      action: "Set priority to urgent",
      status: "disabled",
      project: "Authentication rewrite",
      executions: 6,
    },
    {
      id: "rule_comment_notify",
      name: "notify on customer comment",
      trigger: "Comment added",
      action: "Subscribe watcher",
      status: "enabled",
      project: "Docs workspace",
      executions: 27,
    },
    {
      id: "rule_ci_label",
      name: "tag CI failures",
      trigger: "Task created",
      action: "Add label ci-failure",
      status: "enabled",
      project: "Runtime reliability",
      executions: 31,
    },
  ]);
  let newAutomationName = $state("");
  let automationDeleteId = $state<string | null>(null);

  const visibleAutomationRules = $derived(automationSearch.trim()
    ? automationRules.filter((rule) => {
        const needle = automationSearch.trim().toLowerCase();
        return [rule.name, rule.trigger, rule.action, rule.status, rule.project]
          .some((value) => value.toLowerCase().includes(needle));
      })
    : automationRules);

  function toggleAutomationRule(id: string): void {
    automationRules = automationRules.map((rule) => rule.id === id
      ? { ...rule, status: rule.status === "enabled" ? "disabled" : "enabled" }
      : rule);
  }

  function requestAutomationDelete(id: string): void {
    automationDeleteId = id;
  }

  function confirmAutomationDelete(id: string): void {
    automationRules = automationRules.filter((rule) => rule.id !== id);
    automationDeleteId = null;
  }

  function createAutomationRule(event: Event): void {
    event.preventDefault();
    const name = newAutomationName.trim();
    if (!name) return;
    automationRules = [
      ...automationRules,
      {
        id: `rule_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        name,
        trigger: "Task created",
        action: "Add label triage",
        status: "enabled",
        project: "Authentication rewrite",
        executions: 0,
      },
    ];
    newAutomationName = "";
  }

  type FeatureFlag = "cycles" | "modules" | "views" | "pages" | "intake";
  const FEATURE_LABELS: Record<FeatureFlag, string> = {
    cycles: "Cycles",
    modules: "Modules",
    views: "Views",
    pages: "Pages",
    intake: "Intake",
  };
  let projectFeatures = $state<Record<FeatureFlag, boolean>>({
    cycles: true,
    modules: true,
    views: true,
    pages: true,
    intake: false,
  });
  function toggleFeature(flag: FeatureFlag): void {
    projectFeatures = { ...projectFeatures, [flag]: !projectFeatures[flag] };
  }
  function navItemsVisible(): FeatureFlag[] {
    return (Object.keys(projectFeatures) as FeatureFlag[]).filter((flag) => projectFeatures[flag]);
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
        {#each parentOptions() as parent (parent.id)}
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
              data-color-contrast-status={color}
              title="AA ready"
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
    <div class="flex items-center gap-3">
      <h2 class="text-base font-medium">Active</h2>
      {#if orderSaved}
        <span data-label-order-saved class="text-xs text-green-600">Order saved.</span>
      {/if}
      {#if archiveNotice}
        <span data-label-archive-notice class="text-xs text-muted-foreground">{archiveNotice}</span>
      {/if}
    </div>
    <ul class="flex flex-col gap-2">
      {#each topLevel() as label (label.id)}
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
              <span data-label-usage={label.id} class="text-xs text-muted-foreground">{label.usageCount} uses</span>
              <div class="ml-auto flex gap-1">
                <button type="button" data-label-move-up={label.id} class="rounded border border-border px-2 py-0.5 text-xs" onclick={() => moveLabel(label.id, -1)}>Up</button>
                <button type="button" data-label-move-down={label.id} class="rounded border border-border px-2 py-0.5 text-xs" onclick={() => moveLabel(label.id, 1)}>Down</button>
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
                  <span data-label-usage={child.id} class="text-xs text-muted-foreground">{child.usageCount} uses</span>
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
    <div class="flex items-center gap-3">
      <h2 class="text-base font-medium">Archived</h2>
      <button
        type="button"
        data-label-bulk-delete-archived
        class="rounded border border-destructive/40 px-2 py-0.5 text-xs text-destructive disabled:opacity-50"
        disabled={archivedSelection.length === 0}
        onclick={bulkDeleteArchived}
      >Delete selected</button>
      {#if archivedBulkError}
        <span data-label-bulk-delete-error class="text-xs text-destructive">{archivedBulkError}</span>
      {/if}
    </div>
    {#if archivedLabels().length > 0}
      <ul class="flex flex-col gap-1">
        {#each archivedLabels() as label (label.id)}
          <li data-label-archived-row={label.id} class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-label-archived-select={label.id}
              checked={isSelectedArchived(label.id)}
              onchange={() => toggleArchivedSelection(label.id)}
            />
            <span class="inline-block h-3 w-3 rounded-full" style={`background-color: ${label.color}`}></span>
            <span>{label.name}</span>
            <span data-label-usage={label.id} class="text-xs text-muted-foreground">{label.usageCount} uses</span>
            {#if label.archivedAt}
              <span class="text-xs text-muted-foreground">archived {label.archivedAt}</span>
            {/if}
            <div class="ml-auto flex gap-1">
              <button type="button" data-label-restore={label.id} class="rounded border border-border px-2 py-0.5 text-xs" onclick={() => restoreLabel(label.id)}>Restore</button>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-xs text-muted-foreground">No archived labels.</p>
    {/if}
  </section>

  <section data-estimates-settings class="flex flex-col gap-3 rounded-md border border-border p-4">
    <header>
      <h2 class="text-base font-medium">Estimates</h2>
      <p class="text-xs text-muted-foreground">Pick the estimation scale used across views, board cards, and reports.</p>
    </header>
    <form data-estimate-form class="flex flex-col gap-3" onsubmit={saveEstimate}>
      <label class="flex flex-col gap-1 text-sm">
        Scale
        <select
          data-estimate-scale
          bind:value={estimateScale}
          class="h-9 rounded-md border border-input bg-background px-2"
        >
          <option value="xs-xl">XS–XL (1, 2, 3, 5, 8)</option>
          <option value="fibonacci">Fibonacci (1, 2, 3, 5, 8, 13, 21)</option>
          <option value="linear">Linear 1–10</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      {#if estimateScale === "custom"}
        <label class="flex flex-col gap-1 text-sm">
          Custom values (comma-separated positive integers)
          <input
            type="text"
            data-estimate-custom
            bind:value={customScaleRaw}
            class="h-9 rounded-md border border-input bg-background px-2 font-mono"
          />
        </label>
      {/if}
      <p data-estimate-preview class="text-xs text-muted-foreground">Preview: [{effectiveScale().join(", ")}]</p>
      <div class="flex items-center gap-3">
        <button
          type="submit"
          data-estimate-save
          class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >Save estimate scale</button>
        {#if estimateSaved && !estimateError}
          <span data-estimate-saved class="text-sm text-green-600">Estimate scale saved.</span>
        {/if}
        {#if estimateError}
          <span data-estimate-error class="text-sm text-destructive">{estimateError}</span>
        {/if}
      </div>
    </form>

    <div class="mt-4 flex flex-col gap-2">
      <h3 class="text-sm font-medium">Apply to plan tasks</h3>
      <p data-estimate-total class="text-xs text-muted-foreground">Total points: {totalPoints()}</p>
      <div class="flex items-end gap-2">
        <label class="flex flex-col gap-1 text-xs">
          Bulk estimate
          <select
            data-bulk-estimate
            bind:value={bulkEstimate}
            class="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">-</option>
            {#each effectiveScale() as value (value)}
              <option value={value}>{value}</option>
            {/each}
          </select>
        </label>
        <button
          type="button"
          data-bulk-apply
          class="h-9 rounded-md border border-border px-3 text-sm"
          onclick={bulkApply}
        >Apply to selected</button>
      </div>
      <ul class="flex flex-col gap-1">
        {#each planTasks as task (task.id)}
          <li data-plan-task-row={task.id} class="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm">
            <input
              type="checkbox"
              data-plan-task-select={task.id}
              checked={task.selected}
              onchange={() => toggleTaskSelection(task.id)}
            />
            <span class="flex-1">{task.id}: {task.title}</span>
            <select
              data-plan-task-estimate={task.id}
              value={task.estimate ?? ""}
              onchange={(event) => setTaskEstimate(task.id, (event.target as HTMLSelectElement).value === "" ? null : Number((event.target as HTMLSelectElement).value))}
              class="h-8 rounded border border-border bg-background px-1 text-xs"
            >
              <option value="">-</option>
              {#each effectiveScale() as value (value)}
                <option value={value}>{value}</option>
              {/each}
            </select>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section data-modules-settings class="flex flex-col gap-3 rounded-md border border-border p-4">
    <header class="flex items-center justify-between">
      <div>
        <h2 class="text-base font-medium">Modules</h2>
        <p class="text-xs text-muted-foreground">Thematic grouping outside the cycle cadence (separate from sprints).</p>
      </div>
      <label class="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-modules-enable
          bind:checked={modulesEnabled}
        />
        Enable modules
      </label>
    </header>

    <form data-module-form class="flex flex-wrap items-end gap-3" onsubmit={addModule}>
      <label class="flex flex-1 flex-col gap-1 text-sm">
        Name
        <input
          type="text"
          data-module-name
          bind:value={newModuleName}
          class="h-9 rounded-md border border-input bg-background px-2"
          disabled={!modulesEnabled}
        />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Category
        <select
          data-module-category
          bind:value={newModuleCategory}
          class="h-9 rounded-md border border-input bg-background px-2"
          disabled={!modulesEnabled}
        >
          <option value="feature">Feature</option>
          <option value="bug">Bug</option>
          <option value="research">Research</option>
          <option value="ops">Ops</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Lead
        <input
          type="text"
          data-module-lead
          bind:value={newModuleLead}
          placeholder="unassigned"
          class="h-9 rounded-md border border-input bg-background px-2"
          disabled={!modulesEnabled}
        />
      </label>
      <button
        type="submit"
        data-module-add
        class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        disabled={!modulesEnabled}
      >Add module</button>
      {#if moduleError}
        <span data-module-error class="basis-full text-sm text-destructive">{moduleError}</span>
      {/if}
    </form>

    {#if modulesEnabled}
      <ul data-module-list class="flex flex-col gap-2 text-sm">
        {#each modules as module (module.id)}
          <li data-module-row={module.id} class="flex flex-col gap-1 rounded border border-border p-2">
            <div class="flex items-center gap-2">
              <span class="font-medium">{module.name}</span>
              <span data-module-category-tag={module.id} class="rounded-sm border border-border bg-muted px-2 py-0.5 text-[10px] uppercase">
                {module.category}
              </span>
              <span data-module-lead-tag={module.id} class="text-xs text-muted-foreground">lead: {module.lead}</span>
            </div>
            <div data-module-progress={module.id} class="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{module.completed}/{module.total || "-"}</span>
              <div class="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  data-module-progress-bar={module.id}
                  class="h-full bg-primary"
                  style="width: {module.total > 0 ? Math.round((module.completed / module.total) * 100) : 0}%"
                ></div>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p data-modules-disabled class="text-xs text-muted-foreground">Modules are disabled; enable to add new modules.</p>
    {/if}
  </section>

  <section data-automation-rules class="space-y-4 rounded-md border border-border p-6">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="space-y-1">
        <h2 class="text-lg font-medium">Automation rules</h2>
        <p class="text-sm text-muted-foreground">Project-scoped rules with trigger, action, status, and execution history.</p>
      </div>
      <form data-automation-rule-create-form class="flex flex-col gap-2 sm:min-w-72" onsubmit={createAutomationRule}>
        <label class="text-xs font-medium text-muted-foreground" for="new-automation-rule">Create new rule</label>
        <div class="flex gap-2">
          <input
            id="new-automation-rule"
            data-automation-new-rule-name
            bind:value={newAutomationName}
            placeholder="review handoff reminder"
            class="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          />
          <button
            type="submit"
            data-automation-new-rule
            class="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >Create</button>
        </div>
      </form>
    </header>

    <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <label class="flex flex-col gap-1 text-sm">
        Search rules
        <input
          type="search"
          data-automation-rule-search
          bind:value={automationSearch}
          placeholder="auto-close, disabled, status..."
          class="h-9 rounded-md border border-input bg-background px-2"
        />
      </label>
      <p data-automation-rule-count class="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        {visibleAutomationRules.length} of {automationRules.length} rules
      </p>
    </div>

    {#if visibleAutomationRules.length === 0}
      <div data-automation-rules-empty class="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
        No automation rules match the current search.
      </div>
    {:else}
      <div class="overflow-x-auto rounded-md border border-border">
        <table data-automation-rules-table class="w-full min-w-[720px] text-sm">
          <thead>
            <tr class="border-b border-border bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th class="px-3 py-2">Rule</th>
              <th class="px-3 py-2">Project</th>
              <th class="px-3 py-2">Trigger</th>
              <th class="px-3 py-2">Action</th>
              <th class="px-3 py-2">Status</th>
              <th class="px-3 py-2">Runs</th>
              <th class="px-3 py-2 text-right">Controls</th>
            </tr>
          </thead>
          <tbody>
            {#each visibleAutomationRules as rule (rule.id)}
              <tr
                data-automation-rule={rule.id}
                data-automation-rule-status={rule.status}
                class="border-b border-border last:border-0"
              >
                <td class="px-3 py-3 font-medium">{rule.name}</td>
                <td class="px-3 py-3 text-muted-foreground">{rule.project}</td>
                <td data-automation-rule-trigger={rule.id} class="px-3 py-3">{rule.trigger}</td>
                <td data-automation-rule-action={rule.id} class="px-3 py-3">{rule.action}</td>
                <td class="px-3 py-3">
                  <span
                    data-automation-rule-enabled={rule.id}
                    class={rule.status === "enabled"
                      ? "rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                      : "rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground"}
                  >
                    {rule.status === "enabled" ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td class="px-3 py-3 text-muted-foreground">{rule.executions}</td>
                <td class="px-3 py-3">
                  <div class="flex justify-end gap-2">
                    <button
                      type="button"
                      data-automation-rule-toggle={rule.id}
                      onclick={() => toggleAutomationRule(rule.id)}
                      class="rounded-md border border-border bg-background px-2 py-1 text-xs"
                    >
                      {rule.status === "enabled" ? "Disable" : "Enable"}
                    </button>
                    {#if automationDeleteId === rule.id}
                      <button
                        type="button"
                        data-automation-rule-delete-confirm={rule.id}
                        onclick={() => confirmAutomationDelete(rule.id)}
                        class="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground"
                      >Confirm</button>
                      <button
                        type="button"
                        data-automation-rule-delete-cancel={rule.id}
                        onclick={() => (automationDeleteId = null)}
                        class="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      >Cancel</button>
                    {:else}
                      <button
                        type="button"
                        data-automation-rule-delete={rule.id}
                        onclick={() => requestAutomationDelete(rule.id)}
                        class="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      >Delete</button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section data-project-features class="space-y-4 rounded-md border border-border p-6">
    <header class="space-y-1">
      <h2 class="text-lg font-medium">Project features</h2>
      <p class="text-sm text-muted-foreground">Toggle workflow features. Disabled features hide their nav entry across the project.</p>
    </header>
    <ul class="space-y-2">
      {#each (Object.keys(projectFeatures) as FeatureFlag[]) as flag}
        <li
          data-feature-row={flag}
          data-feature-enabled={projectFeatures[flag]}
          class="flex items-center justify-between rounded-md border border-border px-4 py-3"
        >
          <div>
            <p class="text-sm font-medium">{FEATURE_LABELS[flag]}</p>
            <p class="text-xs text-muted-foreground">{projectFeatures[flag] ? "Visible in project nav." : "Hidden from project nav."}</p>
          </div>
          <button
            type="button"
            data-feature-toggle={flag}
            onclick={() => toggleFeature(flag)}
            class="rounded-md border border-border bg-background px-3 py-1 text-xs"
          >
            {projectFeatures[flag] ? "Disable" : "Enable"}
          </button>
        </li>
      {/each}
    </ul>
    <nav data-feature-nav-preview aria-label="Project nav preview" class="rounded-md border border-border bg-muted/40 px-4 py-3">
      <p class="text-xs uppercase tracking-wide text-muted-foreground">Nav preview</p>
      <ul class="mt-2 flex flex-wrap gap-2">
        {#each navItemsVisible() as flag}
          <li data-feature-nav-item={flag} class="rounded-md border border-border bg-background px-2 py-1 text-xs">{FEATURE_LABELS[flag]}</li>
        {/each}
      </ul>
    </nav>
  </section>
</section>
