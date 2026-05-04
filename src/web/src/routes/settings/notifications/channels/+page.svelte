<script lang="ts">
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
</script>

<svelte:head>
  <title>Notification Channels | Fulcrum</title>
</svelte:head>

<div data-notification-channels class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
  <header class="flex items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Notification Channels</h1>
      <p class="text-sm text-muted-foreground">Configure gated delivery endpoints.</p>
    </div>
    <a href="/settings/notifications" class="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
      Back
    </a>
  </header>

  {#if form?.channelError}
    <p class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.channelError}
    </p>
  {/if}

  <section aria-label="Available channels" class="overflow-x-auto rounded-md border border-border">
    <table class="w-full min-w-[560px] text-sm">
      <thead class="border-b border-border bg-muted/50">
        <tr>
          <th class="px-4 py-2 text-left font-medium">Channel</th>
          <th class="px-4 py-2 text-left font-medium">State</th>
          <th class="px-4 py-2 text-left font-medium">Configurable</th>
        </tr>
      </thead>
      <tbody>
        {#each data.channels as channel (channel.name)}
          <tr class="border-b border-border last:border-0">
            <td class="px-4 py-3 font-medium">{channel.name}</td>
            <td class="px-4 py-3">{channel.enabled ? "Enabled" : "Disabled"}</td>
            <td class="px-4 py-3">{channel.configurable ? "Yes" : "No"}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <div class="grid gap-4 lg:grid-cols-2">
    <section class="rounded-md border border-border p-4">
      <h2 class="text-lg font-semibold">Email</h2>
      <form method="POST" action="?/saveEmail" class="mt-4 flex flex-col gap-3">
        <input class="rounded-md border border-border bg-background px-3 py-2 text-sm" name="email" type="email" placeholder="admin@local" />
        <input class="rounded-md border border-border bg-background px-3 py-2 text-sm" name="token" placeholder="Verification token" />
        <button class="self-start rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">Verify Email</button>
      </form>
    </section>

    <section class="rounded-md border border-border p-4">
      <h2 class="text-lg font-semibold">Webhook</h2>
      {#if form?.webhookSecretMasked}
        <p data-webhook-secret class="mt-2 text-sm text-muted-foreground">Secret: {form.webhookSecretMasked}</p>
      {/if}
      <form method="POST" action="?/saveWebhook" class="mt-4 flex flex-col gap-3">
        <input class="rounded-md border border-border bg-background px-3 py-2 text-sm" name="url" type="url" placeholder="https://example.test/webhook" />
        <input class="rounded-md border border-border bg-background px-3 py-2 text-sm" name="secret" placeholder="HMAC secret" />
        <button class="self-start rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">Save Webhook</button>
      </form>
    </section>

    <section class="rounded-md border border-border p-4">
      <h2 class="text-lg font-semibold">Slack</h2>
      <form method="POST" action="?/saveSlack" class="mt-4 flex flex-col gap-3">
        <input class="rounded-md border border-border bg-background px-3 py-2 text-sm" name="url" type="url" placeholder="https://hooks.slack.com/services/..." />
        <button class="self-start rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">Save Slack</button>
      </form>
    </section>

    <section class="rounded-md border border-border p-4">
      <h2 class="text-lg font-semibold">Discord</h2>
      <form method="POST" action="?/saveDiscord" class="mt-4 flex flex-col gap-3">
        <input class="rounded-md border border-border bg-background px-3 py-2 text-sm" name="url" type="url" placeholder="https://discord.com/api/webhooks/..." />
        <button class="self-start rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">Save Discord</button>
      </form>
    </section>

    <section class="rounded-md border border-border p-4 lg:col-span-2">
      <h2 class="text-lg font-semibold">Push</h2>
      <form method="POST" action="?/subscribePush" class="mt-4 flex flex-col gap-3">
        <textarea class="min-h-24 rounded-md border border-border bg-background px-3 py-2 text-sm" name="subscription" placeholder={"{\"endpoint\":\"...\",\"keys\":{\"p256dh\":\"...\",\"auth\":\"...\"}}"}></textarea>
        <button class="self-start rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" type="submit">Subscribe Push</button>
      </form>
    </section>
  </div>
</div>
