<script lang="ts">
  import type { ActionData } from "./$types";

  interface Props {
    form?: ActionData;
  }

  let { form }: Props = $props();
</script>

<svelte:head>
  <title>Log in | Fulcrum</title>
</svelte:head>

<section data-auth-login class="mx-auto flex w-full max-w-sm flex-col gap-6 py-12">
  <header class="flex flex-col gap-2">
    <h1 class="text-2xl font-semibold tracking-tight">Log in</h1>
  </header>

  {#if form?.error}
    <p data-auth-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.error}
    </p>
  {/if}

  <form method="POST" class="flex flex-col gap-4">
    <div class="flex flex-col gap-1.5">
      <label for="login-email" class="text-sm font-medium">Email</label>
      <input
        id="login-email"
        name="email"
        type="email"
        autocomplete="email"
        value={form?.email ?? ""}
        required
        class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
      />
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="login-password" class="text-sm font-medium">Password</label>
      <input
        id="login-password"
        name="password"
        type="password"
        autocomplete="current-password"
        required
        class="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
      />
    </div>

    <button
      type="submit"
      class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs"
    >Log in</button>
  </form>

  <p class="text-sm text-muted-foreground">
    Need an account? <a class="underline" href="/auth/signup">Sign up</a>
  </p>
</section>
