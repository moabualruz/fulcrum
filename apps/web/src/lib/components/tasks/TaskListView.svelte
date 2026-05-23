<script lang="ts">
  import { cn, Select } from "@fulcrum/ui-kit";
  import {
    createSvelteTable,
    flexRender,
    getCoreRowModel,
    getSortedRowModel,
    getGroupedRowModel,
    getExpandedRowModel,
    type ColumnDef,
    type SortingState,
    type GroupingState,
    type ExpandedState,
  } from "@tanstack/svelte-table";
  import { createVirtualizer } from "@tanstack/svelte-virtual";
  import type { TaskCardTask } from "./TaskCard.svelte";
  import {
    fetchSavedTaskView,
    fetchTaskList,
    savedTaskViewColumns,
    updateTaskListFields,
    type TaskListRow,
  } from "./task-list-api";

  interface Props {
    projectId: string;
    orgId?: string;
    currentUserId?: string;
    savedViewId?: string;
  }

  const { projectId, orgId = "", currentUserId = "", savedViewId }: Props = $props();

  // ── State ──
  let tasks = $state<TaskCardTask[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let sorting = $state<SortingState>([]);
  let grouping = $state<GroupingState>([]);
  let expanded = $state<ExpandedState>({});
  let editingCell = $state<{ rowId: string; colId: string } | null>(null);
  let editValue = $state("");

  // Visible columns loaded from SavedView if provided (D-15)
  let visibleColIds = $state<string[]>([
    "type",
    "title",
    "status",
    "priority",
    "assignee",
    "points",
    "labels",
    "due_date",
  ]);

  // ── Load ──
  async function loadTasks() {
    loading = true;
    error = null;
    try {
      const raw = await fetchTaskList(fetch, { orgId, userId: currentUserId, projectId });
      tasks = (raw ?? []).map(normalizeTask);
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load tasks";
    } finally {
      loading = false;
    }
  }

  async function loadSavedView() {
    if (!savedViewId) return;
    try {
      const columns = savedTaskViewColumns(await fetchSavedTaskView(fetch, { savedViewId }));
      if (columns.length > 0) {
        visibleColIds = columns;
      }
    } catch {
      // non-fatal: use default columns
    }
  }

  $effect(() => {
    void loadTasks();
    void loadSavedView();
  });

  // ── Inline edit ──
  function startEdit(rowId: string, colId: string, currentValue: string) {
    editingCell = { rowId, colId };
    editValue = currentValue;
  }

  async function commitEdit(taskId: string, field: string) {
    if (!editingCell) return;
    editingCell = null;
    const patch: Record<string, unknown> = {};
    if (field === "status") patch.status = editValue;
    else if (field === "title") patch.title = editValue;
    else if (field === "priority") patch.priority = Number(editValue);
    else if (field === "points") patch.points = Number(editValue);
    else if (field === "assignee") patch.assigneeId = editValue;
    else return;

    // Optimistic update
    tasks = tasks.map((t) =>
      t.id === taskId ? { ...t, ...patch } : t
    );
    try {
      await updateTaskListFields(fetch, {
        orgId,
        userId: currentUserId,
        projectId,
        taskId,
        patch,
      });
    } catch {
      // revert by reloading
      void loadTasks();
    }
  }

  // ── Priority display ──
  const priorityLabels: Record<number, string> = {
    4: "Urgent",
    3: "High",
    2: "Medium",
    1: "Low",
    0: "None",
  };

  const typeIcons: Record<string, string> = {
    epic: "◆",
    task: "●",
    subtask: "○",
    bug: "⚠",
  };

  // ── Column definitions (D-14, D-78) ──
  const allColumns: ColumnDef<TaskCardTask>[] = [
    {
      id: "type",
      header: "Type",
      accessorFn: (row) => row.taskType ?? "task",
      cell: (info) => typeIcons[info.getValue<string>()] ?? "●",
      enableSorting: false,
      size: 50,
    },
    {
      id: "title",
      header: "Title",
      accessorKey: "title",
      size: 320,
    },
    {
      id: "status",
      header: "Status",
      accessorKey: "status",
      size: 130,
    },
    {
      id: "priority",
      header: "Priority",
      accessorFn: (row) =>
        row.priority != null ? (priorityLabels[row.priority] ?? String(row.priority)) : "None",
      size: 100,
    },
    {
      id: "assignee",
      header: "Assignee",
      accessorFn: (row) => row.assignee ?? "Unassigned",
      size: 120,
    },
    {
      id: "points",
      header: "Points",
      accessorFn: (row) => row.points ?? "",
      size: 70,
    },
    {
      id: "labels",
      header: "Labels",
      accessorFn: (row) => (row.labels ?? []).join(", "),
      size: 140,
      enableSorting: false,
    },
  ];

  // ── Visible columns (D-15) ──
  const visibleColumns = $derived(
    allColumns.filter((c) => visibleColIds.includes(c.id as string))
  );

  // ── Table ──
  const table = $derived(
    createSvelteTable<TaskCardTask>({
      get data() {
        return tasks;
      },
      get columns() {
        return visibleColumns;
      },
      getCoreRowModel: getCoreRowModel(),
      getSortedRowModel: getSortedRowModel(),
      getGroupedRowModel: getGroupedRowModel(),
      getExpandedRowModel: getExpandedRowModel(),
      state: {
        get sorting() {
          return sorting;
        },
        get grouping() {
          return grouping;
        },
        get expanded() {
          return expanded;
        },
      },
      onSortingChange: (updater) => {
        sorting = typeof updater === "function" ? updater(sorting) : updater;
      },
      onGroupingChange: (updater) => {
        grouping = typeof updater === "function" ? updater(grouping) : updater;
      },
      onExpandedChange: (updater) => {
        expanded = typeof updater === "function" ? updater(expanded) : updater;
      },
    })
  );

  // ── Virtual scroll ──
  let containerEl = $state<HTMLDivElement | undefined>();

  const rows = $derived(table.getRowModel().rows);

  const virtualizer = $derived(
    containerEl
      ? createVirtualizer<HTMLDivElement, HTMLTableRowElement>({
          get count() {
            return rows.length;
          },
          getScrollElement: () => containerEl!,
          estimateSize: () => 40,
          overscan: 10,
        })
      : null
  );

  const virtualItems = $derived(virtualizer?.getVirtualItems() ?? []);
  const totalSize = $derived(virtualizer?.getTotalSize() ?? 0);

  // ── Editable cell ids ──
  const editableCols = new Set(["title", "status", "priority", "assignee", "points"]);

  function cellValue(task: TaskCardTask, colId: string): string {
    if (colId === "title") return task.title;
    if (colId === "status") return task.status ?? "";
    if (colId === "priority") return String(task.priority ?? 0);
    if (colId === "assignee") return task.assignee ?? "";
    if (colId === "points") return String(task.points ?? "");
    return "";
  }

  function normalizeTask(row: TaskListRow): TaskCardTask {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      points: row.points,
      parentId: row.parentId,
      dependencies: { blocks: [], blocked_by: [] },
      descriptionText: row.descriptionText ?? undefined,
      assignee: row.assigneeId,
      taskType: row.parentId ? "subtask" : "task",
    };
  }
</script>

<section data-task-list-view data-testid="task-list-table" data-project-id={projectId} class="flex h-full flex-col gap-3">
  <!-- Toolbar -->
  <div class="flex flex-wrap items-center gap-2">
    <!-- Column visibility (D-15) -->
    <details class="relative">
      <summary class="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs">Columns</summary>
      <div class="absolute left-0 z-10 mt-1 min-w-40 rounded-md border border-border bg-background p-2 shadow-md">
        {#each allColumns as col (col.id)}
          <label class="flex items-center gap-2 py-0.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={visibleColIds.includes(col.id as string)}
              onchange={(e) => {
                const id = col.id as string;
                if ((e.target as HTMLInputElement).checked) {
                  visibleColIds = [...visibleColIds, id];
                } else {
                  visibleColIds = visibleColIds.filter((c) => c !== id);
                }
              }}
            />
            {typeof col.header === "string" ? col.header : col.id}
          </label>
        {/each}
      </div>
    </details>
  </div>

  <!-- Table container (virtual scroll) -->
  {#if loading}
    <div class="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>
  {:else if error}
    <div class="flex flex-1 items-center justify-center text-sm text-destructive">{error}</div>
  {:else}
    <div
      bind:this={containerEl}
      class="relative flex-1 overflow-auto rounded-md border border-border"
    >
      <table class="w-full caption-bottom text-sm border-collapse">
        <thead class="sticky top-0 z-10 bg-background border-b border-border">
          {#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
            <tr>
              {#each headerGroup.headers as header (header.id)}
                <th
                  data-column-header={header.id}
                  class={cn(
                    "h-10 px-3 text-left align-middle text-xs font-semibold text-muted-foreground",
                    header.column.getCanSort() && "cursor-pointer select-none hover:text-foreground"
                  )}
                  style={`width: ${header.column.getSize()}px`}
                  onclick={header.column.getCanSort()
                    ? () => header.column.toggleSorting()
                    : undefined}
                >
                  <span class="inline-flex items-center gap-1">
                    {#if typeof header.column.columnDef.header === "string"}
                      {header.column.columnDef.header}
                    {:else}
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    {/if}
                    {#if header.column.getIsSorted() === "asc"}↑{/if}
                    {#if header.column.getIsSorted() === "desc"}↓{/if}
                  </span>
                </th>
              {/each}
            </tr>
          {/each}
        </thead>

        <tbody style={`height: ${totalSize}px; position: relative;`}>
          {#each virtualItems as vRow (vRow.index)}
            {@const row = rows[vRow.index]}
            <tr
              data-task-row
              data-testid="task-row"
              data-task-id={row.original.id}
              data-index={vRow.index}
              class={cn(
                "absolute left-0 right-0 border-b border-border hover:bg-muted/50 transition-colors",
                row.original.parentId && "pl-6 text-muted-foreground"
              )}
              style={`top: ${vRow.start}px; height: ${vRow.size}px;`}
            >
              {#each row.getVisibleCells() as cell (cell.id)}
                {@const colId = cell.column.id}
                {@const task = row.original}
                {@const isEditing = editingCell?.rowId === row.id && editingCell?.colId === colId}
                <td
                  class="px-3 align-middle"
                  style={`width: ${cell.column.getSize()}px;`}
                >
                  {#if isEditing}
                    {#if colId === "status"}
                      <select
                        data-inline-edit={colId}
                        class="h-7 w-full rounded border border-input bg-background px-1 text-xs"
                        bind:value={editValue}
                        onblur={() => void commitEdit(task.id, colId)}
                        onchange={() => void commitEdit(task.id, colId)}
                      >
                        {#each ["pending", "in_progress", "blocked", "completed", "cancelled"] as s (s)}
                          <option value={s} selected={task.status === s}>{s}</option>
                        {/each}
                      </select>
                    {:else if colId === "priority"}
                      <select
                        data-inline-edit={colId}
                        class="h-7 w-full rounded border border-input bg-background px-1 text-xs"
                        bind:value={editValue}
                        onblur={() => void commitEdit(task.id, colId)}
                        onchange={() => void commitEdit(task.id, colId)}
                      >
                        {#each [[4, "Urgent"], [3, "High"], [2, "Medium"], [1, "Low"], [0, "None"]] as [v, label] ([v])}
                          <option value={String(v)} selected={task.priority === v}>{label}</option>
                        {/each}
                      </select>
                    {:else}
                      <input
                        data-inline-edit={colId}
                        type="text"
                        class="h-7 w-full rounded border border-input bg-background px-2 text-xs"
                        bind:value={editValue}
                        onblur={() => void commitEdit(task.id, colId)}
                        onkeydown={(e) => {
                          if (e.key === "Enter") void commitEdit(task.id, colId);
                          if (e.key === "Escape") editingCell = null;
                        }}
                      />
                    {/if}
                  {:else}
                    <span
                      class={cn(
                        "block truncate",
                        editableCols.has(colId) && "cursor-pointer hover:underline",
                        colId === "type" && "text-center"
                      )}
                      onclick={editableCols.has(colId)
                        ? () => startEdit(row.id, colId, cellValue(task, colId))
                        : undefined}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </span>
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>
