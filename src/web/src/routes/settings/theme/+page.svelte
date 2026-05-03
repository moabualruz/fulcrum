<script lang="ts">
  import { enhance } from "$app/forms";
  import type { PageData, ActionData } from "./$types";
  import type { ThemeSettings } from "./+page.server.ts";
  import { THEME_DEFAULTS, PRESETS } from "./+page.server.ts";

  interface Props {
    data: PageData;
    form?: ActionData;
  }

  let { data, form }: Props = $props();

  // Local reactive copy for live preview
  let settings = $state<ThemeSettings>({ ...(data.settings ?? THEME_DEFAULTS) });

  // Derived CSS var string for live preview
  const previewStyle = $derived(
    `--primary: hsl(${settings.accentHue} ${settings.accentSaturation}% ${settings.accentLightness}%);` +
    `--radius: ${settings.radius}rem;` +
    (settings.compactMode ? "--spacing-unit: 0.25rem;" : "--spacing-unit: 0.5rem;") +
    (settings.animationSpeed === "off" || settings.animationSpeed === "reduced"
      ? "--animation-duration: 0ms;"
      : "--animation-duration: 200ms;"),
  );

  const PRESETS_LIST = ["default", "ocean", "forest", "sunset", "monochrome"] as const;
  const FONT_FAMILIES = ["inter", "system", "mono"] as const;
  const COLOR_SCHEMES = ["light", "dark", "auto"] as const;
  const ANIMATION_SPEEDS = ["normal", "reduced", "off"] as const;

  function applyPreset(preset: ThemeSettings["preset"]) {
    const p = PRESETS[preset];
    if (p.accentHue !== undefined) settings.accentHue = p.accentHue;
    if (p.accentSaturation !== undefined) settings.accentSaturation = p.accentSaturation;
    if (p.accentLightness !== undefined) settings.accentLightness = p.accentLightness;
    settings.preset = preset;
  }
</script>

<svelte:head>
  <title>Theme | Fulcrum Settings</title>
</svelte:head>

<div data-settings-theme class="mx-auto flex max-w-4xl flex-col gap-8 py-8 px-4">
  <header>
    <h1 class="text-2xl font-semibold tracking-tight">Theme</h1>
    <p class="mt-1 text-sm text-muted-foreground">
      Customise the appearance of Fulcrum. Changes preview live; click Save to persist.
    </p>
  </header>

  {#if form?.saveError}
    <p data-save-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {form.saveError}
    </p>
  {/if}

  {#if form?.saved}
    <p data-save-success class="rounded-md border border-green-500/30 bg-green-50 dark:bg-green-950/20 px-3 py-2 text-sm text-green-700 dark:text-green-400">
      Theme saved.
    </p>
  {/if}

  <div class="grid gap-8 lg:grid-cols-[1fr_280px]">
    <!-- Controls -->
    <form method="POST" action="?/save" use:enhance class="flex flex-col gap-6">

      <!-- Preset selector -->
      <section data-theme-presets class="flex flex-col gap-3">
        <h2 class="text-base font-medium">Preset</h2>
        <div class="flex flex-wrap gap-2">
          {#each PRESETS_LIST as preset}
            <button
              type="button"
              data-preset={preset}
              aria-pressed={settings.preset === preset}
              onclick={() => applyPreset(preset)}
              class="rounded-md border px-3 py-1.5 text-sm transition-colors {settings.preset === preset ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'}"
            >{preset}</button>
          {/each}
        </div>
        <input type="hidden" name="preset" value={settings.preset} />
      </section>

      <!-- Accent colour -->
      <section data-theme-accent class="flex flex-col gap-3">
        <h2 class="text-base font-medium">Accent colour</h2>
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="flex flex-col gap-1 text-sm">
            Hue
            <input
              type="range" name="accentHue" min="0" max="360" step="1"
              bind:value={settings.accentHue}
              data-accent-hue
              class="accent-primary"
            />
            <span class="text-xs text-muted-foreground">{settings.accentHue}°</span>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Saturation
            <input
              type="range" name="accentSaturation" min="0" max="100" step="1"
              bind:value={settings.accentSaturation}
              data-accent-saturation
              class="accent-primary"
            />
            <span class="text-xs text-muted-foreground">{settings.accentSaturation}%</span>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            Lightness
            <input
              type="range" name="accentLightness" min="0" max="100" step="1"
              bind:value={settings.accentLightness}
              data-accent-lightness
              class="accent-primary"
            />
            <span class="text-xs text-muted-foreground">{settings.accentLightness}%</span>
          </label>
        </div>
      </section>

      <!-- Border radius -->
      <section data-theme-radius class="flex flex-col gap-3">
        <h2 class="text-base font-medium">Border radius</h2>
        <label class="flex flex-col gap-1 text-sm">
          Radius
          <input
            type="range" name="radius" min="0" max="1.5" step="0.05"
            bind:value={settings.radius}
            data-radius-slider
            class="accent-primary"
          />
          <span class="text-xs text-muted-foreground">{settings.radius}rem</span>
        </label>
      </section>

      <!-- Font family -->
      <section data-theme-font class="flex flex-col gap-3">
        <h2 class="text-base font-medium">Font</h2>
        <label class="flex flex-col gap-1 text-sm">
          Font family
          <select
            name="fontFamily"
            bind:value={settings.fontFamily}
            data-font-family
            class="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm"
          >
            {#each FONT_FAMILIES as ff}
              <option value={ff}>{ff}</option>
            {/each}
          </select>
        </label>
      </section>

      <!-- Color scheme -->
      <section data-theme-scheme class="flex flex-col gap-3">
        <h2 class="text-base font-medium">Color scheme</h2>
        <div class="flex gap-3">
          {#each COLOR_SCHEMES as scheme}
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="colorScheme"
                value={scheme}
                bind:group={settings.colorScheme}
                data-color-scheme={scheme}
              />
              {scheme}
            </label>
          {/each}
        </div>
      </section>

      <!-- Compact mode -->
      <section data-theme-compact class="flex flex-col gap-3">
        <h2 class="text-base font-medium">Compact mode</h2>
        <label class="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="compactMode"
            value="true"
            checked={settings.compactMode}
            onchange={(e) => { settings.compactMode = (e.currentTarget as HTMLInputElement).checked; }}
            data-compact-mode
          />
          Enable compact layout (reduced spacing)
        </label>
        <!-- Hidden field so unchecked submits false -->
        {#if !settings.compactMode}
          <input type="hidden" name="compactMode" value="false" />
        {/if}
      </section>

      <!-- Animation speed -->
      <section data-theme-animation class="flex flex-col gap-3">
        <h2 class="text-base font-medium">Animation</h2>
        <div class="flex gap-3">
          {#each ANIMATION_SPEEDS as speed}
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="animationSpeed"
                value={speed}
                bind:group={settings.animationSpeed}
                data-animation-speed={speed}
              />
              {speed}
            </label>
          {/each}
        </div>
      </section>

      <div class="flex gap-2">
        <button
          type="submit"
          data-save-theme
          class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >Save</button>
        <button
          type="submit"
          formaction="?/reset"
          data-reset-theme
          class="rounded-md border border-border px-4 py-2 text-sm font-medium"
        >Reset to defaults</button>
      </div>
    </form>

    <!-- Live preview panel -->
    <aside data-theme-preview class="flex flex-col gap-4 rounded-xl border border-border p-4" style={previewStyle}>
      <h2 class="text-sm font-medium text-muted-foreground">Live preview</h2>
      <div class="flex flex-col gap-3">
        <div
          data-preview-accent-swatch
          class="h-12 w-full rounded-lg"
          style="background: hsl({settings.accentHue} {settings.accentSaturation}% {settings.accentLightness}%);"
        ></div>
        <div class="rounded-lg border border-border bg-background p-3 text-xs" style="border-radius: {settings.radius}rem;">
          <p class="font-medium" style="font-family: {settings.fontFamily === 'mono' ? 'monospace' : settings.fontFamily === 'system' ? 'system-ui, sans-serif' : 'Inter Variable, sans-serif'};">
            Aa — {settings.fontFamily}
          </p>
          <p class="text-muted-foreground mt-1">The quick brown fox jumps over the lazy dog.</p>
        </div>
        <button
          data-preview-button
          type="button"
          class="rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style="background: hsl({settings.accentHue} {settings.accentSaturation}% {settings.accentLightness}%); border-radius: {settings.radius}rem;"
        >Primary button</button>
        <div class="text-xs text-muted-foreground space-y-1">
          <p>Scheme: {settings.colorScheme}</p>
          <p>Compact: {settings.compactMode ? "on" : "off"}</p>
          <p>Animation: {settings.animationSpeed}</p>
        </div>
      </div>
    </aside>
  </div>
</div>
