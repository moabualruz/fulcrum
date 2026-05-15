<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import AgentSessionWorkbench from "$lib/components/agents/AgentSessionWorkbench.svelte";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { cn } from "$lib/utils.js";
  import { buttonVariants } from "$lib/components/ui/button";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // Dispatch modal state
  let dispatchOpen = $state(false);
  let dispatchAgent = $state("");
  let dispatchTaskId = $state("");
  let dispatchProjectId = $state("");

  function openDispatch(agentName: string) {
    dispatchAgent = agentName;
    dispatchTaskId = "";
    dispatchProjectId = "";
    dispatchOpen = true;
  }

  function closeDispatch() {
    dispatchOpen = false;
  }
</script>

<header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Agents</h1>
</header>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  <div class={cn("mb-4")}>
    <AgentSessionWorkbench model={payload.sessionWorkbench} />
  </div>

  {#if payload.profiles.length === 0}
    <div data-agents-empty class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>
      No agent profiles registered. Use <code>fulcrum agents add</code> to register one.
    </div>
  {:else}
    <div data-agents-list class={cn("flex flex-col gap-4")}>
      {#each payload.profiles as profile (profile.id)}
        <div
          data-agent-card
          data-agent-name={profile.name}
          class={cn("rounded-lg border border-border bg-background p-4")}
        >
          <div class={cn("flex items-start justify-between gap-4")}>
            <div class={cn("flex-1 min-w-0")}>
              <div class={cn("flex items-center gap-2 mb-1")}>
                <a
                  href="/agents/{profile.name}"
                  class={cn("font-semibold hover:underline truncate")}
                >{profile.name}</a>
                {#if profile.test_passed === null}
                  <span data-test-badge="unknown" class={cn("inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs")}>Unknown</span>
                {:else if profile.test_passed}
                  <span data-test-badge="passed" class={cn("inline-flex items-center rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-0.5 text-xs")}>Passed</span>
                {:else}
                  <span data-test-badge="failed" class={cn("inline-flex items-center rounded-full bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 px-2 py-0.5 text-xs")}>Failed</span>
                {/if}
              </div>

              <!-- Capability chips -->
              <div data-capabilities class={cn("flex flex-wrap gap-1 mb-2")}>
                {#each profile.capabilities as cap}
                  <span
                    data-capability-chip={cap}
                    class={cn("inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground")}
                  >{cap}</span>
                {/each}
              </div>

              <p class={cn("font-mono text-xs text-muted-foreground truncate")}>{profile.cli_path}</p>
              {#if profile.tested_at}
                <p class={cn("text-xs text-muted-foreground mt-1")}>Last tested: {profile.tested_at}</p>
              {/if}
            </div>

            <div class={cn("flex items-center gap-2 flex-shrink-0")}>
              <form method="POST" action="?/test" use:enhance>
                <input type="hidden" name="name" value={profile.name} />
                <button
                  type="submit"
                  data-test-button={profile.name}
                  class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >Test</button>
              </form>

              <button
                type="button"
                data-dispatch-button={profile.name}
                onclick={() => openDispatch(profile.name)}
                class={cn(buttonVariants({ variant: "default", size: "sm" }))}
              >Dispatch</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Dispatch modal -->
  {#if dispatchOpen}
    <div
      data-dispatch-modal
      class={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/50")}
    >
      <div class={cn("rounded-lg border border-border bg-background p-6 shadow-lg w-full max-w-md")}>
        <h2 class={cn("text-lg font-semibold mb-4")}>Dispatch run — {dispatchAgent}</h2>

        <form method="POST" action="?/dispatch" use:enhance>
          <input type="hidden" name="agent" value={dispatchAgent} />

          <div class={cn("mb-4")}>
            <label class={cn("block text-sm font-medium mb-1")} for="dispatch-task">Task</label>
            <select
              id="dispatch-task"
              name="task_id"
              bind:value={dispatchTaskId}
              required
              class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
            >
              <option value="">— select a task —</option>
              {#each payload.tasks as task (task.id)}
                <option value={task.id}>{task.title}</option>
              {/each}
            </select>
          </div>

          <div class={cn("mb-4")}>
            <label class={cn("block text-sm font-medium mb-1")} for="dispatch-project">Project (optional)</label>
            <select
              id="dispatch-project"
              name="project_id"
              bind:value={dispatchProjectId}
              class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
            >
              <option value="">— any project —</option>
              {#each payload.projects as project (project.id)}
                <option value={project.id}>{project.name}</option>
              {/each}
            </select>
          </div>

          <div class={cn("flex justify-end gap-2")}>
            <button
              type="button"
              data-dispatch-cancel
              onclick={closeDispatch}
              class={cn(buttonVariants({ variant: "outline" }))}
            >Cancel</button>
            <button
              type="submit"
              data-dispatch-submit
              disabled={!dispatchTaskId}
              class={cn(buttonVariants({ variant: "default" }))}
            >Dispatch</button>
          </div>
        </form>
      </div>
    </div>
  {/if}
{/await}
