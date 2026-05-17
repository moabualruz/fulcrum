<script lang="ts">
  import { onMount } from "svelte";
  import { browserSupportsPasskeys, registerPasskey, signInWithPasskey } from "$lib/passkey";
  import type { ActionData, PageData } from "./$types";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();
  let passkeySupported = $state(false);
  let passkeyBusy = $state(false);
  let passkeyError = $state<string | null>(null);
  let passkeyMessage = $state<string | null>(null);
  let oauthBusy = $state(false);

  const saasAuthEnabled = data.saasAuthEnabled ?? false;

  async function handleOAuthLogin(provider: "google" | "github") {
    oauthBusy = true;
    try {
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, callbackURL: "/" }),
      });
      if (res.ok) {
        const body = (await res.json()) as { url?: string };
        if (body.url) {
          window.location.assign(body.url);
          return;
        }
      }
    } catch {
      // ignore — oauthBusy reset below
    }
    oauthBusy = false;
  }

  onMount(() => {
    passkeySupported = browserSupportsPasskeys();
  });

  async function handlePasskeyLogin() {
    passkeyError = null;
    passkeyMessage = null;
    passkeyBusy = true;
    const result = await signInWithPasskey();
    passkeyBusy = false;

    if (result.verified) {
      window.location.assign("/");
      return;
    }

    passkeyError = result.error ?? "Passkey login failed";
  }

  async function handlePasskeyRegistration() {
    passkeyError = null;
    passkeyMessage = null;
    passkeyBusy = true;
    const result = await registerPasskey();
    passkeyBusy = false;

    if (result.verified) {
      passkeyMessage = "Passkey registered";
      return;
    }

    passkeyError = result.error ?? "Passkey registration failed";
  }
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

  {#if passkeyError}
    <p data-passkey-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {passkeyError}
    </p>
  {/if}

  {#if passkeyMessage}
    <p data-passkey-message class="rounded-md border border-green-700/30 bg-green-950/20 px-3 py-2 text-sm text-green-700">
      {passkeyMessage}
    </p>
  {/if}

  {#if saasAuthEnabled}
    <div class="flex flex-col gap-2" data-oauth-buttons>
      <button
        type="button"
        data-oauth-google
        disabled={oauthBusy}
        onclick={() => handleOAuthLogin("google")}
        class="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs disabled:opacity-60"
      >{oauthBusy ? "Redirecting…" : "Continue with Google"}</button>
      <button
        type="button"
        data-oauth-github
        disabled={oauthBusy}
        onclick={() => handleOAuthLogin("github")}
        class="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs disabled:opacity-60"
      >{oauthBusy ? "Redirecting…" : "Continue with GitHub"}</button>
    </div>

    <div class="relative flex items-center gap-2">
      <div class="h-px flex-1 bg-border"></div>
      <span class="text-xs text-muted-foreground">or</span>
      <div class="h-px flex-1 bg-border"></div>
    </div>
  {/if}

  {#if passkeySupported}
    <div class="flex flex-col gap-2">
      <button
        type="button"
        data-passkey-login
        disabled={passkeyBusy}
        onclick={handlePasskeyLogin}
        class="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs disabled:opacity-60"
      >{passkeyBusy ? "Waiting for passkey" : "Sign in with passkey"}</button>
      <button
        type="button"
        data-passkey-register
        disabled={passkeyBusy}
        onclick={handlePasskeyRegistration}
        class="h-9 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs disabled:opacity-60"
      >Register passkey</button>
    </div>
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
