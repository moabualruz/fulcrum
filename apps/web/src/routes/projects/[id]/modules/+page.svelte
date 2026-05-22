<script lang="ts">
  import type { PageData } from "./$types";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<main data-project-modules-page class={cn("mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6")}>
  <header data-project-modules-header class={cn("flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between")}>
    <div class={cn("min-w-0 space-y-1")}>
      <a href={`/projects/${data.projectId}`} class={cn("inline-flex min-h-10 items-center text-sm text-muted-foreground hover:underline")}>← Project</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Modules</h1>
      <p data-modules-workflow-context class={cn("max-w-2xl text-sm text-muted-foreground")}>
        Group project work into durable modules, keep ownership visible, and archive completed scopes without losing traceability.
      </p>
    </div>
    <label
      data-module-primary-action
      for="module-name"
      class={cn("inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90")}
    >New module</label>
  </header>

  <form id="new-project-module" method="POST" action="?/create" data-create-module-form class={cn("grid min-w-0 gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_170px_minmax(0,1fr)_auto]")}>
    <label class={cn("grid gap-1 text-sm font-medium")} for="module-name">
      Module name
      <input id="module-name" name="name" data-module-name required placeholder="Launch readiness" class={cn("border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm")} />
    </label>
    <label class={cn("grid gap-1 text-sm font-medium")} for="module-status">
      Status
      <select id="module-status" name="status" data-module-status class={cn("border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm")}>
        <option value="planned">Planned</option>
        <option value="active">Active</option>
        <option value="completed">Completed</option>
        <option value="archived">Archived</option>
      </select>
    </label>
    <label class={cn("grid gap-1 text-sm font-medium")} for="module-lead">
      Lead user id
      <input id="module-lead" name="leadUserId" data-module-lead placeholder="Optional owner id" class={cn("border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm")} />
    </label>
    <button type="submit" data-create-module-submit class={cn("min-h-11 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90")}>Create module</button>
  </form>

  {#await data.streamed.data}
    <p data-modules-loading class={cn("rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground")}>Loading modules...</p>
  {:then payload}
    {#if payload.modules.length === 0}
      <section data-empty-modules class={cn("rounded-md border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground")}>
        <h2 class={cn("mb-1 text-base font-semibold text-foreground")}>No modules yet.</h2>
        <p>Create the first project module when a work stream needs ownership, status, and traceable scope.</p>
      </section>
    {:else}
      <section data-modules-list class={cn("min-w-0 space-y-3")}>
        <div class={cn("hidden overflow-x-auto rounded-md border border-border md:block")}>
          <table data-modules-table class={cn("w-full min-w-[680px] text-sm")}>
            <thead>
              <tr class={cn("border-b border-border bg-muted/30 text-left")}>
                <th class={cn("py-3 pl-4 pr-4 font-medium")}>Name</th>
                <th class={cn("py-3 pr-4 font-medium")}>Status</th>
                <th class={cn("py-3 pr-4 font-medium")}>Trace</th>
                <th class={cn("py-3 pr-4 font-medium")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each payload.modules as projectModule (projectModule.id)}
                <tr data-module-row class={cn("border-b border-border last:border-0")}>
                  <td class={cn("py-3 pl-4 pr-4")}><a class={cn("font-medium hover:underline")} href={`/projects/${data.projectId}/modules/${projectModule.id}`}>{projectModule.name}</a></td>
                  <td class={cn("py-3 pr-4")}><span data-module-status-badge class={cn("rounded-md bg-muted px-2 py-1 text-xs font-medium")}>{projectModule.status}</span></td>
                  <td class={cn("py-3 pr-4 font-mono text-xs text-muted-foreground")}>{projectModule.traceId}</td>
                  <td class={cn("py-3 pr-4")}>
                    <form method="POST" action="?/delete">
                      <input type="hidden" name="moduleId" value={projectModule.id} />
                      <button type="submit" data-delete-module class={cn("min-h-10 rounded-md border border-destructive/30 px-3 text-xs font-medium text-destructive hover:bg-destructive/10")}>Delete</button>
                    </form>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div data-modules-mobile-list class={cn("grid gap-3 md:hidden")}>
          {#each payload.modules as projectModule (projectModule.id)}
            <article data-module-row class={cn("min-w-0 rounded-md border border-border bg-card p-4")}>
              <div class={cn("mb-3 flex min-w-0 items-start justify-between gap-3")}>
                <a class={cn("min-w-0 break-words font-medium hover:underline")} href={`/projects/${data.projectId}/modules/${projectModule.id}`}>{projectModule.name}</a>
                <span data-module-status-badge class={cn("shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium")}>{projectModule.status}</span>
              </div>
              <p class={cn("mb-3 break-all font-mono text-xs text-muted-foreground")}>{projectModule.traceId}</p>
              <form method="POST" action="?/delete">
                <input type="hidden" name="moduleId" value={projectModule.id} />
                <button type="submit" data-delete-module class={cn("min-h-11 w-full rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10")}>Delete</button>
              </form>
            </article>
          {/each}
        </div>
      </section>
    {/if}
  {:catch err}
    <section data-modules-error class={cn("rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive")}>
      <h2 class={cn("font-semibold")}>Modules could not load</h2>
      <p>{err instanceof Error ? err.message : "Refresh the route and retry the module list."}</p>
      <a href={`/projects/${data.projectId}/modules`} class={cn("mt-3 inline-flex min-h-10 items-center rounded-md border border-destructive/30 px-3 font-medium hover:bg-destructive/10")}>Retry modules</a>
    </section>
  {/await}
</main>
