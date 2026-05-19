<script lang="ts">
  import type { ActionData } from "./$types";
  import { CredentialInput } from "@fulcrum/ui-kit";

  interface Props {
    form?: ActionData;
  }

  let { form }: Props = $props();
</script>

<svelte:head>
  <title>Sign up | Fulcrum</title>
</svelte:head>

<section data-auth-signup class="mx-auto flex w-full max-w-sm flex-col gap-6 py-12">
  <header class="flex flex-col gap-2">
    <h1 class="text-2xl font-semibold tracking-tight">Sign up</h1>
  </header>

  {#if form?.error}
    <p data-auth-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.error}
    </p>
  {/if}

  {#if form?.created}
    <div data-auth-verification-sent class="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
      <p>{form.verificationNotice ?? "Verification email sent."}</p>
      {#if form.verificationUrl}
        <p class="mt-1 text-xs">
          Development link:
          <a class="underline" href={form.verificationUrl}>Verify email</a>
        </p>
      {/if}
    </div>
  {/if}

  <form method="POST" class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <label for="signup-name" class="text-sm font-medium">Name</label>
      <input
        id="signup-name"
        name="name"
        type="text"
        autocomplete="name"
        value={form?.name ?? ""}
        required
        class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="signup-email" class="text-sm font-medium">Email</label>
      <input
        id="signup-email"
        name="email"
        type="email"
        autocomplete="email"
        value={form?.email ?? ""}
        required
        class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="signup-password" class="text-sm font-medium">Password</label>
      <CredentialInput
        id="signup-password"
        name="password"
        autocomplete="new-password"
        required
      />
    </div>

    <button
      type="submit"
      class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs"
    >Sign up</button>
  </form>

  <p class="text-sm text-muted-foreground">
    Already have an account? <a class="underline" href="/auth/login">Log in</a>
  </p>
</section>
