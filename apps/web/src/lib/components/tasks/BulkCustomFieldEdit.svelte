<script lang="ts">
  /**
   * BulkCustomFieldEdit — edit custom fields for multiple tasks at once (D-78, MEDIUM-05).
   * Supports all 9 CUSTOM_FIELD_TYPES: text, number, date, select, multi_select,
   * user, url, boolean, checkbox.
   */
  import { createEventDispatcher } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Select from "$lib/components/ui/select/index.js";

  interface Props {
    customFieldDefs?: Array<{
      id: string;
      name: string;
      fieldType: string;
      config?: Record<string, unknown>;
    }>;
  }

  let { customFieldDefs = [] }: Props = $props();

  const dispatch = createEventDispatcher<{
    patch: Record<string, unknown>;
    cancel: void;
  }>();

  // Track which field is selected and its current value
  let selectedFieldId: string = "";
  let fieldValue: unknown = undefined;
  let multiSelectValues: string[] = [];

  const selectedField = $derived(customFieldDefs.find((f) => f.id === selectedFieldId));
  const fieldOptions = $derived(getOptions(selectedField));

  function getOptions(field: typeof customFieldDefs[0] | undefined): Array<{ value: string; label: string }> {
    if (!field) return [];
    if (field.fieldType === "select" || field.fieldType === "multi_select") {
      const opts = (field.config as any)?.options;
      if (Array.isArray(opts)) return opts.map((o: any) => ({ value: o.value, label: o.label }));
    }
    return [];
  }

  function resetValue() {
    fieldValue = undefined;
    multiSelectValues = [];
  }

  function onFieldSelect(val: string) {
    selectedFieldId = val;
    resetValue();
  }

  function toggleMultiSelectOption(opt: string) {
    if (multiSelectValues.includes(opt)) {
      multiSelectValues = multiSelectValues.filter((v) => v !== opt);
    } else {
      multiSelectValues = [...multiSelectValues, opt];
    }
  }

  function getEffectiveValue(): unknown {
    if (!selectedField) return undefined;
    switch (selectedField.fieldType) {
      case "multi_select": return multiSelectValues;
      case "number": return fieldValue !== undefined && fieldValue !== "" ? Number(fieldValue) : undefined;
      case "boolean":
      case "checkbox": return Boolean(fieldValue);
      default: return fieldValue;
    }
  }

  function handleApply() {
    if (!selectedFieldId) return;
    const value = getEffectiveValue();
    dispatch("patch", { [selectedFieldId]: value });
    selectedFieldId = "";
    resetValue();
  }

  function handleCancel() {
    dispatch("cancel");
  }
</script>

<div class="bulk-custom-field-edit space-y-3">
  <div class="text-sm font-medium">Edit Custom Field</div>

  <!-- Field picker -->
  <div class="space-y-1">
    <label class="text-xs text-muted-foreground">Field</label>
    <Select.Root onSelectedChange={(v) => onFieldSelect(v?.value ?? "")}>
      <Select.Trigger class="w-full h-8 text-xs">
        <Select.Value placeholder="Select field..." />
      </Select.Trigger>
      <Select.Content>
        {#each customFieldDefs as field}
          <Select.Item value={field.id} label={field.name}>
            {field.name}
            <span class="text-muted-foreground text-xs ml-1">({field.fieldType})</span>
          </Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <!-- Value input — type-aware (all 9 types) -->
  {#if selectedField}
    <div class="space-y-1">
      <label class="text-xs text-muted-foreground">Value</label>

      {#if selectedField.fieldType === "text"}
        <Input type="text" bind:value={fieldValue} class="h-8 text-xs" placeholder="Enter text..." />

      {:else if selectedField.fieldType === "number"}
        <Input type="number" bind:value={fieldValue} class="h-8 text-xs" placeholder="Enter number..." />

      {:else if selectedField.fieldType === "date"}
        <Input type="date" bind:value={fieldValue} class="h-8 text-xs" />

      {:else if selectedField.fieldType === "url"}
        <Input type="url" bind:value={fieldValue} class="h-8 text-xs" placeholder="https://..." />

      {:else if selectedField.fieldType === "user"}
        <Input type="text" bind:value={fieldValue} class="h-8 text-xs" placeholder="User ID or email..." />

      {:else if selectedField.fieldType === "select"}
        <Select.Root onSelectedChange={(v) => { fieldValue = v?.value; }}>
          <Select.Trigger class="w-full h-8 text-xs">
            <Select.Value placeholder="Select option..." />
          </Select.Trigger>
          <Select.Content>
            {#each fieldOptions as opt}
              <Select.Item value={opt.value} label={opt.label}>{opt.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>

      {:else if selectedField.fieldType === "multi_select"}
        <div class="flex flex-wrap gap-1 border rounded p-2 min-h-8">
          {#each fieldOptions as opt}
            <button
              type="button"
              class="text-xs px-2 py-0.5 rounded border transition-colors {multiSelectValues.includes(opt.value) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}"
              on:click={() => toggleMultiSelectOption(opt.value)}
            >
              {opt.label}
            </button>
          {/each}
          {#if fieldOptions.length === 0}
            <span class="text-xs text-muted-foreground">No options defined</span>
          {/if}
        </div>

      {:else if selectedField.fieldType === "boolean" || selectedField.fieldType === "checkbox"}
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            class="h-4 w-4 rounded"
            bind:checked={fieldValue as boolean}
          />
          <span class="text-xs">{fieldValue ? "Checked" : "Unchecked"}</span>
        </label>

      {:else}
        <!-- json or unknown type — raw text input -->
        <Input type="text" bind:value={fieldValue} class="h-8 text-xs font-mono" placeholder="JSON value..." />
      {/if}
    </div>
  {/if}

  <!-- Actions -->
  <div class="flex gap-2">
    <Button
      size="sm"
      class="flex-1 h-8 text-xs"
      disabled={!selectedFieldId}
      on:click={handleApply}
    >
      Apply to {"{N}"} tasks
    </Button>
    <Button variant="outline" size="sm" class="h-8 text-xs" on:click={handleCancel}>
      Cancel
    </Button>
  </div>
</div>
