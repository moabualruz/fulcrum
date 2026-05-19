<script lang="ts">
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import { tick } from "svelte";

  type PerfTask = {
    id: string;
    title: string;
    status: "Ready" | "Running" | "Blocked" | "Done";
    owner: string;
    priority: "P0" | "P1" | "P2" | "P3";
  };

  const ROW_COUNT = 10_000;
  const ROW_HEIGHT = 48;
  const OVERSCAN = 10;
  const statuses: PerfTask["status"][] = ["Ready", "Running", "Blocked", "Done"];
  const owners = ["Maya", "Omar", "Jules", "Nora", "Kenji"];
  const priorities: PerfTask["priority"][] = ["P0", "P1", "P2", "P3"];

  const tasks: PerfTask[] = Array.from({ length: ROW_COUNT }, (_, index) => ({
    id: `perf-task-${index + 1}`,
    title: `Repository workload row ${index + 1}`,
    status: statuses[index % statuses.length]!,
    owner: owners[index % owners.length]!,
    priority: priorities[index % priorities.length]!,
  }));

  let scrollElement = $state<HTMLDivElement>();
  let selectedIds = $state<Set<string>>(new Set());
  let lastSelectedIndex = $state<number | null>(null);
  let jumpRow = $state("5000");
  let scrollElementBound = $state(false);

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    get count() {
      return tasks.length;
    },
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  $effect(() => {
    if (!scrollElement || scrollElementBound) return;
    scrollElementBound = true;
    $virtualizer.setOptions({
      getScrollElement: () => scrollElement,
    });
    $virtualizer.measure();
  });

  const virtualItems = $derived($virtualizer.getVirtualItems());
  const totalSize = $derived($virtualizer.getTotalSize());
  const firstVirtualIndex = $derived(virtualItems[0]?.index ?? 0);
  const lastVirtualIndex = $derived(virtualItems[virtualItems.length - 1]?.index ?? 0);

  type SelectionModifiers = Pick<MouseEvent | KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey">;

  function selectRow(index: number, modifiers: SelectionModifiers): void {
    const task = tasks[index];
    if (!task) return;

    if (modifiers.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const next = new Set(selectedIds);
      for (let i = start; i <= end; i += 1) {
        const row = tasks[i];
        if (row) next.add(row.id);
      }
      selectedIds = next;
      return;
    }

    const next = modifiers.metaKey || modifiers.ctrlKey ? new Set(selectedIds) : new Set<string>();
    if (next.has(task.id)) {
      next.delete(task.id);
    } else {
      next.add(task.id);
    }
    selectedIds = next;
    lastSelectedIndex = index;
  }

  function selectRowFromKeyboard(index: number, event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectRow(index, event);
  }

  async function scrollToRequestedRow(): Promise<void> {
    const index = Math.max(0, Math.min(tasks.length - 1, Number(jumpRow) - 1));
    $virtualizer.scrollToIndex(index, { align: "center", behavior: "auto" });
    await tick();
  }
</script>

<svelte:head>
  <title>Performance virtualization fixture</title>
</svelte:head>

<section
  data-cross-cutting-perf
  data-row-count={ROW_COUNT}
  data-virtual-overscan={OVERSCAN}
  data-virtual-row-height={ROW_HEIGHT}
  class="min-h-screen bg-background text-foreground"
>
  <div class="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 md:p-6">
    <header class="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Performance</p>
        <h1 class="text-2xl font-semibold">Virtualized workload list</h1>
      </div>
      <div class="grid grid-cols-3 gap-2 text-right text-xs text-muted-foreground">
        <span data-total-rows class="rounded-md border border-border px-3 py-2">
          <strong class="block text-base text-foreground">{ROW_COUNT.toLocaleString()}</strong>
          rows
        </span>
        <span data-rendered-rows class="rounded-md border border-border px-3 py-2">
          <strong class="block text-base text-foreground">{virtualItems.length}</strong>
          rendered
        </span>
        <span data-selected-count class="rounded-md border border-border px-3 py-2">
          <strong class="block text-base text-foreground">{selectedIds.size}</strong>
          selected
        </span>
      </div>
    </header>

    <form
      class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3"
      onsubmit={(event) => {
        event.preventDefault();
        void scrollToRequestedRow();
      }}
    >
      <label class="text-sm font-medium" for="perf-jump-row">Jump to row</label>
      <input
        id="perf-jump-row"
        data-jump-input
        class="h-9 w-28 rounded-md border border-input bg-background px-2 text-sm"
        type="number"
        min="1"
        max={ROW_COUNT}
        bind:value={jumpRow}
      />
      <button data-jump-button class="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" type="submit">
        Go
      </button>
      <span class="text-xs text-muted-foreground">Visible range {firstVirtualIndex + 1}-{lastVirtualIndex + 1}</span>
    </form>

    <div class="overflow-hidden rounded-md border border-border bg-card">
      <div class="grid h-10 grid-cols-[72px_1fr_120px_120px_80px] items-center border-b border-border bg-muted/40 px-3 text-xs font-semibold text-muted-foreground">
        <span>Row</span>
        <span>Task</span>
        <span>Status</span>
        <span>Owner</span>
        <span>Priority</span>
      </div>

      <div
        bind:this={scrollElement}
        data-virtual-scroll
        class="relative h-[520px] overflow-auto"
        style="contain: strict;"
        role="listbox"
        tabindex="0"
        aria-multiselectable="true"
        aria-label="Virtualized workload rows"
      >
        <div data-virtual-spacer style={`height: ${totalSize}px; position: relative;`}>
          {#each virtualItems as virtualRow (virtualRow.key)}
            {@const task = tasks[virtualRow.index]}
            {#if task}
              <div
                data-virtual-row
                data-row-index={virtualRow.index + 1}
                data-selected={selectedIds.has(task.id)}
                class="absolute left-0 right-0 grid grid-cols-[72px_1fr_120px_120px_80px] items-center gap-0 border-b border-border px-3 text-sm hover:bg-muted/40 data-[selected=true]:bg-primary/10"
                style={`height: ${virtualRow.size}px; transform: translateY(${virtualRow.start}px);`}
                role="option"
                tabindex="0"
                aria-selected={selectedIds.has(task.id)}
                onclick={(event) => selectRow(virtualRow.index, event)}
                onkeydown={(event) => selectRowFromKeyboard(virtualRow.index, event)}
              >
                <span class="font-mono text-xs text-muted-foreground">{virtualRow.index + 1}</span>
                <span class="min-w-0 truncate font-medium">{task.title}</span>
                <span>{task.status}</span>
                <span>{task.owner}</span>
                <span>{task.priority}</span>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  </div>
</section>
