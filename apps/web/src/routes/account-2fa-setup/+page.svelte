<script lang="ts">
  type Step = "intro" | "qr" | "verify" | "recovery" | "done";
  let step = $state<Step>("intro");
  let secret = $state<string | null>(null);
  let qrUrl = $state<string | null>(null);
  let code = $state("");
  let error = $state<string | null>(null);
  let recoveryCodes = $state<string[]>([]);
  let recoveryDownloaded = $state(false);

  function fakeSecret(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let out = "";
    for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function fakeRecoveryCodes(): string[] {
    return Array.from({ length: 8 }, () =>
      Math.random().toString(36).slice(2, 6).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
    );
  }

  function start(): void {
    const s = fakeSecret();
    secret = s;
    qrUrl = `otpauth://totp/Fulcrum:admin@local?secret=${s}&issuer=Fulcrum`;
    step = "qr";
  }

  function moveToVerify(): void {
    step = "verify";
    error = null;
    code = "";
  }

  function verifyCode(event: Event): void {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) { error = "Code must be 6 digits."; return; }
    if (code === "000000") { error = "Invalid code. Try again."; return; }
    error = null;
    recoveryCodes = fakeRecoveryCodes();
    step = "recovery";
  }

  function downloadRecovery(): void {
    recoveryDownloaded = true;
  }

  function finish(): void {
    if (!recoveryDownloaded) { error = "Download your recovery codes before finishing."; return; }
    step = "done";
  }
</script>

<svelte:head><title>2FA setup | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-4 p-6" data-2fa-setup-page data-2fa-step={step}>
  <h1 class="text-2xl font-semibold">Two-factor authentication setup</h1>

  {#if step === "intro"}
    <section data-2fa-intro class="space-y-2 rounded-md border border-border p-4">
      <p class="text-sm">Add an authenticator app to protect your account. We support TOTP-based apps (1Password, Authy, Google Authenticator).</p>
      <button type="button" data-2fa-start onclick={start} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Start setup</button>
    </section>
  {/if}

  {#if step === "qr"}
    <section data-2fa-qr class="space-y-2 rounded-md border border-border p-4">
      <p class="text-sm">Scan this QR with your authenticator app, or enter the secret manually.</p>
      <div data-2fa-qr-placeholder aria-label="QR code" class="rounded-md border border-border bg-muted p-3 text-xs font-mono">{qrUrl}</div>
      <p class="text-xs">Secret: <code data-2fa-secret>{secret}</code></p>
      <button type="button" data-2fa-next onclick={moveToVerify} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">I've added it</button>
    </section>
  {/if}

  {#if step === "verify"}
    <form data-2fa-verify class="space-y-2 rounded-md border border-border p-4" onsubmit={verifyCode}>
      <label class="flex flex-col gap-1 text-xs">
        Enter 6-digit code from your app
        <input data-2fa-code bind:value={code} maxlength="6" inputmode="numeric" aria-required="true" class="rounded-md border border-border bg-background px-2 py-1 text-sm" />
      </label>
      {#if error}<p data-2fa-error class="text-xs text-destructive">{error}</p>{/if}
      <button type="submit" data-2fa-verify-submit class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Verify</button>
    </form>
  {/if}

  {#if step === "recovery"}
    <section data-2fa-recovery class="space-y-2 rounded-md border border-border p-4">
      <p class="text-sm">Store these one-time recovery codes somewhere safe. Each can be used once if you lose your authenticator.</p>
      <ul data-2fa-recovery-codes class="space-y-1 text-xs font-mono">
        {#each recoveryCodes as code}<li data-2fa-recovery-code={code}>{code}</li>{/each}
      </ul>
      <button type="button" data-2fa-download onclick={downloadRecovery} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Download codes</button>
      {#if recoveryDownloaded}<p data-2fa-downloaded class="text-xs text-primary">Downloaded.</p>{/if}
      {#if error}<p data-2fa-error class="text-xs text-destructive">{error}</p>{/if}
      <button type="button" data-2fa-finish onclick={finish} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Finish</button>
    </section>
  {/if}

  {#if step === "done"}
    <section data-2fa-done class="space-y-2 rounded-md border border-primary p-4">
      <p class="text-sm font-medium">Two-factor authentication is enabled.</p>
      <p class="text-xs text-muted-foreground">You'll be asked for a code on next sign-in.</p>
    </section>
  {/if}
</main>
