<script lang="ts">
  interface DateRange {
    start: Date;
    end: Date;
  }

  interface Props {
    value: DateRange;
    onChange: (range: DateRange) => void;
  }

  let { value, onChange }: Props = $props();

  let showCustom = $state(false);
  let customStart = $state(value.start.toISOString().slice(0, 10));
  let customEnd = $state(value.end.toISOString().slice(0, 10));

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    onChange({ start, end });
    showCustom = false;
  }

  function applyCustom() {
    const start = new Date(customStart + "T00:00:00");
    const end = new Date(customEnd + "T23:59:59");
    if (start <= end) {
      onChange({ start, end });
      showCustom = false;
    }
  }

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const presets = [
    { label: "Last 7 days", days: 7 },
    { label: "Last 14 days", days: 14 },
    { label: "Last 30 days", days: 30 },
    { label: "Last 90 days", days: 90 },
  ];
</script>

<div data-testid="report-date-picker" class="report-date-picker" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
  <!-- Preset buttons -->
  {#each presets as preset}
    <button
      type="button"
      data-testid={`date-range-last-${preset.days}`}
      class="preset-btn"
      style="padding: 0.25rem 0.75rem; font-size: 0.75rem; border: 1px solid hsl(var(--border)); border-radius: 0.375rem; background: hsl(var(--background)); cursor: pointer; color: hsl(var(--foreground));"
      onclick={() => applyPreset(preset.days)}
    >
      {preset.label}
    </button>
  {/each}

  <!-- Custom range popover -->
  <div>
    <button
      type="button"
      class="custom-range-btn"
      style="padding: 0.25rem 0.75rem; font-size: 0.75rem; border: 1px solid hsl(var(--border)); border-radius: 0.375rem; background: hsl(var(--background)); cursor: pointer; color: hsl(var(--foreground));"
      onclick={() => (showCustom = !showCustom)}
    >
      {formatDate(value.start)} – {formatDate(value.end)}
    </button>
    {#if showCustom}
      <div class="custom-range-form" style="padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; min-width: 240px;">
        <div>
          <label for="report-date-start" style="font-size: 0.75rem; font-weight: 500; display: block; margin-bottom: 0.25rem;">Start</label>
          <input
            id="report-date-start"
            type="date"
            bind:value={customStart}
            style="width: 100%; padding: 0.375rem 0.5rem; border: 1px solid hsl(var(--border)); border-radius: 0.375rem; background: hsl(var(--background)); color: hsl(var(--foreground)); font-size: 0.875rem;"
          />
        </div>
        <div>
          <label for="report-date-end" style="font-size: 0.75rem; font-weight: 500; display: block; margin-bottom: 0.25rem;">End</label>
          <input
            id="report-date-end"
            type="date"
            bind:value={customEnd}
            style="width: 100%; padding: 0.375rem 0.5rem; border: 1px solid hsl(var(--border)); border-radius: 0.375rem; background: hsl(var(--background)); color: hsl(var(--foreground)); font-size: 0.875rem;"
          />
        </div>
        <button
          type="button"
          onclick={applyCustom}
          style="padding: 0.5rem; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); border: none; border-radius: 0.375rem; cursor: pointer; font-size: 0.875rem; font-weight: 500;"
        >
          Apply
        </button>
      </div>
    {/if}
  </div>
</div>
