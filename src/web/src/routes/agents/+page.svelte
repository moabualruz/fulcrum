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

<header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Agents</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {#if payload.profiles.length === 0}
    <div data-agents-empty class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>
      No agent profiles registered. Use <code>fulcrum agents add</code> to register one.
    </div>
  {:else}
    <div data-agents-table class={cn("overflow-x-auto")}>
      <table class={cn("w-full text-sm")}>
        <thead>
          <tr class={cn("border-b border-border text-left text-xs text-muted-foreground")}>
            <th class={cn("pb-2 pr-4")}>Name</th>
            <th class={cn("pb-2 pr-4")}>CLI Path</th>
            <th class={cn("pb-2 pr-4")}>Last Tested</th>
            <th class={cn("pb-2 pr-4")}>Status</th>
            <th class={cn("pb-2")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each payload.profiles as profile (profile.id)}
            <tr data-agent-row={profile.name} class={cn("border-b border-border/50")}>
              <td class={cn("py-2 pr-4")}>
                <a href="/agents/{profile.name}" class={cn("font-medium hover:underline")}>{profile.name}</a>
              </td>
              <td class={cn("py-2 pr-4 font-mono text-xs text-muted-foreground")}>{profile.cli_path}</td>
              <td class={cn("py-2 pr-4 text-xs text-muted-foreground")}>
                {profile.tested_at ?? "Never"}
              </td>
              <td class={cn("py-2 pr-4")}>
                {#if profile.test_passed === null}
                  <span data-test-badge="unknown" class={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs")}>Unknown</span>
                {:else if profile.test_passed}
                  <span data-test-badge="passed" class={cn("inline-flex items-center rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 text-xs")}>Passed</span>
                {:else}
                  <span data-test-badge="failed" class={cn("inline-flex items-center rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-0.5 text-xs")}>Failed</span>
                {/if}
              </td>
              <td class={cn("py-2")}>
                <form method="POST" action="?/test" use:enhance>
                  <input type="hidden" name="name" value={profile.name} />
                  <button type="submit" data-test-button={profile.name} class={cn("inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent")}>
                    Test
                  </button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/await}
