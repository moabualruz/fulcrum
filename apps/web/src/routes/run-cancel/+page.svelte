<script lang="ts">
  type Status = "running" | "cancelled";
  type Artifact = { id: string; name: string };

  let runStatus = $state<Status>("running");
  let artifacts = $state<Artifact[]>([{ id: "a1", name: "transcript.md" }, { id: "a2", name: "diff.patch" }]);
  let modalOpen = $state(false);
  let reason = $state("");
  let cancelled = $state<{ at: string; reason: string } | null>(null);
  let error = $state<string | null>(null);

  function openCancel(): void { modalOpen = true; error = null; }
  function closeCancel(): void { modalOpen = false; }

  function confirm(): void {
    if (!reason.trim()) { error = "Reason is required."; return; }
    runStatus = "cancelled";
    cancelled = { at: "10:14:00", reason: reason.trim() };
    artifacts = artifacts.map((a) => ({ ...a, name: `${a.name} (cancelled)` }));
    modalOpen = false;
  }
</script>

<svelte:head><title>Cancel run | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-run-cancel-page data-run-status={runStatus}>
  <h1 class="text-2xl font-semibold">Live run</h1>

  <section data-run-transcript class="rounded-md border border-border p-3 text-sm">
    <p>Tool: read /etc/issue → ok</p>
    <p>Tool: write notes.md → ok</p>
    <p>Assistant: continuing…</p>
  </section>

  <div class="flex gap-2">
    {#if runStatus === "running"}
      <button type="button" data-run-cancel-open onclick={openCancel} class="rounded-md bg-destructive px-3 py-1 text-xs text-destructive-foreground">Cancel</button>
    {/if}
  </div>

  {#if modalOpen}
    <div role="dialog" aria-label="Cancel run" data-run-cancel-modal class="space-y-2 rounded-md border border-border bg-background p-3">
      <h2 class="text-base font-medium">Cancel this run?</h2>
      <textarea data-run-cancel-reason bind:value={reason} placeholder="Why are you cancelling?" rows="2" class="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"></textarea>
      {#if error}<p data-run-cancel-error class="text-xs text-destructive">{error}</p>{/if}
      <div class="flex gap-2">
        <button type="button" data-run-cancel-confirm onclick={confirm} class="rounded-md bg-destructive px-3 py-1 text-xs text-destructive-foreground">Confirm cancel</button>
        <button type="button" data-run-cancel-dismiss onclick={closeCancel} class="rounded-md border border-border px-3 py-1 text-xs">Dismiss</button>
      </div>
    </div>
  {/if}

  {#if cancelled}
    <p data-run-cancelled-record class="text-xs text-primary">Cancelled at <span data-run-cancelled-at>{cancelled.at}</span> · reason: <span data-run-cancelled-reason>{cancelled.reason}</span></p>
  {/if}

  <ul class="space-y-1" data-run-artifacts>
    {#each artifacts as a}
      <li data-run-artifact={a.id}>{a.name}</li>
    {/each}
  </ul>
</main>
