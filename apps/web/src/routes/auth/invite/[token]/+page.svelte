<script lang="ts">
  import type { PageData, ActionData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
</script>

<svelte:head>
  <title>Accept Invitation | Fulcrum</title>
</svelte:head>

<section data-invite-accept class="mx-auto flex w-full max-w-sm flex-col gap-6 py-12">
  <header class="flex flex-col gap-2">
    <h1 class="text-2xl font-semibold tracking-tight">Accept Invitation</h1>
    {#if !data.error}
      <p class="text-sm text-muted-foreground">
        You've been invited to join an organisation on Fulcrum.
      </p>
    {/if}
  </header>

  {#if form?.error ?? data.error}
    <p data-invite-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form?.error ?? data.error}
    </p>
  {/if}

  {#if data.error}
    <!-- Token missing/invalid at load time: show only the error, no form. -->
    <p class="text-sm text-muted-foreground">
      The invitation link is invalid or has expired. Please request a new one.
    </p>
  {:else if data.isAuthenticated}
    <!-- Authenticated: one-click accept (no account creation needed). -->
    <p class="text-sm text-muted-foreground">
      You are already signed in. Click below to join the organisation.
    </p>
    <form method="POST" class="flex flex-col gap-4">
      <input type="hidden" name="token" value={data.token} />
      <button
        type="submit"
        data-invite-submit
        class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs"
      >Join organisation</button>
    </form>
  {:else}
    <!-- Unauthenticated: create account + accept invite. -->
    <form method="POST" class="flex flex-col gap-4">
      <input type="hidden" name="token" value={data.token} />

      <div class="flex flex-col gap-1.5">
        <label for="invite-name" class="text-sm font-medium">Name</label>
        <input
          id="invite-name"
          name="name"
          type="text"
          autocomplete="name"
          value={(form as { name?: string } | null | undefined)?.name ?? ""}
          required
          class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="invite-email" class="text-sm font-medium">Email</label>
        <input
          id="invite-email"
          name="email"
          type="email"
          autocomplete="email"
          value={(form as { email?: string } | null | undefined)?.email ?? ""}
          required
          class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
        />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="invite-password" class="text-sm font-medium">Password</label>
        <input
          id="invite-password"
          name="password"
          type="password"
          autocomplete="new-password"
          required
          class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
        />
      </div>

      <button
        type="submit"
        data-invite-submit
        class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs"
      >Create account &amp; accept invite</button>
    </form>

    <p class="text-sm text-muted-foreground">
      Already have an account? <a class="underline" href="/auth/login">Log in</a>
    </p>
  {/if}
</section>
