<script lang="ts">
  import type { PageData } from "./$types";
  import { enhance } from "$app/forms";
  import { cn } from "@fulcrum/ui-kit";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";

  interface Props { data: PageData }
  let { data }: Props = $props();

  let expanded = $state(new Set<string>());
  let clearBefore = $state("");

  function toggle(id: string) {
    if (expanded.has(id)) {
      expanded.delete(id);
      expanded = new Set(expanded);
    } else {
      expanded.add(id);
      expanded = new Set(expanded);
    }
  }
</script>

<header class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Error logs</h1>
  <form method="POST" action="?/clearBefore" use:enhance class={cn("flex items-center gap-2")}>
    <label class={cn("text-sm font-medium")}>
      Clear before:
      <input type="datetime-local" name="before" bind:value={clearBefore}
        data-clear-before-input
        class={cn("ml-1 border-input bg-background h-8 rounded-md border px-2 text-xs")} />
    </label>
    <button type="submit" data-clear-before-btn disabled={!clearBefore}
      class={cn(buttonVariants({ variant: "destructive", size: "sm" }))}>Clear</button>
  </form>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {#if payload.errors.length === 0}
    <div data-empty-errors class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>
      No errors logged.
    </div>
  {:else}
    <div class={cn("relative w-full overflow-x-auto")}>
      <table class={cn("w-full caption-bottom text-sm")}>
        <thead class={cn("[&_tr]:border-b")}>
          <tr class={cn("border-b")}>
            <th class={cn("h-10 px-2 text-left align-middle font-medium w-8")}></th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Message</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>OS</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Version</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Occurred</th>
          </tr>
        </thead>
        <tbody class={cn("[&_tr:last-child]:border-0")}>
          {#each payload.errors as err (err.id)}
            <tr data-error-row data-error-id={err.id} class={cn("hover:bg-muted/50 border-b transition-colors")}>
              <td class={cn("p-2 align-top")}>
                <button
                  data-expand-btn
                  onclick={() => toggle(err.id)}
                  class={cn("text-muted-foreground hover:text-foreground transition-transform", expanded.has(err.id) && "rotate-90")}
                  aria-expanded={expanded.has(err.id)}
                >▶</button>
              </td>
              <td class={cn("p-2 align-top")} colspan={expanded.has(err.id) ? 1 : 1}>
                <div class={cn("font-medium text-sm")}>{err.message}</div>
                {#if expanded.has(err.id)}
                  <div data-stack-trace class={cn("mt-2 rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap")}>
                    {err.stack_trace ?? "(no stack trace)"}
                  </div>
                  <details class={cn("mt-1")}>
                    <summary class={cn("text-xs text-muted-foreground cursor-pointer")}>Context JSON</summary>
                    <pre data-context-json class={cn("mt-1 rounded-md bg-muted px-3 py-2 font-mono text-xs overflow-x-auto")}>{JSON.stringify(err.context, null, 2)}</pre>
                  </details>
                {/if}
              </td>
              <td class={cn("p-2 align-top text-xs text-muted-foreground")}>{err.os ?? "-"}</td>
              <td class={cn("p-2 align-top text-xs text-muted-foreground")}>{err.version ?? "-"}</td>
              <td class={cn("p-2 align-top text-xs text-muted-foreground")}>{err.occurred_at.slice(0, 16)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    {#if payload.total > payload.pageSize}
      <div class={cn("flex gap-2 mt-4 justify-center")}>
        {#if payload.page > 1}
          <a href="?page={payload.page - 1}" class={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>← Prev</a>
        {/if}
        <span class={cn("text-sm text-muted-foreground self-center")}>
          Page {payload.page} of {Math.ceil(payload.total / payload.pageSize)}
        </span>
        {#if payload.page < Math.ceil(payload.total / payload.pageSize)}
          <a href="?page={payload.page + 1}" class={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Next →</a>
        {/if}
      </div>
    {/if}
  {/if}
{/await}
