<script lang="ts">
  import { cn } from "@fulcrum/ui-kit";

  type FieldType = "text" | "select" | "number" | "date";

  interface CustomField {
    id: string;
    label: string;
    type: FieldType;
    visible: boolean;
    options?: string[];
  }

  interface TaskRow {
    id: string;
    title: string;
    customFields: Record<string, string | number>;
  }

  let fields = $state<CustomField[]>([
    { id: "severity", label: "Severity", type: "select", visible: true, options: ["S1", "S2", "S3"] },
    { id: "customer", label: "Customer", type: "text", visible: true },
    { id: "story_points", label: "Story points", type: "number", visible: false },
    { id: "due_date", label: "Due date", type: "date", visible: false },
  ]);

  const TASKS: TaskRow[] = [
    { id: "FUL-101", title: "Resolve outbox lag", customFields: { severity: "S1", customer: "Acme", story_points: 5, due_date: "2026-05-25" } },
    { id: "FUL-102", title: "Refactor auth middleware", customFields: { severity: "S2", customer: "Globex", story_points: 3, due_date: "2026-05-28" } },
    { id: "FUL-103", title: "Onboard CLI consumers", customFields: { severity: "S3", customer: "Hooli", story_points: 2, due_date: "2026-06-02" } },
  ];

  let fieldOrder = $state<string[]>(fields.map((field) => field.id));
  let editingTaskId = $state<string | null>(null);
  let editingFieldId = $state<string | null>(null);
  let editingDraft = $state("");

  function toggleField(id: string): void {
    fields = fields.map((field) => field.id === id ? { ...field, visible: !field.visible } : field);
  }

  function moveField(id: string, direction: -1 | 1): void {
    const index = fieldOrder.indexOf(id);
    if (index === -1) return;
    const swap = index + direction;
    if (swap < 0 || swap >= fieldOrder.length) return;
    const next = [...fieldOrder];
    [next[index], next[swap]] = [next[swap]!, next[index]!];
    fieldOrder = next;
  }

  function visibleOrderedFields(): CustomField[] {
    return fieldOrder
      .map((id) => fields.find((field) => field.id === id))
      .filter((field): field is CustomField => Boolean(field && field.visible));
  }

  function startEdit(taskId: string, fieldId: string, current: string | number): void {
    const field = fields.find((entry) => entry.id === fieldId);
    if (!field || (field.type !== "text" && field.type !== "select")) return;
    editingTaskId = taskId;
    editingFieldId = fieldId;
    editingDraft = String(current);
  }

  function commitEdit(): void {
    if (!editingTaskId || !editingFieldId) return;
    const task = TASKS.find((entry) => entry.id === editingTaskId);
    if (task) task.customFields[editingFieldId] = editingDraft;
    editingTaskId = null;
    editingFieldId = null;
    editingDraft = "";
  }

  function cancelEdit(): void {
    editingTaskId = null;
    editingFieldId = null;
    editingDraft = "";
  }
</script>

<svelte:head>
  <title>Views · Custom fields | Fulcrum</title>
</svelte:head>

<section data-views-custom-fields class="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-1 border-b border-border pb-3">
    <h1 data-views-custom-fields-header class="text-2xl font-semibold tracking-tight">Custom fields</h1>
    <p class="text-sm text-muted-foreground">Toggle, reorder, and inline-edit custom fields in the task list view.</p>
  </header>

  <section data-display-properties class="flex flex-col gap-3 rounded-md border border-border p-4">
    <h2 class="text-base font-medium">Display properties</h2>
    <ul class="flex flex-col gap-2 text-sm">
      {#each fields as field (field.id)}
        <li data-field-toggle-row={field.id} class="flex items-center justify-between gap-2 rounded border border-border px-3 py-2">
          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              data-field-visible={field.id}
              checked={field.visible}
              onchange={() => toggleField(field.id)}
            />
            <span>{field.label}</span>
            <span class="font-mono text-xs text-muted-foreground">{field.type}</span>
          </label>
          <div class="flex gap-1">
            <button
              type="button"
              data-field-move-up={field.id}
              class="rounded border border-border px-2 py-0.5 text-xs"
              onclick={() => moveField(field.id, -1)}
            >↑</button>
            <button
              type="button"
              data-field-move-down={field.id}
              class="rounded border border-border px-2 py-0.5 text-xs"
              onclick={() => moveField(field.id, 1)}
            >↓</button>
          </div>
        </li>
      {/each}
    </ul>
  </section>

  <section data-task-list class="overflow-x-auto rounded-md border border-border">
    <table data-tasks-table class="w-full text-sm">
      <thead class="border-b border-border bg-muted/50">
        <tr>
          <th class="px-3 py-2 text-left font-medium">Task</th>
          {#each visibleOrderedFields() as field (field.id)}
            <th data-column-header={field.id} class="resize-x overflow-hidden px-3 py-2 text-left font-medium">{field.label}</th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each TASKS as task (task.id)}
          <tr data-task-row={task.id} class="border-b border-border last:border-0">
            <td class="px-3 py-2 font-medium">
              {task.id}: {task.title}
              <div class="mt-1 flex flex-wrap gap-1">
                {#each visibleOrderedFields() as field (field.id)}
                  <span data-task-chip-field={`${task.id}-${field.id}`} class="rounded-sm border border-border bg-muted px-2 py-0.5 text-[10px]">
                    {field.label}: {task.customFields[field.id] ?? "-"}
                  </span>
                {/each}
              </div>
            </td>
            {#each visibleOrderedFields() as field (field.id)}
              <td data-task-cell={`${task.id}-${field.id}`} class="px-3 py-2 text-xs">
                {#if editingTaskId === task.id && editingFieldId === field.id}
                  {#if field.type === "select"}
                    <select
                      data-task-cell-edit-input={`${task.id}-${field.id}`}
                      bind:value={editingDraft}
                      class="h-8 rounded border border-border bg-background px-1 text-xs"
                    >
                      {#each field.options ?? [] as option (option)}
                        <option value={option}>{option}</option>
                      {/each}
                    </select>
                  {:else}
                    <input
                      type="text"
                      data-task-cell-edit-input={`${task.id}-${field.id}`}
                      bind:value={editingDraft}
                      class="h-8 rounded border border-border bg-background px-1 text-xs"
                    />
                  {/if}
                  <button
                    type="button"
                    data-task-cell-commit={`${task.id}-${field.id}`}
                    class="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground"
                    onclick={commitEdit}
                  >Save</button>
                  <button
                    type="button"
                    data-task-cell-cancel={`${task.id}-${field.id}`}
                    class="rounded border border-border px-2 py-0.5 text-[10px]"
                    onclick={cancelEdit}
                  >Cancel</button>
                {:else}
                  <button
                    type="button"
                    data-task-cell-button={`${task.id}-${field.id}`}
                    class={cn("rounded border border-transparent px-1 py-0.5", (field.type === "text" || field.type === "select") && "hover:border-border")}
                    onclick={() => startEdit(task.id, field.id, task.customFields[field.id] ?? "")}
                    disabled={field.type !== "text" && field.type !== "select"}
                  >{task.customFields[field.id] ?? "-"}</button>
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
</section>
