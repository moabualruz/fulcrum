<script lang="ts">
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
  const flags = $derived(data.flags ?? []);
</script>

<svelte:head>
  <title>Feature Flags | Fulcrum Settings</title>
</svelte:head>

<div data-settings-flags class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-1">
    <h1 class="text-2xl font-semibold tracking-tight">Feature Flags</h1>
    <p class="text-sm text-muted-foreground">Control gated platform capabilities for this organisation.</p>
  </header>

  {#if form?.toggleError}
    <p data-toggle-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.toggleError}
    </p>
  {/if}

  <section aria-label="Registered feature flags" class="overflow-x-auto rounded-md border border-border">
    <table data-flags-table class="w-full min-w-[680px] text-sm">
      <thead class="border-b border-border bg-muted/50">
        <tr>
          <th class="w-[220px] px-4 py-2 text-left font-medium">Flag</th>
          <th class="px-4 py-2 text-left font-medium">Description</th>
          <th class="w-[140px] px-4 py-2 text-left font-medium">State</th>
        </tr>
      </thead>
      <tbody>
        {#each flags as flag (flag.name)}
          <tr class="border-b border-border last:border-0">
            <td class="px-4 py-3 align-top">
              <code class="break-words text-xs font-medium text-foreground">{flag.name}</code>
            </td>
            <td class="px-4 py-3 align-top text-muted-foreground">{flag.description}</td>
            <td class="px-4 py-3 align-top">
              <form method="POST" action="?/toggle">
                <input type="hidden" name="flag" value={flag.name} />
                <input type="hidden" name="enabled" value={flag.enabled ? "false" : "true"} />
                <button
                  type="submit"
                  role="switch"
                  aria-checked={flag.enabled}
                  aria-label={`${flag.enabled ? "Disable" : "Enable"} ${flag.name}`}
                  data-flag-toggle={flag.name}
                  class={[
                    "inline-flex h-7 w-12 items-center rounded-full border px-0.5 transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    flag.enabled ? "border-primary bg-primary" : "border-border bg-muted",
                  ]}
                >
                  <span
                    aria-hidden="true"
                    class={[
                      "block size-5 rounded-full bg-background shadow-sm transition-transform",
                      flag.enabled ? "translate-x-5" : "translate-x-0",
                    ]}
                  ></span>
                </button>
              </form>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
</div>
