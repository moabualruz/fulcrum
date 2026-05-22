<script lang="ts">
  import { Select } from "@fulcrum/ui-kit";
  type FontFamily = "inter" | "system" | "mono";
  type AnimationSpeed = "normal" | "reduced" | "off";
  type Preset = "default" | "ocean" | "forest" | "sunset" | "monochrome";

  type ThemeSettings = {
    accentHue: number;
    accentSaturation: number;
    accentLightness: number;
    radius: number;
    fontFamily: FontFamily;
    animationSpeed: AnimationSpeed;
    preset: Preset;
  };

  const DEFAULTS: ThemeSettings = { accentHue: 215, accentSaturation: 70, accentLightness: 50, radius: 0.5, fontFamily: "inter", animationSpeed: "normal", preset: "default" };

  const PRESETS: Record<Preset, ThemeSettings> = {
    default: DEFAULTS,
    ocean: { accentHue: 200, accentSaturation: 80, accentLightness: 45, radius: 0.5, fontFamily: "inter", animationSpeed: "normal", preset: "ocean" },
    forest: { accentHue: 140, accentSaturation: 60, accentLightness: 40, radius: 0.5, fontFamily: "inter", animationSpeed: "normal", preset: "forest" },
    sunset: { accentHue: 25, accentSaturation: 85, accentLightness: 55, radius: 0.75, fontFamily: "inter", animationSpeed: "normal", preset: "sunset" },
    monochrome: { accentHue: 0, accentSaturation: 0, accentLightness: 50, radius: 0.25, fontFamily: "mono", animationSpeed: "off", preset: "monochrome" },
  };

  let settings = $state<ThemeSettings>({ ...DEFAULTS });
  let saved = $state<ThemeSettings | null>(null);

  function applyPreset(p: Preset): void { settings = { ...PRESETS[p] }; }
  function reset(): void { settings = { ...DEFAULTS }; }
  function save(): void { saved = { ...settings }; }

  const accent = $derived(`hsl(${settings.accentHue} ${settings.accentSaturation}% ${settings.accentLightness}%)`);
</script>

<svelte:head><title>Theme picker | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-theme-picker-page>
  <h1 class="text-2xl font-semibold">Theme picker</h1>

  <section class="rounded-md border border-border p-4" data-theme-preview style="border-color: {accent}">
    <p class="text-sm">Live preview</p>
    <div data-theme-preview-swatch style="background: {accent}; border-radius: {settings.radius}rem; height: 48px; width: 100%"></div>
    <p data-theme-preview-font class="mt-2 text-sm" style="font-family: {settings.fontFamily === "mono" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : settings.fontFamily}">Aa: sample text</p>
  </section>

  <fieldset class="grid gap-3 rounded-md border border-border p-3">
    <legend class="text-base font-medium">Presets</legend>
    <div class="flex flex-wrap gap-2">
      {#each ["default", "ocean", "forest", "sunset", "monochrome"] as p}
        <button type="button" data-theme-preset={p} data-theme-preset-active={settings.preset === p} onclick={() => applyPreset(p as Preset)} class="rounded-md border border-border bg-background px-3 py-1 text-xs">{p}</button>
      {/each}
    </div>
  </fieldset>

  <fieldset class="grid gap-3 rounded-md border border-border p-3">
    <legend class="text-base font-medium">Customization</legend>
    <label class="flex items-center gap-2 text-xs">
      Hue ({settings.accentHue})
      <input type="range" data-theme-hue min="0" max="360" bind:value={settings.accentHue} class="flex-1" />
    </label>
    <label class="flex items-center gap-2 text-xs">
      Saturation ({settings.accentSaturation})
      <input type="range" data-theme-saturation min="0" max="100" bind:value={settings.accentSaturation} class="flex-1" />
    </label>
    <label class="flex items-center gap-2 text-xs">
      Lightness ({settings.accentLightness})
      <input type="range" data-theme-lightness min="0" max="100" bind:value={settings.accentLightness} class="flex-1" />
    </label>
    <label class="flex items-center gap-2 text-xs">
      Radius ({settings.radius}rem)
      <input type="range" data-theme-radius min="0.25" max="1.5" step="0.05" bind:value={settings.radius} class="flex-1" />
    </label>
    <label class="flex items-center gap-2 text-xs">
      Font
      <select data-theme-font bind:value={settings.fontFamily} class="rounded-md border border-border bg-background px-2 py-1">
        <option value="inter">inter</option>
        <option value="system">system</option>
        <option value="mono">mono</option>
      </select>
    </label>
    <label class="flex items-center gap-2 text-xs">
      Animation
      <select data-theme-animation bind:value={settings.animationSpeed} class="rounded-md border border-border bg-background px-2 py-1">
        <option value="normal">normal</option>
        <option value="reduced">reduced</option>
        <option value="off">off</option>
      </select>
    </label>
  </fieldset>

  <div class="flex gap-2">
    <button type="button" data-theme-save onclick={save} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Save to profile</button>
    <button type="button" data-theme-reset onclick={reset} class="rounded-md border border-border bg-background px-3 py-1 text-xs">Reset</button>
  </div>

  {#if saved}
    <p data-theme-saved class="text-xs text-primary">Saved hue=<span data-theme-saved-hue>{saved.accentHue}</span> preset=<span data-theme-saved-preset>{saved.preset}</span></p>
  {/if}
</main>
