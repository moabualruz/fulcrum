<script lang="ts">
  import type { PageData } from "./$types";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<main data-project-intake-page class={cn("mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6")}>
  <header data-project-intake-header class={cn("flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between")}>
    <div class={cn("min-w-0 space-y-1")}>
      <a href={`/projects/${data.projectId}`} class={cn("inline-flex min-h-10 items-center text-sm text-muted-foreground hover:underline")}>← Project</a>
      <h1 class={cn("text-2xl font-semibold tracking-tight")}>Intake</h1>
      <p data-intake-workflow-context class={cn("max-w-2xl text-sm text-muted-foreground")}>
        Capture incoming requests, keep their trace id visible, and promote only the work that belongs in this project.
      </p>
    </div>
    <label
      data-intake-primary-action
      for="intake-title"
      class={cn("inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90")}
    >New request</label>
  </header>

  <form id="new-intake-request" method="POST" action="?/create" data-create-intake-form class={cn("grid min-w-0 gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[minmax(0,1fr)_180px_auto]")}>
    <label class={cn("grid gap-1 text-sm font-medium")} for="intake-title">
      Request title
      <input id="intake-title" name="title" data-intake-title required placeholder="Import customer feedback" class={cn("border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm")} />
    </label>
    <label class={cn("grid gap-1 text-sm font-medium")} for="intake-source">
      Source
      <input id="intake-source" name="source" data-intake-source placeholder="manual" value="manual" class={cn("border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm")} />
    </label>
    <button type="submit" data-create-intake-submit class={cn("min-h-11 self-end rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90")}>Add request</button>
    <label class={cn("grid gap-1 text-sm font-medium md:col-span-3")} for="intake-description">
      Description
      <textarea id="intake-description" name="description" data-intake-description placeholder="Paste context, source notes, or acceptance signal." class={cn("border-input bg-background min-h-24 w-full rounded-md border px-3 py-2 text-sm")}></textarea>
    </label>
  </form>

  {#await data.streamed.data}
    <p data-intake-loading class={cn("rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground")}>Loading intake...</p>
  {:then payload}
    {#if payload.intake.length === 0}
      <section data-empty-intake class={cn("rounded-md border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground")}>
        <h2 class={cn("mb-1 text-base font-semibold text-foreground")}>No intake requests yet.</h2>
        <p>Use the request form to capture a signal before it becomes planned work.</p>
      </section>
    {:else}
      <section data-intake-list class={cn("min-w-0 space-y-3")}>
        <div class={cn("hidden overflow-x-auto rounded-md border border-border md:block")}>
          <table data-intake-table class={cn("w-full min-w-[680px] text-sm")}>
            <thead>
              <tr class={cn("border-b border-border bg-muted/30 text-left")}>
                <th class={cn("py-3 pl-4 pr-4 font-medium")}>Title</th>
                <th class={cn("py-3 pr-4 font-medium")}>Status</th>
                <th class={cn("py-3 pr-4 font-medium")}>Trace</th>
                <th class={cn("py-3 pr-4 font-medium")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each payload.intake as request (request.id)}
                <tr data-intake-row class={cn("border-b border-border last:border-0")}>
                  <td class={cn("py-3 pl-4 pr-4")}><a href={`/projects/${data.projectId}/intake/${request.id}`} class={cn("font-medium hover:underline")}>{request.title}</a></td>
                  <td class={cn("py-3 pr-4")}><span data-intake-status-badge class={cn("rounded-md bg-muted px-2 py-1 text-xs font-medium")}>{request.status}</span></td>
                  <td class={cn("py-3 pr-4 font-mono text-xs text-muted-foreground")}>{request.traceId}</td>
                  <td class={cn("py-3 pr-4")}>
                    <form method="POST" action="?/delete">
                      <input type="hidden" name="intakeId" value={request.id} />
                      <button type="submit" data-delete-intake class={cn("min-h-10 rounded-md border border-destructive/30 px-3 text-xs font-medium text-destructive hover:bg-destructive/10")}>Delete</button>
                    </form>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div data-intake-mobile-list class={cn("grid gap-3 md:hidden")}>
          {#each payload.intake as request (request.id)}
            <article data-intake-row class={cn("min-w-0 rounded-md border border-border bg-card p-4")}>
              <div class={cn("mb-3 flex min-w-0 items-start justify-between gap-3")}>
                <a href={`/projects/${data.projectId}/intake/${request.id}`} class={cn("min-w-0 break-words font-medium hover:underline")}>{request.title}</a>
                <span data-intake-status-badge class={cn("shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium")}>{request.status}</span>
              </div>
              <p class={cn("mb-3 break-all font-mono text-xs text-muted-foreground")}>{request.traceId}</p>
              <form method="POST" action="?/delete">
                <input type="hidden" name="intakeId" value={request.id} />
                <button type="submit" data-delete-intake class={cn("min-h-11 w-full rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10")}>Delete</button>
              </form>
            </article>
          {/each}
        </div>
      </section>
    {/if}
  {:catch err}
    <section data-intake-error class={cn("rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive")}>
      <h2 class={cn("font-semibold")}>Intake could not load</h2>
      <p>{err instanceof Error ? err.message : "Refresh the route and retry the request list."}</p>
      <a href={`/projects/${data.projectId}/intake`} class={cn("mt-3 inline-flex min-h-10 items-center rounded-md border border-destructive/30 px-3 font-medium hover:bg-destructive/10")}>Retry intake</a>
    </section>
  {/await}
</main>
