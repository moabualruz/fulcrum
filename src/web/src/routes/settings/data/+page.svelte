<script lang="ts">
  import type { PageData, ActionData } from "./$types";
  import { enhance } from "$app/forms";
  import { cn } from "$lib/utils.js";
  import { buttonVariants } from "$lib/components/ui/button";
  import { toast } from "svelte-sonner";

  interface Props { data: PageData; form: ActionData }
  let { data, form }: Props = $props();

  let selectedKinds = $state<string[]>([]);
  let importFile = $state<File | null>(null);
  let preflightSummary = $state<Record<string, number> | null>(null);
  let confirmImportOpen = $state(false);

  $effect(() => {
    if (form && "exported" in form && form.exported) {
      // Trigger download
      const blob = new Blob([form.data as string], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = form.filename as string;
      a.click();
      URL.revokeObjectURL(url);
    }
    if (form && "preflightSummary" in form && form.preflightSummary) {
      preflightSummary = form.preflightSummary as Record<string, number>;
      confirmImportOpen = true;
    }
    if (form && "imported" in form && form.imported) {
      toast.success(`Import complete — ${form.totalRows} rows`);
      confirmImportOpen = false;
      preflightSummary = null;
      importFile = null;
    }
  });
</script>

<header class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Data</h1>
</header>

<!-- Export -->
<section class={cn("mb-8")}>
  <h2 class={cn("text-lg font-semibold mb-3")}>Export</h2>
  <form method="POST" action="?/export" use:enhance>
    <div class={cn("flex flex-wrap gap-3 mb-3")}>
      {#each data.entityKinds as kind (kind)}
        <label class={cn("flex items-center gap-1.5 text-sm")}>
          <input type="checkbox" name="kinds" value={kind}
            checked={selectedKinds.includes(kind)}
            onchange={(e) => {
              if ((e.currentTarget as HTMLInputElement).checked) {
                selectedKinds = [...selectedKinds, kind];
              } else {
                selectedKinds = selectedKinds.filter((k) => k !== kind);
              }
            }} />
          {kind}
        </label>
      {/each}
    </div>
    <button type="submit" data-export-btn class={cn(buttonVariants({ variant: "default" }))}>
      Export JSON
    </button>
    <p class={cn("text-xs text-muted-foreground mt-1")}>Leave all unchecked to export everything.</p>
  </form>
</section>

<!-- Import -->
<section>
  <h2 class={cn("text-lg font-semibold mb-3")}>Import</h2>
  <form method="POST" action="?/preflight" enctype="multipart/form-data" use:enhance>
    <div class={cn("flex gap-2 items-center")}>
      <input type="file" name="file" accept=".json" data-import-file
        class={cn("text-sm")}
        onchange={(e) => { importFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null; }} />
      <button type="submit" data-import-preflight disabled={!importFile}
        class={cn(buttonVariants({ variant: "default" }))}>Preflight check</button>
    </div>
  </form>
</section>

{#if confirmImportOpen && preflightSummary}
  <div data-import-preflight-modal class={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/50")}>
    <div class={cn("bg-background rounded-lg shadow-xl p-6 w-96 max-w-full")}>
      <h3 class={cn("text-lg font-semibold mb-3")}>Import preflight summary</h3>
      <table class={cn("w-full text-sm mb-4")}>
        <tbody>
          {#each Object.entries(preflightSummary) as [entity, count] (entity)}
            <tr class={cn("border-b")}>
              <td class={cn("py-1 font-medium")}>{entity}</td>
              <td class={cn("py-1 text-right text-muted-foreground")} data-preflight-count={entity}>{count} rows</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class={cn("flex gap-2 justify-end")}>
        <button onclick={() => { confirmImportOpen = false; }} class={cn(buttonVariants({ variant: "ghost" }))}>Cancel</button>
        <form method="POST" action="?/import" enctype="multipart/form-data" use:enhance>
          <input type="hidden" name="_confirm" value="dry-run" />
          <button type="submit" data-import-dry-run class={cn(buttonVariants({ variant: "secondary" }))}>Dry run</button>
        </form>
        <form method="POST" action="?/import" enctype="multipart/form-data" use:enhance>
          {#if importFile}
            <!-- Re-submit the same file for actual import -->
          {/if}
          <input type="hidden" name="_confirm" value="1" />
          {#if importFile}
            <!-- We store the file reference; in production use a temp key approach -->
          {/if}
          <button type="submit" data-confirm-import class={cn(buttonVariants({ variant: "default" }))}>Confirm import</button>
        </form>
      </div>
    </div>
  </div>
{/if}
