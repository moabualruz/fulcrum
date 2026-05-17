<script lang="ts">
  import { onMount } from "svelte";
  import MemoryPromoteToggle from "./MemoryPromoteToggle.svelte";
  import type { MemoryRow } from "./memory-browser.ts";
  import {
    createDebouncedMemorySearch,
    memoryDeleteApiPath,
    memoryListApiPath,
    memoryPublicApiHeaders,
    memorySearchApiPath,
    previewMemory,
  } from "./memory-browser.ts";

  interface Props {
    projectId?: string;
    authorization?: string;
  }

  const { projectId, authorization }: Props = $props();

  let memories = $state<MemoryRow[]>([]);
  let loading = $state(true);
  let error = $state("");
  let searchTerm = $state("");
  let deleteTargetId = $state<string | null>(null);
  let deleting = $state(false);
  let deleteError = $state("");

  const importanceBadgeClass: Record<string, string> = {
    high: "bg-primary text-primary-foreground",
    medium: "bg-secondary text-secondary-foreground border border-border",
    low: "border border-border bg-transparent text-muted-foreground",
  };

  async function fetchMemories(term?: string): Promise<void> {
    loading = true;
    error = "";
    try {
      const res = await fetch(
        term ? memorySearchApiPath(term, { projectId }) : memoryListApiPath({ projectId }),
        {
          method: "GET",
          credentials: "include",
          headers: memoryPublicApiHeaders({ authorization }),
        },
      );
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const payload = await res.json();
      const data = Array.isArray(payload) ? payload : payload?.data ?? payload?.items ?? [];
      memories = Array.isArray(data) ? data : [];
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Failed to load memories";
    } finally {
      loading = false;
    }
  }

  const debouncedSearch = createDebouncedMemorySearch((term: string) => {
    void fetchMemories(term || undefined);
  }, 300);

  function onSearchInput(e: Event): void {
    const val = (e.currentTarget as HTMLInputElement).value;
    searchTerm = val;
    debouncedSearch(val);
  }

  async function deleteMemory(id: string): Promise<void> {
    deleting = true;
    deleteError = "";
    try {
      const res = await fetch(memoryDeleteApiPath(id), {
        method: "DELETE",
        credentials: "include",
        headers: memoryPublicApiHeaders({ authorization }),
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      memories = memories.filter((m) => m.id !== id);
      deleteTargetId = null;
    } catch (cause) {
      deleteError = cause instanceof Error ? cause.message : "Delete failed";
    } finally {
      deleting = false;
    }
  }

  function handlePromoted(id: string): void {
    memories = memories.map((m) => (m.id === id ? { ...m, global: true, importance: "high" as const } : m));
  }

  onMount(() => { void fetchMemories(); });
</script>

<div data-memory-browser class="flex flex-col gap-4">
  <!-- Search input -->
  <div class="relative">
    <input
      data-memory-search
      type="search"
      placeholder="Search memories…"
      value={searchTerm}
      oninput={onSearchInput}
      class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    />
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12 text-sm text-muted-foreground">
      Loading…
    </div>
  {:else if error}
    <div class="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error}
    </div>
  {:else if memories.length === 0}
    <div data-empty-state class="flex flex-col items-center justify-center py-16 gap-2 text-center">
      <p class="text-sm font-medium text-foreground">No memories yet.</p>
      <p class="text-sm text-muted-foreground">
        Run an agent task to start building project memory.
      </p>
    </div>
  {:else}
    <div class="rounded-md border border-border overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
            <th class="px-4 py-3 min-w-[240px]">Body</th>
            <th class="px-4 py-3 w-[110px]">Importance</th>
            <th class="px-4 py-3 w-[150px]">Project</th>
            <th class="px-4 py-3 w-[110px]">Global</th>
            <th class="px-4 py-3 w-[80px]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each memories as memory (memory.id)}
            <tr
              data-memory-row
              data-memory-id={memory.id}
              class="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
            >
              <!-- Body (truncated 2 lines) -->
              <td class="px-4 py-3">
                <p class="line-clamp-2 text-sm text-foreground">
                  {previewMemory(memory.body)}
                </p>
              </td>

              <!-- Importance badge -->
              <td class="px-4 py-3">
                <span
                  data-importance={memory.importance}
                  class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${importanceBadgeClass[memory.importance] ?? importanceBadgeClass.low}`}
                >
                  {memory.importance}
                </span>
              </td>

              <!-- Project -->
              <td class="px-4 py-3 text-muted-foreground">
                {memory.projectId ?? "—"}
              </td>

              <!-- Global toggle -->
              <td class="px-4 py-3">
                <MemoryPromoteToggle
                  memoryId={memory.id}
                  isGlobal={memory.global}
                  authorization={authorization}
                  onPromoted={handlePromoted}
                />
              </td>

              <!-- Actions -->
              <td class="px-4 py-3">
                <button
                  data-delete-memory={memory.id}
                  type="button"
                  onclick={() => { deleteTargetId = memory.id; deleteError = ""; }}
                  class="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label="Delete memory"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"></path>
                    <path d="M10 11v6M14 11v6"></path>
                    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"></path>
                  </svg>
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<!-- Delete confirmation dialog -->
{#if deleteTargetId !== null}
  <div
    role="dialog"
    aria-modal="true"
    aria-labelledby="delete-dialog-title"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  >
    <div class="w-full max-w-sm rounded-lg bg-background border border-border shadow-lg p-6">
      <h2 id="delete-dialog-title" class="text-base font-semibold text-foreground mb-2">
        Delete memory?
      </h2>
      <p class="text-sm text-muted-foreground mb-6">
        This memory will be permanently deleted. This action cannot be undone.
      </p>
      {#if deleteError}
        <p class="text-xs text-destructive mb-3">{deleteError}</p>
      {/if}
      <div class="flex justify-end gap-3">
        <button
          data-delete-cancel
          type="button"
          onclick={() => { deleteTargetId = null; deleteError = ""; }}
          class="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          data-delete-confirm
          type="button"
          disabled={deleting}
          onclick={() => deleteTargetId && deleteMemory(deleteTargetId)}
          class="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  </div>
{/if}
