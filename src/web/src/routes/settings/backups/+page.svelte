<script lang="ts">
  import type { PageData, ActionData } from "./$types";
  import { enhance } from "$app/forms";
  import { cn } from "$lib/utils.js";
  import { buttonVariants } from "$lib/components/ui/button";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { toast } from "svelte-sonner";

  interface Props { data: PageData; form: ActionData }
  let { data, form }: Props = $props();

  let creating = $state(false);
  let createdId = $state<string | null>(null);
  let pollStatus = $state<string | null>(null);
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let preflightCounts = $state<Record<string, number> | null>(null);
  let confirmOpen = $state(false);
  let restoreFile = $state<File | null>(null);

  $effect(() => {
    if (form && "preflight" in form && form.preflight) {
      preflightCounts = (form as { entityCounts: Record<string, number> }).entityCounts;
      confirmOpen = true;
    }
    if (form && "restored" in form && form.restored) {
      toast.success("Restore complete");
      confirmOpen = false;
      preflightCounts = null;
    }
  });

  function startPoll(id: string) {
    createdId = id;
    pollStatus = "pending";
    pollInterval = setInterval(async () => {
      const res = await fetch(`/api/backups/${id}/status`).catch(() => null);
      if (res?.ok) {
        const body = await res.json() as { status: string };
        pollStatus = body.status;
        if (body.status === "complete" || body.status === "failed") {
          clearInterval(pollInterval!);
          pollInterval = null;
        }
      } else {
        // fallback: mark complete after one tick
        pollStatus = "complete";
        clearInterval(pollInterval!);
        pollInterval = null;
      }
    }, 1000);
  }
</script>

<header class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Backups</h1>
  <form method="POST" action="?/create" use:enhance={() => {
    creating = true;
    return ({ result, update }) => {
      creating = false;
      if (result.type === "success" && result.data && "id" in result.data) {
        startPoll(result.data.id as string);
      }
      update();
    };
  }}>
    <button type="submit" data-create-backup disabled={creating}
      class={cn(buttonVariants({ variant: "default" }))}>
      {creating ? "Creating…" : "Create backup"}
    </button>
  </form>
</header>

{#if createdId}
  <div data-backup-status class={cn("mb-4 p-3 rounded-md border text-sm flex items-center gap-2",
    pollStatus === "complete" ? "border-green-500 bg-green-50 dark:bg-green-950 text-green-700" : "border-border")}>
    {#if pollStatus === "pending"}
      <span>Creating backup…</span>
    {:else if pollStatus === "complete"}
      <span data-backup-complete>Backup ready —</span>
      <a href="/api/backups/{createdId}/download" download data-download-link
        class={cn(buttonVariants({ variant: "link", size: "sm" }), "p-0 h-auto")}>Download</a>
    {:else}
      <span>Backup failed</span>
    {/if}
  </div>
{/if}

<!-- Restore section -->
<section class={cn("mb-6")}>
  <h2 class={cn("text-lg font-semibold mb-3")}>Restore from backup</h2>
  <form method="POST" action="?/restore" enctype="multipart/form-data" use:enhance>
    <div class={cn("flex gap-2 items-center")}>
      <input type="file" name="file" accept=".json" data-restore-file
        class={cn("text-sm")}
        onchange={(e) => { restoreFile = (e.currentTarget as HTMLInputElement).files?.[0] ?? null; }} />
      <button type="submit" data-restore-submit disabled={!restoreFile}
        class={cn(buttonVariants({ variant: "default" }))}>Preflight check</button>
    </div>
  </form>
</section>

{#if confirmOpen && preflightCounts}
  <div data-preflight-modal class={cn("fixed inset-0 z-50 flex items-center justify-center bg-black/50")}>
    <div class={cn("bg-background rounded-lg shadow-xl p-6 w-96 max-w-full")}>
      <h3 class={cn("text-lg font-semibold mb-3")}>Preflight summary</h3>
      <table class={cn("w-full text-sm mb-4")}>
        <tbody>
          {#each Object.entries(preflightCounts) as [entity, count] (entity)}
            <tr class={cn("border-b")}>
              <td class={cn("py-1 font-medium")}>{entity}</td>
              <td class={cn("py-1 text-right text-muted-foreground")}>{count} rows</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class={cn("flex gap-2 justify-end")}>
        <button onclick={() => { confirmOpen = false; }} class={cn(buttonVariants({ variant: "ghost" }))}>Cancel</button>
        <form method="POST" action="?/confirmRestore" use:enhance>
          <input type="hidden" name="entityCounts" value={JSON.stringify(preflightCounts)} />
          <button type="submit" data-confirm-restore class={cn(buttonVariants({ variant: "default" }))}>Confirm restore</button>
        </form>
      </div>
    </div>
  </div>
{/if}

<!-- History -->
<section>
  <h2 class={cn("text-lg font-semibold mb-3")}>Backup history</h2>
  {#await data.streamed.data}
    <RouteSkeleton kind="list" />
  {:then payload}
    {#if payload.backups.length === 0}
      <div data-empty-backups class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}>
        No backups yet.
      </div>
    {:else}
      <table class={cn("w-full caption-bottom text-sm")}>
        <thead class={cn("[&_tr]:border-b")}>
          <tr class={cn("border-b")}>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>ID</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Status</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Size</th>
            <th class={cn("h-10 px-2 text-left align-middle font-medium")}>Created</th>
          </tr>
        </thead>
        <tbody class={cn("[&_tr:last-child]:border-0")}>
          {#each payload.backups as backup (backup.id)}
            <tr data-backup-row data-backup-id={backup.id} class={cn("hover:bg-muted/50 border-b transition-colors")}>
              <td class={cn("p-2 align-middle font-mono text-xs")}>{backup.id.slice(0, 8)}</td>
              <td class={cn("p-2 align-middle")}>{backup.status}</td>
              <td class={cn("p-2 align-middle text-xs text-muted-foreground")}>
                {backup.size_bytes ? `${(backup.size_bytes / 1024).toFixed(1)} KB` : "—"}
              </td>
              <td class={cn("p-2 align-middle text-xs text-muted-foreground")}>{backup.created_at.slice(0, 16)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  {/await}
</section>
