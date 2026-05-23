<script lang="ts">
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
</script>

<svelte:head>
  <title>Email verification | Fulcrum</title>
</svelte:head>

<section data-auth-email-verification class="mx-auto flex w-full max-w-sm flex-col gap-6 py-12">
  <header class="flex flex-col gap-2">
    <h1 class="text-2xl font-semibold tracking-tight">Email verification</h1>
  </header>

  {#if data.status === "verified"}
    <p data-email-verified class="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
      Email verified for {data.email}. You can continue.
    </p>
    <a class="h-9 rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground shadow-xs" href="/auth/login">Log in</a>
  {:else if data.status === "invalid"}
    <p data-email-verification-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {data.message}
    </p>
  {:else if data.status === "unavailable"}
    <p data-email-verification-error class="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
      Email verification is unavailable. Try again later.
    </p>
  {:else}
    <p data-email-verification-error class="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
      Verification token is missing.
    </p>
  {/if}

  <form method="POST" action="?/resend" class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <label for="verify-org-id" class="text-sm font-medium">Organization ID</label>
      <input id="verify-org-id" name="orgId" required value={form?.orgId ?? ""} class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs" />
    </div>
    <div class="flex flex-col gap-1.5">
      <label for="verify-user-id" class="text-sm font-medium">User ID</label>
      <input id="verify-user-id" name="userId" required value={form?.userId ?? ""} class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs" />
    </div>
    <div class="flex flex-col gap-1.5">
      <label for="verify-email" class="text-sm font-medium">Email</label>
      <input id="verify-email" name="email" type="email" required value={form?.email ?? ""} class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs" />
    </div>

    {#if form?.resendError}
      <p data-email-resend-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {form.resendError}
      </p>
    {/if}

    {#if form?.resent}
      <div data-email-resend-sent class="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
        <p>{form.resendNotice}</p>
        {#if form.verificationUrl}
          <p class="mt-1 text-xs">
            Development link:
            <a class="underline" href={form.verificationUrl}>Verify email</a>
          </p>
        {/if}
      </div>
    {/if}

    <button type="submit" class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs">
      Resend verification
    </button>
  </form>
</section>
