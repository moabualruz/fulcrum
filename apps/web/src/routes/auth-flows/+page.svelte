<script lang="ts">
  import { cn } from "$lib/utils.js";
  import type { ActionData } from "./$types";

  type Provider = "google" | "github";
  interface Props {
    form: ActionData;
  }

  let { form }: Props = $props();

  let email = $state("");
  let password = $state("");
  let oauthBusy = $state<Provider | null>(null);
  let passkeySupported = $state(true);
  let passkeyBusy = $state(false);
  let passkeyError = $state("");
  let passkeyMessage = $state("");
  let formPost = $state("");
  let oauthPost = $state("");

  const saasAuthEnabled = true;
  const serverFormPost = $derived(form?.emailPasswordPost ?? "");

  function submitLogin(event: SubmitEvent): void {
    event.preventDefault();
    formPost = JSON.stringify({ url: "+page.server", method: "POST", email, password: password ? "[masked]" : "" }, null, 2);
  }

  function handleOAuthLogin(provider: Provider): void {
    oauthBusy = provider;
    oauthPost = JSON.stringify(
      { url: "/api/auth/sign-in/social", method: "POST", provider, callbackURL: "/" },
      null,
      2,
    );
  }

  async function handlePasskeyLogin(): Promise<void> {
    passkeyError = "";
    passkeyMessage = "";
    passkeyBusy = true;
    await new Promise((resolve) => setTimeout(resolve, 250));
    passkeyBusy = false;
    passkeyError = "Passkey login failed. Use email and password, then register a new passkey from account security.";
  }

  async function handlePasskeyRegistration(): Promise<void> {
    passkeyError = "";
    passkeyMessage = "";
    passkeyBusy = true;
    await new Promise((resolve) => setTimeout(resolve, 250));
    passkeyBusy = false;
    passkeyMessage = "Passkey registered. Next login can use this device.";
  }
</script>

<svelte:head>
  <title>Auth login flow</title>
</svelte:head>

<main data-auth-flows-page class={cn("min-h-screen overflow-x-hidden bg-muted/35 text-foreground")}>
  <div class={cn("mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:px-6")}>
    <section data-auth-flow-card class={cn("min-w-0 rounded-md border border-border bg-background p-5 shadow-sm")}>
      <header data-auth-flows-header class={cn("mb-5 space-y-1")}>
        <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Auth · local-auth-enabled</p>
        <h1 class={cn("text-2xl font-semibold tracking-normal")}>Log in</h1>
      </header>

      {#if saasAuthEnabled}
        <div data-oauth-buttons class={cn("grid gap-2")}>
          <button
            type="button"
            data-oauth-google
            disabled={oauthBusy !== null}
            onclick={() => handleOAuthLogin("google")}
            class={cn("h-10 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs hover:bg-muted disabled:opacity-60")}
          >
            {oauthBusy === "google" ? "Redirecting..." : "Continue with Google"}
          </button>
          <button
            type="button"
            data-oauth-github
            disabled={oauthBusy !== null}
            onclick={() => handleOAuthLogin("github")}
            class={cn("h-10 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs hover:bg-muted disabled:opacity-60")}
          >
            {oauthBusy === "github" ? "Redirecting..." : "Continue with GitHub"}
          </button>
        </div>

        <div class={cn("my-5 flex items-center gap-2")}>
          <div class={cn("h-px flex-1 bg-border")}></div>
          <span class={cn("text-xs text-muted-foreground")}>or</span>
          <div class={cn("h-px flex-1 bg-border")}></div>
        </div>
      {/if}

      <form data-login-form method="POST" class={cn("grid gap-4")} onsubmit={submitLogin}>
        <label class={cn("block text-sm font-medium")} for="login-email">
          Email
          <input
            id="login-email"
            name="email"
            type="email"
            autocomplete="email"
            required
            bind:value={email}
            class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs")}
          />
        </label>

        <label class={cn("block text-sm font-medium")} for="login-password">
          Password
          <input
            id="login-password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            bind:value={password}
            class={cn("mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs")}
          />
        </label>

        <button type="submit" class={cn("h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs")}>Log in</button>
        {#if form?.error}
          <p data-auth-error class={cn("mt-1 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive")}>{form.error}</p>
        {/if}
      </form>

      <section data-passkey-capability class={cn("mt-5 border-t border-border pt-5")}>
        <label class={cn("mb-3 flex items-center gap-2 text-sm")}>
          <input data-passkey-supported-toggle type="checkbox" bind:checked={passkeySupported} class={cn("h-4 w-4 rounded border-border")} />
          Browser supports passkeys
        </label>

        {#if passkeySupported}
          <div data-passkey-buttons class={cn("grid gap-2")}>
            <button
              type="button"
              data-passkey-login
              disabled={passkeyBusy}
              onclick={handlePasskeyLogin}
              class={cn("h-10 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs hover:bg-muted disabled:opacity-60")}
            >
              {passkeyBusy ? "Waiting for passkey" : "Sign in with passkey"}
            </button>
            <button
              type="button"
              data-passkey-register
              disabled={passkeyBusy}
              onclick={handlePasskeyRegistration}
              class={cn("h-10 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs hover:bg-muted disabled:opacity-60")}
            >
              Register passkey
            </button>
          </div>
        {:else}
          <p data-passkey-unsupported class={cn("rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground")}>
            Passkeys are unavailable in this browser. Continue with email and password.
          </p>
        {/if}

        {#if passkeyError}
          <p data-passkey-error class={cn("mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive")}>{passkeyError}</p>
        {/if}
        {#if passkeyMessage}
          <p data-passkey-message class={cn("mt-3 rounded-md border border-green-700/30 bg-green-950/20 p-3 text-sm text-green-700")}>{passkeyMessage}</p>
        {/if}
      </section>
    </section>

    <aside class={cn("min-w-0 space-y-4")}>
      <section data-auth-flow-contract class={cn("rounded-md border border-border bg-background p-4")}>
        <h2 class={cn("text-sm font-semibold")}>Request contract</h2>
        <div class={cn("mt-3 grid gap-3")}>
          <pre data-email-password-post class={cn("min-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs")}>{formPost || serverFormPost || "Submit email/password to inspect POST payload."}</pre>
          <pre data-oauth-post class={cn("min-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs")}>{oauthPost || "Click OAuth to inspect social sign-in payload."}</pre>
        </div>
      </section>

      <section data-auth-recovery-guidance class={cn("rounded-md border border-border bg-background p-4 text-sm")}>
        <h2 class={cn("text-sm font-semibold")}>Recovery guidance</h2>
        <ul class={cn("mt-3 list-disc space-y-2 pl-5 text-muted-foreground")}>
          <li>Password stays masked and uses `autocomplete=current-password`.</li>
          <li>OAuth busy state disables OAuth buttons only; email form remains usable.</li>
          <li>Passkey failures keep email/password visible and explain recovery.</li>
        </ul>
      </section>
    </aside>
  </div>
</main>
