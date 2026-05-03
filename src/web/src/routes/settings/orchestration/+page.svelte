<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header
  data-settings-orchestration-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Orchestration settings</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="detail" />
{:then payload}
  <form method="POST" action="?/save" use:enhance data-orchestration-config-form class={cn("mb-8 flex flex-col gap-4 max-w-md")}>
    <label class={cn("flex flex-col gap-1")}>
      <span class={cn("text-sm font-medium")}>Poll interval (seconds)</span>
      <input
        type="number"
        name="poll_interval_s"
        value={payload.config.poll_interval_s}
        min="1"
        max="3600"
        class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
      />
    </label>
    <label class={cn("flex flex-col gap-1")}>
      <span class={cn("text-sm font-medium")}>Max concurrency</span>
      <input
        type="number"
        name="max_concurrency"
        value={payload.config.max_concurrency}
        min="1"
        max="64"
        class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
      />
    </label>
    <label class={cn("flex flex-col gap-1")}>
      <span class={cn("text-sm font-medium")}>Stall timeout (seconds)</span>
      <input
        type="number"
        name="stall_timeout_s"
        value={payload.config.stall_timeout_s}
        min="10"
        max="86400"
        class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
      />
    </label>
    <label class={cn("flex flex-col gap-1")}>
      <span class={cn("text-sm font-medium")}>Workspace root</span>
      <input
        type="text"
        name="workspace_root"
        value={payload.config.workspace_root ?? ""}
        placeholder="/path/to/workspaces"
        class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
      />
    </label>
    <button type="submit" data-save-config class={cn("inline-flex h-9 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90")}>
      Save
    </button>
  </form>

  <!-- Workflow definitions list -->
  <section data-workflow-defs>
    <h2 class={cn("text-lg font-semibold mb-2")}>Workflow definitions</h2>
    {#if payload.workflows.length === 0}
      <div class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>No workflow definitions yet.</div>
    {:else}
      <ul class={cn("flex flex-col gap-2")}>
        {#each payload.workflows as wf (wf.id)}
          <li class={cn("flex items-center justify-between rounded-md border border-border bg-background p-3")}>
            <div>
              <a href="/settings/orchestration/workflows/{wf.id}" class={cn("text-sm font-medium hover:underline")}>{wf.name}</a>
              {#if wf.description}
                <p class={cn("text-xs text-muted-foreground")}>{wf.description}</p>
              {/if}
            </div>
            <span class={cn("text-xs text-muted-foreground font-mono")}>{wf.updated_at}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/await}
