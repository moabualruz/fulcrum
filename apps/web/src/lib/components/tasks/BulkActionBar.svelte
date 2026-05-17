<script lang="ts">
  /**
   * BulkActionBar — multi-select bulk action toolbar.
   */
  import { createEventDispatcher } from "svelte";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import BulkCustomFieldEdit from "./BulkCustomFieldEdit.svelte";
  import {
    submitBulkTaskCustomFieldPatch,
    submitBulkTaskMutation,
  } from "./task-table";

  // ── Props ──────────────────────────────────────────────────────────
  interface Props {
    selectedTaskIds?: string[];
    projectId?: string;
    orgId?: string;
    currentUserId?: string;
    customFieldDefs?: Array<{
      id: string;
      name: string;
      fieldType: string;
      config?: Record<string, unknown>;
    }>;
  }

  let { selectedTaskIds = [], projectId = "", orgId = "", currentUserId = "", customFieldDefs = [] }: Props = $props();

  const dispatch = createEventDispatcher<{
    done: { action: string; taskIds: string[] };
    error: { action: string; error: string };
  }>();

  // ── Constants ──────────────────────────────────────────────────────
  const MAX_BULK = 200;

  const isOverLimit = $derived(selectedTaskIds.length > MAX_BULK);
  const count = $derived(selectedTaskIds.length);

  // ── Action state ───────────────────────────────────────────────────
  let loading = false;
  let activeAction: string | null = null;

  // Pickers state
  let statusValue = "";
  let priorityValue = "";
  let assigneeValue = "";
  let labelValue = "";
  let dueDateValue = "";
  let sprintValue = "";
  let showCustomFieldEdit = false;

  const STATUS_OPTIONS = [
    { value: "backlog", label: "Backlog" },
    { value: "todo", label: "To Do" },
    { value: "in_progress", label: "In Progress" },
    { value: "done", label: "Done" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const PRIORITY_OPTIONS = [
    { value: "0", label: "Urgent" },
    { value: "1", label: "High" },
    { value: "2", label: "Medium" },
    { value: "3", label: "Low" },
    { value: "4", label: "No Priority" },
  ];

  // ── Helpers ────────────────────────────────────────────────────────
  async function mutate(patch: Record<string, unknown>) {
    if (isOverLimit) return;
    loading = true;
    try {
      await submitBulkTaskMutation(fetch, {
        kind: "update",
        input: { ids: selectedTaskIds, patch },
      }, { orgId, userId: currentUserId, projectId });
      dispatch("done", { action: "bulkUpdate", taskIds: selectedTaskIds });
    } catch (err) {
      dispatch("error", { action: "bulkUpdate", error: String(err) });
    } finally {
      loading = false;
      activeAction = null;
    }
  }

  async function handleSetStatus() {
    if (!statusValue) return;
    await mutate({ status: statusValue });
    statusValue = "";
  }

  async function handleSetPriority() {
    if (!priorityValue) return;
    await mutate({ priority: Number(priorityValue) });
    priorityValue = "";
  }

  async function handleSetAssignee() {
    if (!assigneeValue) return;
    await mutate({ assigneeId: assigneeValue });
    assigneeValue = "";
  }

  async function handleAddLabel() {
    if (!labelValue) return;
    dispatchUnsupported("addLabel");
    labelValue = "";
  }

  async function handleRemoveLabel() {
    if (!labelValue) return;
    dispatchUnsupported("removeLabel");
    labelValue = "";
  }

  async function handleSetDueDate() {
    if (!dueDateValue) return;
    dispatchUnsupported("dueDate");
    dueDateValue = "";
  }

  async function handleMoveToSprint() {
    if (!sprintValue) return;
    if (isOverLimit) return;
    loading = true;
    try {
      await submitBulkTaskMutation(fetch, {
        kind: "assignSprint",
        input: { ids: selectedTaskIds, sprintId: sprintValue },
      }, { orgId, userId: currentUserId, projectId });
      dispatch("done", { action: "assignSprint", taskIds: selectedTaskIds });
    } catch (err) {
      dispatch("error", { action: "assignSprint", error: String(err) });
    } finally {
      loading = false;
      activeAction = null;
    }
    sprintValue = "";
  }

  async function handleArchive() {
    if (isOverLimit) return;
    loading = true;
    try {
      await submitBulkTaskMutation(fetch, {
        kind: "delete",
        input: { ids: selectedTaskIds },
      }, { orgId, userId: currentUserId, projectId });
      dispatch("done", { action: "archive", taskIds: selectedTaskIds });
    } catch (err) {
      dispatch("error", { action: "archive", error: String(err) });
    } finally {
      loading = false;
    }
  }

  async function handleDelete() {
    if (isOverLimit) return;
    if (!confirm(`Delete ${count} task${count === 1 ? "" : "s"}? This cannot be undone.`)) return;
    loading = true;
    try {
      await submitBulkTaskMutation(fetch, {
        kind: "delete",
        input: { ids: selectedTaskIds },
      }, { orgId, userId: currentUserId, projectId });
      dispatch("done", { action: "bulkDelete", taskIds: selectedTaskIds });
    } catch (err) {
      dispatch("error", { action: "bulkDelete", error: String(err) });
    } finally {
      loading = false;
    }
  }

  async function handleCustomFieldPatch(e: CustomEvent<Record<string, unknown>>) {
    if (isOverLimit) return;
    loading = true;
    try {
      await submitBulkTaskCustomFieldPatch(fetch, selectedTaskIds, e.detail, { orgId, userId: currentUserId, projectId });
      dispatch("done", { action: "customFields", taskIds: selectedTaskIds });
    } catch (err) {
      dispatch("error", { action: "customFields", error: String(err) });
    } finally {
      loading = false;
      showCustomFieldEdit = false;
      activeAction = null;
    }
  }

  function dispatchUnsupported(action: string) {
    dispatch("error", {
      action,
      error: "This bulk action needs a public API endpoint before it can mutate tasks.",
    });
  }
</script>

{#if count > 0}
  <div
    class="bulk-action-bar fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-background border rounded-lg shadow-lg"
    role="toolbar"
    aria-label="Bulk actions"
  >
    <!-- Selection count -->
    <span class="text-sm font-medium text-foreground whitespace-nowrap">
      {count} task{count === 1 ? "" : "s"} selected
    </span>

    {#if isOverLimit}
      <span class="text-xs text-destructive font-medium" title="Max 200 tasks per operation">
        ⚠ Limit: {MAX_BULK} max
      </span>
    {/if}

    <div class="h-4 w-px bg-border mx-1" />

    <!-- Set Status -->
    <Popover.Root>
      <Popover.Trigger asChild let:builder>
        <Button builders={[builder]} variant="outline" size="sm" disabled={isOverLimit || loading} class="h-8 text-xs">
          Set Status
        </Button>
      </Popover.Trigger>
      <Popover.Content class="w-48 p-2 space-y-2">
        <Select.Root onSelectedChange={(v) => { statusValue = v?.value ?? ""; }}>
          <Select.Trigger class="w-full h-8 text-xs"><Select.Value placeholder="Pick status..." /></Select.Trigger>
          <Select.Content>
            {#each STATUS_OPTIONS as opt}
              <Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <Button size="sm" class="w-full h-7 text-xs" on:click={handleSetStatus} disabled={!statusValue}>Apply</Button>
      </Popover.Content>
    </Popover.Root>

    <!-- Set Assignee -->
    <Popover.Root>
      <Popover.Trigger asChild let:builder>
        <Button builders={[builder]} variant="outline" size="sm" disabled={isOverLimit || loading} class="h-8 text-xs">
          Set Assignee
        </Button>
      </Popover.Trigger>
      <Popover.Content class="w-48 p-2 space-y-2">
        <input
          type="text"
          class="w-full h-8 text-xs border rounded px-2"
          placeholder="User ID or email..."
          bind:value={assigneeValue}
        />
        <Button size="sm" class="w-full h-7 text-xs" on:click={handleSetAssignee}>Apply</Button>
      </Popover.Content>
    </Popover.Root>

    <!-- Set Priority -->
    <Popover.Root>
      <Popover.Trigger asChild let:builder>
        <Button builders={[builder]} variant="outline" size="sm" disabled={isOverLimit || loading} class="h-8 text-xs">
          Set Priority
        </Button>
      </Popover.Trigger>
      <Popover.Content class="w-44 p-2 space-y-2">
        <Select.Root onSelectedChange={(v) => { priorityValue = v?.value ?? ""; }}>
          <Select.Trigger class="w-full h-8 text-xs"><Select.Value placeholder="Pick priority..." /></Select.Trigger>
          <Select.Content>
            {#each PRIORITY_OPTIONS as opt}
              <Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
        <Button size="sm" class="w-full h-7 text-xs" on:click={handleSetPriority} disabled={!priorityValue}>Apply</Button>
      </Popover.Content>
    </Popover.Root>

    <!-- Add Label -->
    <Popover.Root>
      <Popover.Trigger asChild let:builder>
        <Button builders={[builder]} variant="outline" size="sm" disabled={isOverLimit || loading} class="h-8 text-xs">
          Add Label
        </Button>
      </Popover.Trigger>
      <Popover.Content class="w-48 p-2 space-y-2">
        <input
          type="text"
          class="w-full h-8 text-xs border rounded px-2"
          placeholder="Label ID..."
          bind:value={labelValue}
        />
        <div class="flex gap-1">
          <Button size="sm" class="flex-1 h-7 text-xs" on:click={handleAddLabel}>Add</Button>
          <Button variant="outline" size="sm" class="flex-1 h-7 text-xs" on:click={handleRemoveLabel}>Remove</Button>
        </div>
      </Popover.Content>
    </Popover.Root>

    <!-- Move to Sprint -->
    <Popover.Root>
      <Popover.Trigger asChild let:builder>
        <Button builders={[builder]} variant="outline" size="sm" disabled={isOverLimit || loading} class="h-8 text-xs">
          Move to Sprint
        </Button>
      </Popover.Trigger>
      <Popover.Content class="w-48 p-2 space-y-2">
        <input
          type="text"
          class="w-full h-8 text-xs border rounded px-2"
          placeholder="Sprint ID..."
          bind:value={sprintValue}
        />
        <Button size="sm" class="w-full h-7 text-xs" on:click={handleMoveToSprint}>Apply</Button>
      </Popover.Content>
    </Popover.Root>

    <!-- Set Due Date -->
    <Popover.Root>
      <Popover.Trigger asChild let:builder>
        <Button builders={[builder]} variant="outline" size="sm" disabled={isOverLimit || loading} class="h-8 text-xs">
          Set Due Date
        </Button>
      </Popover.Trigger>
      <Popover.Content class="w-44 p-2 space-y-2">
        <input
          type="date"
          class="w-full h-8 text-xs border rounded px-2"
          bind:value={dueDateValue}
        />
        <Button size="sm" class="w-full h-7 text-xs" on:click={handleSetDueDate} disabled={!dueDateValue}>Apply</Button>
      </Popover.Content>
    </Popover.Root>

    <!-- Edit Custom Fields -->
    <Popover.Root bind:open={showCustomFieldEdit}>
      <Popover.Trigger asChild let:builder>
        <Button builders={[builder]} variant="outline" size="sm" disabled={isOverLimit || loading} class="h-8 text-xs">
          Custom Fields
        </Button>
      </Popover.Trigger>
      <Popover.Content class="w-72 p-3">
        <BulkCustomFieldEdit
          {customFieldDefs}
          on:patch={handleCustomFieldPatch}
          on:cancel={() => { showCustomFieldEdit = false; }}
        />
      </Popover.Content>
    </Popover.Root>

    <div class="h-4 w-px bg-border mx-1" />

    <!-- Archive -->
    <Button
      variant="outline"
      size="sm"
      disabled={isOverLimit || loading}
      class="h-8 text-xs"
      on:click={handleArchive}
    >
      Archive
    </Button>

    <!-- Delete -->
    <Button
      variant="destructive"
      size="sm"
      disabled={isOverLimit || loading}
      class="h-8 text-xs"
      on:click={handleDelete}
    >
      Delete
    </Button>
  </div>
{/if}
