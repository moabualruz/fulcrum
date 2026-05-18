<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  function shortSha(sha: string | null): string {
    return sha ? sha.slice(0, 7) : "unknown";
  }
</script>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  <header class={cn("mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4")}>
    <div>
      <a href="/repos/{payload.repo.id}" class={cn("text-sm text-muted-foreground hover:underline")}>← {payload.repo.name}</a>
      <h1 class={cn("mt-1 text-2xl font-semibold tracking-tight")}>Branches</h1>
    </div>
    <form method="POST" action="?/create" use:enhance class={cn("flex gap-2")}>
      <input name="name" aria-label="Branch name" placeholder="new/branch" class={cn("h-10 rounded-md border border-input bg-background px-3 text-sm")} disabled={!payload.writeOpsEnabled} />
      <button type="submit" data-new-branch disabled={!payload.writeOpsEnabled} class={cn(buttonVariants({ variant: "default" }))}>New branch</button>
    </form>
  </header>

  {#if !payload.writeOpsEnabled}
    <div data-feature-gated class={cn("mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900")}>
      <strong>{payload.gate.code}</strong>: {payload.gate.message}
    </div>
  {/if}

  <section class={cn("overflow-x-auto rounded-md border border-border")}>
    <table class={cn("w-full min-w-[640px] text-sm")}>
      <thead class={cn("border-b border-border bg-muted/40 text-left")}>
        <tr>
          <th class={cn("px-3 py-2 font-medium")}>Branch</th>
          <th class={cn("px-3 py-2 font-medium")}>Head</th>
          <th class={cn("px-3 py-2 font-medium")}>State</th>
          <th class={cn("px-3 py-2 text-right font-medium")}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each payload.branches as branch (branch.name)}
          <tr class={cn("border-b border-border last:border-b-0")}>
            <td class={cn("px-3 py-2 font-mono text-xs")}>{branch.name}</td>
            <td class={cn("px-3 py-2 font-mono text-xs")}>{shortSha(branch.headSha)}</td>
            <td class={cn("px-3 py-2")}>
              {#if branch.isCurrent}<span data-current-branch>current</span>{/if}
              {#if branch.isDefault}<span data-default-branch class={cn("ml-2 rounded border border-border px-2 py-0.5 text-xs")}>default</span>{/if}
            </td>
            <td class={cn("px-3 py-2")}>
              <div class={cn("flex justify-end gap-2")}>
                <form method="POST" action="?/checkout" use:enhance>
                  <input type="hidden" name="name" value={branch.name} />
                  <button type="submit" disabled={!payload.writeOpsEnabled || branch.isCurrent} class={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Checkout</button>
                </form>
                <form method="POST" action="?/delete" use:enhance>
                  <input type="hidden" name="name" value={branch.name} />
                  <button type="submit" disabled={!payload.writeOpsEnabled || branch.isDefault} class={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Delete</button>
                </form>
              </div>
            </td>
          </tr>
        {:else}
          <tr><td colspan="4" class={cn("px-3 py-4 text-muted-foreground")}>No branches synced.</td></tr>
        {/each}
      </tbody>
    </table>
  </section>
{/await}
