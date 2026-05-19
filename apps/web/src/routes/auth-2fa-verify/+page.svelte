<script lang="ts">
  import { CredentialInput } from "@fulcrum/ui-kit";

  type Step = "password" | "2fa" | "done";
  let step = $state<Step>("password");
  let password = $state("");
  let code = $state("");
  let recovery = $state("");
  let useRecovery = $state(false);
  let error = $state<string | null>(null);

  function submitPassword(event: Event): void {
    event.preventDefault();
    if (password === "wrong") { error = "Wrong password."; return; }
    if (!password) { error = "Enter your password."; return; }
    error = null;
    step = "2fa";
  }

  function submit2fa(event: Event): void {
    event.preventDefault();
    if (useRecovery) {
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(recovery)) { error = "Recovery code format: XXXX-XXXX."; return; }
      if (recovery === "0000-0000") { error = "Invalid recovery code."; return; }
    } else {
      if (!/^\d{6}$/.test(code)) { error = "Code must be 6 digits."; return; }
      if (code === "000000") { error = "Invalid code. Try again."; return; }
    }
    error = null;
    step = "done";
  }

  function toggleRecovery(): void {
    useRecovery = !useRecovery;
    error = null;
    code = "";
    recovery = "";
  }
</script>

<svelte:head><title>Sign in | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-md space-y-4 p-6" data-auth-2fa-page data-auth-step={step}>
  <h1 class="text-2xl font-semibold">Sign in</h1>

  {#if step === "password"}
    <form data-auth-password class="space-y-2 rounded-md border border-border p-4" onsubmit={submitPassword}>
      <label class="flex flex-col gap-1 text-xs">
        Password
        <CredentialInput data-auth-password-input bind:value={password} aria-required="true" autocomplete="current-password" />
      </label>
      {#if error}<p data-auth-error class="text-xs text-destructive">{error}</p>{/if}
      <button type="submit" data-auth-password-submit class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Sign in</button>
    </form>
  {/if}

  {#if step === "2fa"}
    <form data-auth-2fa class="space-y-2 rounded-md border border-border p-4" onsubmit={submit2fa}>
      {#if useRecovery}
        <label class="flex flex-col gap-1 text-xs">
          Recovery code (XXXX-XXXX)
          <input data-auth-recovery-input bind:value={recovery} maxlength="9" class="rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </label>
      {:else}
        <label class="flex flex-col gap-1 text-xs">
          6-digit code from your authenticator
          <input data-auth-code-input bind:value={code} maxlength="6" inputmode="numeric" autofocus class="rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </label>
      {/if}
      {#if error}<p data-auth-error class="text-xs text-destructive">{error}</p>{/if}
      <button type="submit" data-auth-2fa-submit class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Verify</button>
      <button type="button" data-auth-2fa-toggle-recovery onclick={toggleRecovery} class="rounded-md border border-border bg-background px-3 py-1 text-xs">
        {useRecovery ? "Use authenticator code" : "Use recovery code instead"}
      </button>
    </form>
  {/if}

  {#if step === "done"}
    <p data-auth-done class="text-sm text-primary">Signed in.</p>
  {/if}
</main>
