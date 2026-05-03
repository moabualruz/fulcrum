<script lang="ts">
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();

  const quietHours = $derived(data.quietHours ?? {
    tz: "UTC",
    startHour: 22,
    endHour: 7,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  });

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const channels = ["email", "slack", "discord", "webhook", "push"];
</script>

<svelte:head>
  <title>Notification Settings | Fulcrum</title>
</svelte:head>

<div data-notification-settings class="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
  <header class="flex flex-col gap-1">
    <h1 class="text-2xl font-semibold tracking-tight">Notification Settings</h1>
    <p class="text-sm text-muted-foreground">Rules, quiet hours, mutes, and delivery channels.</p>
  </header>

  {#if form?.ruleError || form?.createError || form?.quietHoursError || form?.muteError}
    <p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.ruleError ?? form.createError ?? form.quietHoursError ?? form.muteError}
    </p>
  {/if}

  <section aria-labelledby="rules-heading" class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-4">
      <div>
        <h2 id="rules-heading" class="text-lg font-semibold">Rules</h2>
        <p class="text-sm text-muted-foreground">{data.rules.length} notification rules</p>
      </div>
      <a href="/settings/notifications/channels" class="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
        Channels
      </a>
    </div>

    <div class="overflow-x-auto rounded-md border border-border">
      <table data-notification-rules class="w-full min-w-[760px] text-sm">
        <thead class="border-b border-border bg-muted/50">
          <tr>
            <th class="px-4 py-2 text-left font-medium">Rule</th>
            <th class="px-4 py-2 text-left font-medium">Pattern</th>
            <th class="px-4 py-2 text-left font-medium">Channels</th>
            <th class="w-[180px] px-4 py-2 text-left font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each data.rules as rule (rule.id)}
            <tr class="border-b border-border last:border-0">
              <td class="px-4 py-3 align-top">
                <div class="font-medium">{rule.name}</div>
                <div class="text-xs text-muted-foreground">{rule.enabled ? "Enabled" : "Disabled"}</div>
              </td>
              <td class="px-4 py-3 align-top">
                <code class="text-xs">{JSON.stringify(rule.eventPattern ?? {})}</code>
              </td>
              <td class="px-4 py-3 align-top">{(rule.channels ?? []).join(", ")}</td>
              <td class="px-4 py-3 align-top">
                <div class="flex gap-2">
                  <form method="POST" action="?/toggleRule">
                    <input type="hidden" name="id" value={rule.id} />
                    <input type="hidden" name="enabled" value={rule.enabled ? "false" : "true"} />
                    <button class="rounded-md border border-border px-2 py-1 hover:bg-muted" type="submit">
                      {rule.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                  <form method="POST" action="?/deleteRule">
                    <input type="hidden" name="id" value={rule.id} />
                    <button class="rounded-md border border-border px-2 py-1 hover:bg-muted" type="submit">
                      Delete
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section aria-labelledby="add-rule-heading" class="rounded-md border border-border p-4">
    <h2 id="add-rule-heading" class="text-lg font-semibold">Add Rule</h2>
    <form method="POST" action="?/createRule" class="mt-4 grid gap-4 md:grid-cols-2">
      <label class="flex flex-col gap-1 text-sm">
        Name
        <input class="rounded-md border border-border bg-background px-3 py-2" name="name" required />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Kind
        <input class="rounded-md border border-border bg-background px-3 py-2" name="subjectKind" required placeholder="task" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Verb
        <input class="rounded-md border border-border bg-background px-3 py-2" name="verb" placeholder="assigned" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Payload Path
        <input class="rounded-md border border-border bg-background px-3 py-2" name="payloadPath" placeholder="assignee_id" />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Payload Value
        <input class="rounded-md border border-border bg-background px-3 py-2" name="payloadValue" placeholder="$current_user_id" />
      </label>
      <fieldset class="flex flex-col gap-2 text-sm">
        <legend class="font-medium">Channels</legend>
        <label class="inline-flex items-center gap-2"><input type="checkbox" checked disabled /> in-app</label>
        {#each channels as channel}
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" name="channels" value={channel} /> {channel}
          </label>
        {/each}
      </fieldset>
      <div class="md:col-span-2">
        <button class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">Save Rule</button>
      </div>
    </form>
  </section>

  <section aria-labelledby="quiet-hours-heading" class="rounded-md border border-border p-4">
    <div class="flex items-center justify-between gap-4">
      <h2 id="quiet-hours-heading" class="text-lg font-semibold">Quiet Hours</h2>
      <span data-quiet-hours-active class="text-sm text-muted-foreground">
        Active now: {data.quietHoursActiveNow ? "yes" : "no"}
      </span>
    </div>
    <form method="POST" action="?/saveQuietHours" class="mt-4 grid gap-4 md:grid-cols-3">
      <label class="flex flex-col gap-1 text-sm">
        Time zone
        <input class="rounded-md border border-border bg-background px-3 py-2" name="tz" value={quietHours.tz} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        Start hour
        <input class="rounded-md border border-border bg-background px-3 py-2" name="startHour" type="range" min="0" max="23" value={quietHours.startHour} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        End hour
        <input class="rounded-md border border-border bg-background px-3 py-2" name="endHour" type="range" min="0" max="23" value={quietHours.endHour} />
      </label>
      <fieldset class="flex flex-wrap gap-3 text-sm md:col-span-3">
        <legend class="w-full font-medium">Days</legend>
        {#each dayLabels as label, index}
          <label class="inline-flex items-center gap-2">
            <input type="checkbox" name="daysOfWeek" value={index} checked={quietHours.daysOfWeek.includes(index)} />
            {label}
          </label>
        {/each}
      </fieldset>
      <div class="md:col-span-3">
        <button class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">Save Quiet Hours</button>
      </div>
    </form>
  </section>

  <section aria-labelledby="mutes-heading" class="rounded-md border border-border p-4">
    <h2 id="mutes-heading" class="text-lg font-semibold">Mute List</h2>
    <form method="POST" action="?/addMute" class="mt-4 grid gap-4 md:grid-cols-4">
      <input class="rounded-md border border-border bg-background px-3 py-2 text-sm" name="subjectKind" placeholder="task" required />
      <input class="rounded-md border border-border bg-background px-3 py-2 text-sm" name="subjectId" placeholder="subject uuid" required />
      <input class="rounded-md border border-border bg-background px-3 py-2 text-sm" name="mutedUntil" type="datetime-local" />
      <button class="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">Add Mute</button>
    </form>
    <ul class="mt-4 divide-y divide-border">
      {#each data.mutes as mute (mute.id)}
        <li class="flex items-center justify-between gap-3 py-3 text-sm">
          <span>{mute.subjectKind} / {mute.subjectId}</span>
          <form method="POST" action="?/removeMute">
            <input type="hidden" name="subjectKind" value={mute.subjectKind} />
            <input type="hidden" name="subjectId" value={mute.subjectId} />
            <button class="rounded-md border border-border px-2 py-1 hover:bg-muted" type="submit">Remove</button>
          </form>
        </li>
      {/each}
    </ul>
  </section>
</div>
