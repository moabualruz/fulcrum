<script lang="ts">
  import { cn } from "$lib/utils.js";

  type Role = "viewer" | "member" | "admin";
  type Access = "private" | "project" | "workspace";
  type ActionKind = "task" | "cycle" | "module" | "view" | "intake" | "command";

  interface WorkAction {
    id: string;
    kind: ActionKind;
    label: string;
    permission: string;
    minRole: Role;
    projectScoped: boolean;
    destructive?: boolean;
  }

  interface SavedView {
    id: string;
    name: string;
    access: Access;
    owner: string;
    projectId: string;
  }

  const ROLE_WEIGHT: Record<Role, number> = { viewer: 0, member: 1, admin: 2 };
  const ACTIONS: WorkAction[] = [
    { id: "task-status", kind: "task", label: "Change task status", permission: "task.update", minRole: "member", projectScoped: true },
    { id: "task-delete", kind: "task", label: "Delete task", permission: "task.delete", minRole: "admin", projectScoped: true, destructive: true },
    { id: "cycle-plan", kind: "cycle", label: "Move task to sprint", permission: "cycle.update", minRole: "member", projectScoped: true },
    { id: "module-edit", kind: "module", label: "Change module assignment", permission: "module.update", minRole: "member", projectScoped: true },
    { id: "view-share", kind: "view", label: "Share saved view", permission: "saved_view.share", minRole: "admin", projectScoped: true },
    { id: "intake-promote", kind: "intake", label: "Promote intake request", permission: "intake.promote", minRole: "member", projectScoped: true },
    { id: "command-bulk-delete", kind: "command", label: "Bulk delete selected tasks", permission: "command.bulk_delete", minRole: "admin", projectScoped: true, destructive: true },
  ];
  const SAVED_VIEWS: SavedView[] = [
    { id: "view-private", name: "My triage", access: "private", owner: "me", projectId: "alpha" },
    { id: "view-project", name: "Project blockers", access: "project", owner: "maya", projectId: "alpha" },
    { id: "view-workspace", name: "Workspace risks", access: "workspace", owner: "omar", projectId: "beta" },
  ];

  let role = $state<Role>("viewer");
  let projectAccess = $state(true);
  let activeProject = $state("alpha");
  let query = $state("");

  const visibleActions = $derived(ACTIONS.filter((action) =>
    action.label.toLowerCase().includes(query.toLowerCase())
    || action.permission.toLowerCase().includes(query.toLowerCase()),
  ));
  const allowedActionCount = $derived(ACTIONS.filter(canExecuteAction).length);
  const visibleSavedViews = $derived(SAVED_VIEWS.filter(canOpenView));
  const rejectedAction = $derived(ACTIONS.find((action) => !canExecuteAction(action)) ?? ACTIONS[0]);

  function canExecuteAction(action: WorkAction): boolean {
    if (action.projectScoped && !projectAccess) return false;
    return ROLE_WEIGHT[role] >= ROLE_WEIGHT[action.minRole];
  }

  function actionBlockReason(action: WorkAction): string {
    if (action.projectScoped && !projectAccess) return "No project membership for this scope.";
    if (ROLE_WEIGHT[role] < ROLE_WEIGHT[action.minRole]) return `Requires ${action.minRole} permission.`;
    return "Available.";
  }

  function canOpenView(view: SavedView): boolean {
    if (view.access === "private") return view.owner === "me";
    if (view.access === "project") return projectAccess && view.projectId === activeProject;
    return true;
  }
</script>

<svelte:head>
  <title>Permission-aware command palette</title>
</svelte:head>

<main data-palette-page class={cn("min-h-screen overflow-x-hidden bg-background text-foreground")}>
  <div class={cn("mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 lg:px-6")}>
    <header data-palette-header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
      <div>
        <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Build · CommandPalette</p>
        <h1 class={cn("text-2xl font-semibold tracking-normal")}>Permission-aware work actions</h1>
      </div>
      <div class={cn("flex flex-wrap items-center gap-2")}>
        <span data-available-action-count class={cn("rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium")}>{allowedActionCount} available</span>
        <span data-visible-view-count class={cn("rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium")}>{visibleSavedViews.length} saved views</span>
      </div>
    </header>

    <section data-permission-controls class={cn("grid gap-3 rounded-md border border-border bg-card p-3 md:grid-cols-[220px_1fr_1fr]")}>
      <label class={cn("block text-xs font-medium text-muted-foreground")}>
        Role
        <select data-role-select bind:value={role} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
          <option value="viewer">Viewer</option>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <label class={cn("flex items-center gap-2 text-sm")}>
        <input data-project-access-toggle type="checkbox" bind:checked={projectAccess} class={cn("h-4 w-4 rounded border-border")} />
        Project membership active
      </label>
      <label class={cn("block text-xs font-medium text-muted-foreground")}>
        Active project
        <select data-project-select bind:value={activeProject} class={cn("mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm")}>
          <option value="alpha">Alpha</option>
          <option value="beta">Beta</option>
        </select>
      </label>
    </section>

    <div class={cn("grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]")}>
      <section data-command-palette class={cn("rounded-md border border-border bg-background")}>
        <div class={cn("border-b border-border p-3")}>
          <label class={cn("block text-xs font-medium text-muted-foreground")}>
            Search commands
            <input data-command-search bind:value={query} class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm")} placeholder="task.update, bulk delete, share view" />
          </label>
        </div>
        <div class={cn("divide-y divide-border")}>
          {#each visibleActions as action (action.id)}
            {@const allowed = canExecuteAction(action)}
            <article data-command-action={action.id} data-action-kind={action.kind} data-action-allowed={allowed} class={cn("grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_160px]")}>
              <div class={cn("min-w-0")}>
                <div class={cn("flex flex-wrap items-center gap-2")}>
                  <span class={cn("font-medium")}>{action.label}</span>
                  <code data-required-permission class={cn("max-w-full break-all rounded bg-muted px-1.5 py-0.5 text-[11px]")}>{action.permission}</code>
                  {#if action.destructive}
                    <span class={cn("rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive")}>destructive</span>
                  {/if}
                </div>
                <p data-permission-explanation class={cn("mt-1 text-xs text-muted-foreground")}>{actionBlockReason(action)}</p>
              </div>
              <button data-command-button disabled={!allowed} class={cn("h-9 rounded-md px-3 text-sm font-medium", allowed ? "bg-primary text-primary-foreground hover:bg-primary/90" : "cursor-not-allowed border border-input bg-muted text-muted-foreground")}>
                {allowed ? "Run" : "Unavailable"}
              </button>
            </article>
          {:else}
            <div data-command-empty class={cn("p-6 text-sm text-muted-foreground")}>No commands match current search.</div>
          {/each}
        </div>
      </section>

      <aside class={cn("space-y-4")}>
        <section data-server-rejection class={cn("rounded-md border border-border bg-background p-3")}>
          <h2 class={cn("text-sm font-semibold")}>Server rejection</h2>
          <p class={cn("mt-1 text-xs text-muted-foreground")}>Forbidden API calls fail closed through tRPC permission middleware.</p>
          <pre data-forbidden-response class={cn("mt-3 max-w-full overflow-auto rounded bg-muted p-3 text-[11px] whitespace-pre-wrap break-words")}>{JSON.stringify({
            code: "FORBIDDEN",
            action: rejectedAction.permission,
            message: actionBlockReason(rejectedAction),
          }, null, 2)}</pre>
        </section>

        <section data-saved-view-access class={cn("rounded-md border border-border bg-background p-3")}>
          <h2 class={cn("text-sm font-semibold")}>Saved view access</h2>
          <div class={cn("mt-3 space-y-2")}>
            {#each SAVED_VIEWS as view (view.id)}
              {@const visible = canOpenView(view)}
              <div data-saved-view={view.id} data-view-visible={visible} class={cn("rounded-md border border-border p-2 text-xs", visible ? "bg-muted/30" : "bg-background opacity-55")}>
                <div class={cn("flex items-center justify-between gap-2")}>
                  <span class={cn("font-medium")}>{view.name}</span>
                  <span data-view-access class={cn("rounded bg-background px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground")}>{view.access}</span>
                </div>
                <p class={cn("mt-1 text-muted-foreground")}>{visible ? "Open in this scope." : "Hidden from this scope."}</p>
              </div>
            {/each}
          </div>
        </section>
      </aside>
    </div>
  </div>
</main>
