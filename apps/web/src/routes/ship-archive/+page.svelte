<script lang="ts">
  import { cn } from "$lib/utils.js";

  type Stage = "idle" | "confirming" | "verified" | "scheduled";

  let stage = $state<Stage>("idle");
  let password = $state("");
  let reason = $state("");
  let error = $state<string | null>(null);
  let exportRequested = $state(false);
  let auditEntry = $state<{ deletedAt: string; reason: string | null } | null>(null);

  function requestExport(): void {
    exportRequested = true;
  }

  function startDelete(): void {
    stage = "confirming";
    error = null;
  }

  function cancelDelete(): void {
    stage = "idle";
    password = "";
    reason = "";
    error = null;
  }

  function verifyPassword(event: Event): void {
    event.preventDefault();
    if (password.length < 1) { error = "Password is required."; return; }
    if (password === "wrong") { error = "Password incorrect."; return; }
    error = null;
    stage = "verified";
  }

  function scheduleDeletion(): void {
    const deletedAt = new Date().toISOString();
    auditEntry = { deletedAt, reason: reason.trim() || null };
    stage = "scheduled";
  }
</script>

<svelte:head>
  <title>Account · Permanent delete | Fulcrum</title>
</svelte:head>

<section data-account-delete class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-1 border-b border-border pb-3">
    <h1 data-account-delete-header class="text-2xl font-semibold tracking-tight">Permanently delete account</h1>
    <p class="text-sm text-muted-foreground">
      Workspaces keep your docs; ownership transfers to the workspace admin. Recovery window: 30 days.
    </p>
  </header>

  <section data-data-export class={cn("rounded-md border border-border p-4")}>
    <h2 class="text-base font-medium">Export your data first</h2>
    <p class="text-xs text-muted-foreground">Download an archive of workspace docs, settings, and audit history before deletion.</p>
    <button
      type="button"
      data-request-export
      class="mt-3 h-9 rounded-md border border-border px-3 text-sm font-medium"
      onclick={requestExport}
      disabled={exportRequested}
    >{exportRequested ? "Export requested" : "Request export"}</button>
    {#if exportRequested}
      <span data-export-confirmation class="ml-2 text-xs text-success">We will email a download link once it is ready.</span>
    {/if}
  </section>

  <section data-delete-card class={cn("rounded-md border border-destructive/40 bg-destructive/5 p-4")}>
    {#if stage === "idle"}
      <h2 class="text-base font-medium">I understand the consequences</h2>
      <p class="text-xs text-muted-foreground">You will be removed from every workspace. Docs ownership transfers to the workspace admin.</p>
      <button
        type="button"
        data-account-delete-start
        class="mt-3 h-9 rounded-md bg-destructive px-3 text-sm text-destructive-foreground"
        onclick={startDelete}
      >Delete my account</button>
    {:else if stage === "confirming"}
      <h2 class="text-base font-medium">Verify your password</h2>
      <form data-account-delete-form class="mt-3 flex flex-col gap-2" onsubmit={verifyPassword}>
        <input
          type="password"
          data-account-password
          bind:value={password}
          placeholder="Current password"
          class="h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
        <textarea
          data-account-delete-reason
          bind:value={reason}
          placeholder="Reason (optional, written to audit log)"
          class="rounded-md border border-input bg-background px-2 py-1 text-sm"
        ></textarea>
        {#if error}
          <span data-account-delete-error class="text-sm text-destructive">{error}</span>
        {/if}
        <div class="flex gap-2">
          <button
            type="submit"
            data-account-delete-verify
            class="h-9 rounded-md bg-destructive px-3 text-sm text-destructive-foreground"
          >Verify and continue</button>
          <button
            type="button"
            data-account-delete-cancel
            class="h-9 rounded-md border border-border px-3 text-sm"
            onclick={cancelDelete}
          >Cancel</button>
        </div>
      </form>
    {:else if stage === "verified"}
      <h2 class="text-base font-medium">Final confirmation</h2>
      <p class="text-xs text-muted-foreground">Your account will be scheduled for deletion. You can sign back in within 30 days to cancel.</p>
      <div class="mt-3 flex gap-2">
        <button
          type="button"
          data-account-delete-confirm
          class="h-9 rounded-md bg-destructive px-3 text-sm text-destructive-foreground"
          onclick={scheduleDeletion}
        >Schedule deletion</button>
        <button
          type="button"
          data-account-delete-cancel
          class="h-9 rounded-md border border-border px-3 text-sm"
          onclick={cancelDelete}
        >Cancel</button>
      </div>
    {:else if stage === "scheduled" && auditEntry}
      <h2 class="text-base font-medium">Account scheduled for deletion</h2>
      <p data-account-delete-audit class="text-sm">
        Audit: deleted_at={auditEntry.deletedAt}, reason={auditEntry.reason ?? "(not provided)"}
      </p>
    {/if}
  </section>
</section>
