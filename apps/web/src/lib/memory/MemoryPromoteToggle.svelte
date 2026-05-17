<script lang="ts">
  import { memoryPromoteApiPath, memoryPublicApiHeaders } from "./memory-browser.ts";

  interface Props {
    memoryId: string;
    isGlobal: boolean;
    authorization?: string;
    onPromoted?: (id: string) => void;
  }

  let { memoryId, isGlobal, authorization, onPromoted }: Props = $props();

  let confirming = $state(false);
  let loading = $state(false);
  let error = $state("");

  async function promote(): Promise<void> {
    loading = true;
    error = "";
    try {
      const res = await fetch(memoryPromoteApiPath(memoryId), {
        method: "POST",
        credentials: "include",
        headers: memoryPublicApiHeaders({ authorization }),
      });
      if (!res.ok) throw new Error(`Memory promote failed: ${res.status}`);
      confirming = false;
      onPromoted?.(memoryId);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Promote failed";
    } finally {
      loading = false;
    }
  }
</script>

{#if isGlobal}
  <span
    data-global-badge
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary text-primary-foreground opacity-60 cursor-default select-none"
  >
    Global
  </span>
{:else if confirming}
  <span class="inline-flex items-center gap-1.5 text-xs">
    <span class="text-muted-foreground">Promote to global?</span>
    <button
      data-promote-confirm
      type="button"
      disabled={loading}
      onclick={promote}
      class="font-medium text-primary hover:underline disabled:opacity-50"
    >
      {loading ? "Promoting…" : "Yes"}
    </button>
    <button
      data-promote-cancel
      type="button"
      onclick={() => { confirming = false; error = ""; }}
      class="text-muted-foreground hover:text-foreground"
    >
      Cancel
    </button>
  </span>
  {#if error}
    <p class="text-xs text-destructive mt-0.5">{error}</p>
  {/if}
{:else}
  <button
    data-promote-toggle
    type="button"
    onclick={() => (confirming = true)}
    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border border-border bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
  >
    Make Global
  </button>
{/if}
