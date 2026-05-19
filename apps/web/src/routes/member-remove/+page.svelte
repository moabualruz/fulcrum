<script lang="ts">
  type Member = { id: string; name: string; role: "owner" | "admin" | "member"; docs: number; tasks: number };
  type Retention = "transfer" | "keep" | "delete";

  let members = $state<Member[]>([
    { id: "m1", name: "Ada", role: "owner", docs: 12, tasks: 30 },
    { id: "m2", name: "Bo", role: "admin", docs: 8, tasks: 12 },
    { id: "m3", name: "Carla", role: "member", docs: 4, tasks: 7 },
  ]);
  let confirmId = $state<string | null>(null);
  let retention = $state<Retention>("transfer");
  let transferTo = $state<string>("");
  let lastRemoved = $state<{ id: string; retention: Retention; transferTo: string | null } | null>(null);
  let error = $state<string | null>(null);

  function startRemove(id: string): void {
    confirmId = id;
    retention = "transfer";
    transferTo = "";
    error = null;
  }

  function cancel(): void { confirmId = null; }

  function confirm(): void {
    const m = members.find((x) => x.id === confirmId);
    if (!m) return;
    if (retention === "transfer" && !transferTo) { error = "Choose a recipient to transfer ownership."; return; }
    lastRemoved = { id: m.id, retention, transferTo: retention === "transfer" ? transferTo : null };
    members = members.filter((x) => x.id !== m.id);
    confirmId = null;
  }
</script>

<svelte:head><title>Member remove | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-member-remove-page>
  <h1 class="text-2xl font-semibold">Remove member</h1>

  <ul class="space-y-2">
    {#each members as m}
      <li data-member-row={m.id} class="flex items-center justify-between rounded-md border border-border p-3">
        <span class="text-sm">{m.name} ({m.role}) · {m.docs} docs · {m.tasks} tasks</span>
        {#if m.role !== "owner"}
          <button type="button" data-member-remove-start={m.id} onclick={() => startRemove(m.id)} class="rounded-md border border-border px-2 py-0.5 text-xs">Remove</button>
        {/if}
      </li>
    {/each}
  </ul>

  {#if confirmId}
    <section data-member-confirm class="space-y-2 rounded-md border border-border p-3">
      <h2 class="text-base font-medium">Confirm removal</h2>
      <fieldset class="space-y-1 text-xs">
        <legend>Data retention</legend>
        {#each ["transfer", "keep", "delete"] as r}
          <label class="flex items-center gap-2">
            <input type="radio" name="retention" data-retention-option={r} checked={retention === r} onchange={() => (retention = r as Retention)} />
            {r}
          </label>
        {/each}
      </fieldset>
      {#if retention === "transfer"}
        <label class="flex flex-col gap-1 text-xs">
          Transfer to
          <select data-retention-transfer-to bind:value={transferTo} class="rounded-md border border-border bg-background px-2 py-1">
            <option value="">choose…</option>
            {#each members.filter((x) => x.id !== confirmId) as candidate}
              <option value={candidate.id}>{candidate.name}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if error}<p data-member-error class="text-xs text-destructive">{error}</p>{/if}
      <div class="flex gap-2">
        <button type="button" data-member-confirm-yes onclick={confirm} class="rounded-md bg-destructive px-3 py-1 text-xs text-destructive-foreground">Confirm remove</button>
        <button type="button" data-member-confirm-cancel onclick={cancel} class="rounded-md border border-border px-3 py-1 text-xs">Cancel</button>
      </div>
    </section>
  {/if}

  {#if lastRemoved}
    <p data-member-removed-record class="text-xs text-muted-foreground">
      Removed <span data-member-removed-id>{lastRemoved.id}</span> with retention <span data-member-removed-retention>{lastRemoved.retention}</span>
      {#if lastRemoved.transferTo}→ <span data-member-removed-transfer>{lastRemoved.transferTo}</span>{/if}
    </p>
  {/if}
</main>
