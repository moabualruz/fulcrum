<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData } from "./$types";
  import { cn } from "@fulcrum/ui-kit";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<header class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}>
  <div class={cn("flex items-baseline gap-3")}>
    <a href="/projects/{data.projectId}" class={cn("text-sm text-muted-foreground hover:underline")}>← Project</a>
    <h1 class={cn("text-2xl font-semibold tracking-tight")}>Custom Fields</h1>
  </div>
</header>

<form method="POST" action="?/create" use:enhance data-create-field-form class={cn("flex flex-col gap-3 max-w-xl mb-8")}>
  <div class={cn("flex flex-col gap-1.5")}>
    <label for="field-name" class={cn("text-sm font-medium")}>Field Name</label>
    <input id="field-name" name="name" type="text" required class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm")} />
  </div>
  <div class={cn("flex flex-col gap-1.5")}>
    <label for="field-type" class={cn("text-sm font-medium")}>Type</label>
    <select id="field-type" name="fieldType" required class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm")}>
      <option value="text">Text</option>
      <option value="number">Number</option>
      <option value="date">Date</option>
      <option value="select">Select</option>
      <option value="multi_select">Multi-Select</option>
      <option value="checkbox">Checkbox</option>
    </select>
  </div>
  <div class={cn("flex flex-col gap-1.5")}>
    <label for="field-options" class={cn("text-sm font-medium")}>Options (comma-separated, for select types)</label>
    <input id="field-options" name="options" type="text" class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm")} />
  </div>
  <div class={cn("flex items-center gap-2")}>
    <input id="field-required" name="required" type="checkbox" />
    <label for="field-required" class={cn("text-sm")}>Required</label>
  </div>
  <button type="submit" data-create-field-submit class={cn("bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium shadow-xs w-fit")}>Add Field</button>
</form>

{#if data.fields.length === 0}
  <p data-empty-fields class={cn("text-muted-foreground text-sm")}>No custom fields yet.</p>
{:else}
  <table data-fields-table class={cn("w-full text-sm")}>
    <thead>
      <tr class={cn("border-b border-border text-left")}>
        <th class={cn("py-2 pr-4 font-medium")}>Name</th>
        <th class={cn("py-2 pr-4 font-medium")}>Type</th>
        <th class={cn("py-2 pr-4 font-medium")}>Required</th>
        <th class={cn("py-2 font-medium")}>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.fields as field (field.id)}
        <tr data-field-row class={cn("border-b border-border")}>
          <td class={cn("py-2 pr-4")}>{field.name}</td>
          <td class={cn("py-2 pr-4")}>{field.field_type}</td>
          <td class={cn("py-2 pr-4")}>{field.required ? "Yes" : "No"}</td>
          <td class={cn("py-2")}>
            <form method="POST" action="?/archive" use:enhance class={cn("inline")}>
              <input type="hidden" name="id" value={field.id} />
              <button type="submit" data-archive-field class={cn("text-xs text-destructive hover:underline")}>Archive</button>
            </form>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}
