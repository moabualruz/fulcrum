<script lang="ts">
  import type { PageData } from "./$types";
  import { enhance } from "$app/forms";
  import { cn } from "@fulcrum/ui-kit";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";

  interface Props { data: PageData }
  let { data }: Props = $props();

  let editingCohort = $state<string | null>(null);
  let cohortDraft = $state("");
  let editingRollout = $state<string | null>(null);
  let rolloutDraft = $state(0);
</script>

<header class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Feature flags</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {#if payload.flags.length === 0}
    <div data-empty-flags class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>
      No flags configured.
    </div>
  {:else}
    <div class={cn("relative w-full overflow-x-auto")}>
      <table class={cn("w-full caption-bottom text-sm")}>
        <thead class={cn("[&_tr]:border-b")}>
          <tr class={cn("border-b")}>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Flag</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Enabled</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Rollout %</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Cohort rules</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Updated</th>
          </tr>
        </thead>
        <tbody class={cn("[&_tr:last-child]:border-0")}>
          {#each payload.flags as flag (flag.id)}
            <tr data-flag-row data-flag-id={flag.id} class={cn("hover:bg-muted/50 border-b transition-colors")}>
              <td class={cn("p-2 align-middle font-medium")}>
                {flag.docs_url
                  ? `<a href="${flag.docs_url}" target="_blank" rel="noopener" class="hover:underline">${flag.name}</a>`
                  : flag.name}
              </td>
              <td class={cn("p-2 align-middle")}>
                <form method="POST" action="?/toggle" use:enhance>
                  <input type="hidden" name="id" value={flag.id} />
                  <button
                    type="submit"
                    data-toggle-flag
                    data-enabled={flag.enabled}
                    class={cn(
                      "inline-flex h-6 w-11 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                      flag.enabled ? "bg-primary" : "bg-muted",
                    )}
                    aria-pressed={flag.enabled}
                  >
                    <span class={cn(
                      "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform",
                      flag.enabled ? "translate-x-5" : "translate-x-0",
                    )}></span>
                  </button>
                </form>
              </td>
              <td class={cn("p-2 align-middle")}>
                {#if editingRollout === flag.id}
                  <form method="POST" action="?/setRollout" use:enhance={() => ({ update }) => { editingRollout = null; update(); }}>
                    <input type="hidden" name="id" value={flag.id} />
                    <input type="range" name="rollout_percent" min="0" max="100"
                      bind:value={rolloutDraft}
                      data-rollout-slider
                      class={cn("w-24")} />
                    <span class={cn("ml-1 text-xs")}>{rolloutDraft}%</span>
                    <button type="submit" class={cn(buttonVariants({ variant: "primary", size: "sm" }), "ml-1")}>Save</button>
                    <button type="button" onclick={() => { editingRollout = null; }} class={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Cancel</button>
                  </form>
                {:else}
                  <span data-rollout-display class={cn("text-sm")}>{flag.rollout_percent}%</span>
                  <button
                    onclick={() => { editingRollout = flag.id; rolloutDraft = flag.rollout_percent; }}
                    class={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-1")}>Edit</button>
                {/if}
              </td>
              <td class={cn("p-2 align-middle max-w-xs")}>
                {#if editingCohort === flag.id}
                  <form method="POST" action="?/setCohortRules" use:enhance={() => ({ update }) => { editingCohort = null; update(); }}>
                    <input type="hidden" name="id" value={flag.id} />
                    <textarea name="cohort_rules" bind:value={cohortDraft} rows="3"
                      data-cohort-editor
                      class={cn("border-input bg-background w-full rounded-md border px-2 py-1 font-mono text-xs")}></textarea>
                    <div class={cn("flex gap-1 mt-1")}>
                      <button type="submit" class={cn(buttonVariants({ variant: "primary", size: "sm" }))}>Save</button>
                      <button type="button" onclick={() => { editingCohort = null; }} class={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>Cancel</button>
                    </div>
                  </form>
                {:else}
                  <code class={cn("text-xs font-mono text-muted-foreground")}>
                    {JSON.stringify(flag.cohort_rules).slice(0, 40)}
                  </code>
                  <button
                    onclick={() => { editingCohort = flag.id; cohortDraft = JSON.stringify(flag.cohort_rules, null, 2); }}
                    class={cn(buttonVariants({ variant: "ghost", size: "sm" }), "ml-1")}>Edit</button>
                {/if}
              </td>
              <td class={cn("p-2 align-middle text-xs text-muted-foreground")}>{flag.updated_at.slice(0, 16)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/await}
