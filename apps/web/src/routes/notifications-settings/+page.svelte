<script lang="ts">
  type Channel = "in-app" | "email" | "push";
  type Category = "mentions" | "comments" | "task-assignments" | "doc-updates" | "agent-runs";

  const CATEGORIES: Category[] = ["mentions", "comments", "task-assignments", "doc-updates", "agent-runs"];
  const CHANNELS: Channel[] = ["in-app", "email", "push"];

  let prefs = $state<Record<Category, Record<Channel, boolean>>>({
    "mentions": { "in-app": true, email: true, push: false },
    "comments": { "in-app": true, email: false, push: false },
    "task-assignments": { "in-app": true, email: true, push: true },
    "doc-updates": { "in-app": true, email: false, push: false },
    "agent-runs": { "in-app": true, email: false, push: true },
  });

  let quietStart = $state("22:00");
  let quietEnd = $state("07:00");
  let quietEnabled = $state(true);
  let saved = $state<string | null>(null);
  let error = $state<string | null>(null);

  function toggle(category: Category, channel: Channel): void {
    prefs = { ...prefs, [category]: { ...prefs[category], [channel]: !prefs[category][channel] } };
  }

  function save(event: Event): void {
    event.preventDefault();
    if (quietEnabled && quietStart === quietEnd) { error = "Quiet hours start and end must differ."; return; }
    error = null;
    saved = `Saved ${quietEnabled ? `quiet ${quietStart}–${quietEnd}` : "no quiet hours"}`;
  }
</script>

<svelte:head><title>Notification settings | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-notif-settings-page>
  <h1 class="text-2xl font-semibold">Notification settings</h1>

  <table class="w-full text-sm" data-notif-matrix>
    <thead>
      <tr class="text-left text-xs text-muted-foreground">
        <th>Category</th>
        {#each CHANNELS as c}<th>{c}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each CATEGORIES as cat}
        <tr data-notif-category={cat}>
          <td>{cat}</td>
          {#each CHANNELS as ch}
            <td>
              <input
                type="checkbox"
                data-notif-toggle={`${cat}.${ch}`}
                checked={prefs[cat][ch]}
                onchange={() => toggle(cat, ch)}
              />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  <form onsubmit={save} class="space-y-2 rounded-md border border-border p-3">
    <h2 class="text-base font-medium">Quiet hours</h2>
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" data-quiet-enabled bind:checked={quietEnabled} />
      Enable quiet hours
    </label>
    <div class="flex flex-wrap gap-2">
      <label class="flex flex-col gap-1 text-xs">
        Start
        <input type="time" data-quiet-start bind:value={quietStart} disabled={!quietEnabled} class="rounded-md border border-border bg-background px-2 py-1" />
      </label>
      <label class="flex flex-col gap-1 text-xs">
        End
        <input type="time" data-quiet-end bind:value={quietEnd} disabled={!quietEnabled} class="rounded-md border border-border bg-background px-2 py-1" />
      </label>
    </div>
    {#if error}<p data-notif-settings-error class="text-xs text-destructive">{error}</p>{/if}
    {#if saved}<p data-notif-settings-saved class="text-xs text-primary">{saved}</p>{/if}
    <button type="submit" data-notif-settings-save class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Save</button>
  </form>
</main>
