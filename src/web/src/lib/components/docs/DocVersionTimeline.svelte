<script lang="ts">
  import { cn } from "$lib/utils.js";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as ScrollArea from "$lib/components/ui/scroll-area";
  import { buttonVariants } from "$lib/components/ui/button";
  import HistoryIcon from "@lucide/svelte/icons/history";
  import UserIcon from "@lucide/svelte/icons/user";
  import RotateCcwIcon from "@lucide/svelte/icons/rotate-ccw";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";

  interface Version {
    id: string;
    versionNum: number;
    createdAt: Date | string;
    authorId: string | null;
    authorName: string | null;
    isRestoreOf: string | null;
  }

  interface Props {
    documentId: string;
    currentVersionId?: string | null;
    versions?: Version[];
    onRestore?: (versionId: string) => Promise<void>;
    onFetchDiff?: (versionId: string) => Promise<{ html: string; hasDiff: boolean }>;
    open?: boolean;
  }

  let {
    documentId,
    currentVersionId = null,
    versions = [],
    onRestore,
    onFetchDiff,
    open = $bindable(false),
  }: Props = $props();

  // Per-version UI state
  let showDiff = $state<Record<string, boolean>>({});
  let diffHtml = $state<Record<string, string>>({});
  let diffLoading = $state<Record<string, boolean>>({});
  let confirmRestore = $state<string | null>(null);
  let restoreLoading = $state(false);

  function formatRelative(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 30) return `${diffD}d ago`;
    return d.toLocaleDateString();
  }

  async function toggleDiff(versionId: string) {
    if (showDiff[versionId]) {
      showDiff = { ...showDiff, [versionId]: false };
      return;
    }
    if (!diffHtml[versionId] && onFetchDiff) {
      diffLoading = { ...diffLoading, [versionId]: true };
      try {
        const result = await onFetchDiff(versionId);
        diffHtml = { ...diffHtml, [versionId]: result.html };
      } finally {
        diffLoading = { ...diffLoading, [versionId]: false };
      }
    }
    showDiff = { ...showDiff, [versionId]: true };
  }

  async function handleRestore(versionId: string) {
    if (!onRestore) return;
    restoreLoading = true;
    try {
      await onRestore(versionId);
      confirmRestore = null;
      open = false;
    } finally {
      restoreLoading = false;
    }
  }

  function isCurrentVersion(v: Version): boolean {
    return currentVersionId ? v.id === currentVersionId : v === versions[0];
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content side="right" class={cn("w-[360px] p-0")}>
    <Sheet.Header class={cn("border-b border-border px-4 py-3")}>
      <Sheet.Title class={cn("flex items-center gap-2 text-base")}>
        <HistoryIcon class={cn("size-4")} />
        Version history
      </Sheet.Title>
    </Sheet.Header>

    <ScrollArea.Root class={cn("h-[calc(100vh-60px)]")}>
      <ScrollArea.Viewport class={cn("px-0 py-2")}>
        {#if versions.length === 0}
          <p class={cn("px-4 py-8 text-sm text-muted-foreground text-center")}>No versions yet.</p>
        {:else}
          <ol class={cn("flex flex-col")}>
            {#each versions as version (version.id)}
              {@const isCurrent = isCurrentVersion(version)}
              <li
                data-version-item
                data-version-id={version.id}
                class={cn("border-b border-border last:border-0")}
              >
                <!-- Version header row -->
                <div class={cn("flex items-center gap-2 px-4 py-3")}>
                  <!-- Current / history indicator -->
                  <span class={cn("shrink-0")}>
                    {#if isCurrent}
                      <span
                        data-current-version
                        class={cn("flex size-3 rounded-full bg-primary")}
                        title="Current version"
                      ></span>
                    {:else}
                      <span class={cn("flex size-3 rounded-full border-2 border-muted-foreground/50")}></span>
                    {/if}
                  </span>

                  <!-- Author avatar placeholder -->
                  <span class={cn("grid size-4 shrink-0 place-items-center rounded-full bg-muted text-[8px] text-muted-foreground")}>
                    {#if version.authorName}
                      {version.authorName[0]?.toUpperCase() ?? "?"}
                    {:else}
                      <UserIcon class={cn("size-3")} />
                    {/if}
                  </span>

                  <!-- Timestamp + version label -->
                  <div class={cn("min-w-0 flex-1")}>
                    <p class={cn("text-sm font-medium truncate")}>
                      v{version.versionNum}
                      {#if isCurrent}
                        <span class={cn("ml-1 text-xs text-primary font-semibold")}>Current</span>
                      {/if}
                      {#if version.isRestoreOf}
                        <span class={cn("ml-1 text-xs text-muted-foreground")}>(restored)</span>
                      {/if}
                    </p>
                    <p class={cn("text-xs text-muted-foreground")}>
                      {formatRelative(version.createdAt)}
                      {#if version.authorName}
                        · {version.authorName}
                      {/if}
                    </p>
                  </div>

                  <!-- Show diff toggle -->
                  <button
                    data-show-diff={version.id}
                    class={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-7 shrink-0")}
                    onclick={() => toggleDiff(version.id)}
                    title={showDiff[version.id] ? "Hide diff" : "Show diff"}
                    aria-expanded={showDiff[version.id] ?? false}
                  >
                    {#if showDiff[version.id]}
                      <ChevronDownIcon class={cn("size-3.5")} />
                    {:else}
                      <ChevronRightIcon class={cn("size-3.5")} />
                    {/if}
                  </button>

                  <!-- Restore button (not shown for current version) -->
                  {#if !isCurrent}
                    <button
                      data-restore-version={version.id}
                      class={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-7 shrink-0")}
                      onclick={() => { confirmRestore = version.id; }}
                      title="Restore this version"
                    >
                      <RotateCcwIcon class={cn("size-3.5")} />
                    </button>
                  {/if}
                </div>

                <!-- Inline diff panel -->
                {#if showDiff[version.id]}
                  <div class={cn("px-4 pb-3")}>
                    {#if diffLoading[version.id]}
                      <p class={cn("text-xs text-muted-foreground animate-pulse")}>Loading diff…</p>
                    {:else if diffHtml[version.id]}
                      <div
                        data-diff-html
                        class={cn("text-xs rounded border border-border bg-muted/30 p-2 overflow-auto max-h-48 font-mono leading-relaxed [&_del]:bg-red-100 [&_del]:text-red-700 [&_del]:line-through [&_ins]:bg-green-100 [&_ins]:text-green-700 [&_ins]:no-underline")}
                        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                      >{@html diffHtml[version.id]}</div>
                    {:else}
                      <p class={cn("text-xs text-muted-foreground")}>No diff available for this version.</p>
                    {/if}
                  </div>
                {/if}

                <!-- Inline restore confirm row -->
                {#if confirmRestore === version.id}
                  <div
                    data-restore-confirm={version.id}
                    class={cn("flex items-center gap-2 px-4 pb-3 text-sm")}
                  >
                    <span class={cn("flex-1 text-muted-foreground")}>Restore to v{version.versionNum}?</span>
                    <button
                      data-confirm-restore
                      class={cn(buttonVariants({ variant: "default", size: "sm" }), "h-7 px-3 text-xs")}
                      disabled={restoreLoading}
                      onclick={() => handleRestore(version.id)}
                    >
                      {restoreLoading ? "Restoring…" : "Confirm"}
                    </button>
                    <button
                      data-cancel-restore
                      class={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-7 px-3 text-xs")}
                      onclick={() => { confirmRestore = null; }}
                    >
                      Cancel
                    </button>
                  </div>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" />
    </ScrollArea.Root>
  </Sheet.Content>
</Sheet.Root>
