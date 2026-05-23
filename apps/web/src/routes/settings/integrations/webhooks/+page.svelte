<script lang="ts">
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
</script>

<svelte:head>
  <title>Webhooks: Integrations | Fulcrum</title>
</svelte:head>

<section data-settings-webhooks class="flex flex-col gap-6">
  <header>
    <h1 class="text-xl font-semibold tracking-tight">Webhooks</h1>
    <p class="text-sm text-muted-foreground">Receive event notifications at your endpoints.</p>
  </header>

  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">
    <h2 class="text-sm font-medium">Create subscription</h2>

    {#if form?.createError}
      <p data-webhook-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {form.createError}
      </p>
    {/if}

    {#if form?.ok}
      <p data-webhook-created class="rounded-md border border-green-700/30 bg-green-950/20 px-3 py-2 text-sm text-green-700">
        {form.resend ? "Webhook delivery queued for retry." : "Webhook subscription created."}
      </p>
    {/if}

    <form method="POST" action="?/create" class="flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">
        <label for="webhook-url" class="text-sm font-medium">Endpoint URL</label>
        <input
          id="webhook-url"
          name="url"
          type="url"
          required
          placeholder="https://example.com/webhook"
          class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="webhook-pattern" class="text-sm font-medium">Event pattern</label>
        <input
          id="webhook-pattern"
          name="eventPattern"
          type="text"
          required
          placeholder="task.* or *"
          class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="webhook-secret" class="text-sm font-medium">Signing secret (optional)</label>
        <input
          id="webhook-secret"
          name="signingSecret"
          type="text"
          placeholder="Leave blank to auto-generate"
          class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
        />
      </div>
      <button
        type="submit"
        data-webhook-submit
        class="h-9 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs"
      >Create subscription</button>
    </form>
  </div>

  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
    <h2 class="text-sm font-medium">Subscriptions</h2>
    {#if data.subscriptions.length === 0}
      <p data-webhook-subscriptions-empty class="text-sm text-muted-foreground">No webhook subscriptions yet.</p>
    {:else}
      <table class="w-full text-sm" data-webhook-subscriptions>
        <thead>
          <tr class="border-b border-border text-left text-xs text-muted-foreground">
            <th class="pb-2 font-medium">URL</th>
            <th class="pb-2 font-medium">Event pattern</th>
            <th class="pb-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {#each data.subscriptions as sub (sub.id)}
            <tr class="border-b border-border/50">
              <td class="py-2 font-mono text-xs">{sub.url}</td>
              <td class="py-2">{sub.eventPattern}</td>
              <td class="py-2">{sub.createdAt}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>

  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
    <h2 class="text-sm font-medium">Delivery log</h2>
    {#if data.deliveries.length === 0}
      <p data-webhook-deliveries-empty class="text-sm text-muted-foreground">No deliveries yet.</p>
    {:else}
      <table class="w-full text-sm" data-webhook-deliveries>
        <thead>
          <tr class="border-b border-border text-left text-xs text-muted-foreground">
            <th class="pb-2 font-medium">Event</th>
            <th class="pb-2 font-medium">Status</th>
            <th class="pb-2 font-medium">Attempts</th>
            <th class="pb-2 font-medium">Next attempt</th>
            <th class="pb-2 font-medium">Last attempt</th>
            <th class="pb-2 font-medium">Response</th>
            <th class="pb-2 font-medium">Error</th>
            <th class="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {#each data.deliveries as d (d.id)}
            <tr class="border-b border-border/50">
              <td class="py-2">{d.event}</td>
              <td class="py-2">
                <span data-delivery-status class="rounded border border-border px-2 py-0.5 text-xs">{d.deliveryStatus ?? d.status}</span>
              </td>
              <td class="py-2">{d.attempts ?? d.attempt ?? 0}</td>
              <td class="py-2">{d.nextAttemptAt ?? d.nextRetryAt ?? "-"}</td>
              <td class="py-2">{d.lastAttemptAt ?? d.deliveredAt ?? "-"}</td>
              <td class="py-2">
                <span>{d.responseCode ?? d.responseStatus ?? "-"}</span>
                {#if d.responseBodyExcerpt}
                  <span class="block max-w-64 truncate text-xs text-muted-foreground">{d.responseBodyExcerpt}</span>
                {/if}
              </td>
              <td class="py-2">
                {#if d.errorCode || d.errorMessage}
                  <span class="block text-xs">{d.errorCode ?? "delivery_error"}</span>
                  <span class="block max-w-64 truncate text-xs text-muted-foreground">{d.errorMessage}</span>
                {:else}
                  -
                {/if}
              </td>
              <td class="py-2">
                <form method="POST" action="?/resend">
                  <input type="hidden" name="deliveryId" value={d.id} />
                  <button type="submit" data-webhook-resend class="h-8 rounded-md border border-input px-3 text-xs">Resend</button>
                </form>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</section>
