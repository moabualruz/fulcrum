<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";

  type SettingsDraft = {
    apiBaseUrl: string;
    connectorUrl: string;
    connectorToken: string;
    routingDefault: string;
    featureDiagnostics: boolean;
    themeMode: "system" | "dark" | "light";
  };

  type SettingsError = {
    route: string;
    message: string;
    recovery: string;
  };

  const storageKey = "fulcrum.settings.runtime-overview";

  const defaultDraft: SettingsDraft = {
    apiBaseUrl: "/api/v1",
    connectorUrl: "https://github.com/moabualruz/fulcrum",
    connectorToken: "",
    routingDefault: "codex",
    featureDiagnostics: true,
    themeMode: "system",
  };

  const sections = [
    { label: "Theme", href: "/settings/theme", scope: "workspace", summary: "Theme, density, and display defaults" },
    { label: "Routing", href: "/settings/routing", scope: "workspace", summary: "Default agent route rules and dry-run checks" },
    { label: "Connectors", href: "/settings/connectors", scope: "workspace", summary: "External source hosts, tokens, and sync health" },
    { label: "API", href: "/settings/api", scope: "workspace", summary: "Base URL, OpenAPI, rate limits, and API keys" },
    { label: "Feature flags", href: "/settings/flags", scope: "workspace", summary: "Runtime toggles and staged enablement" },
    { label: "Secrets", href: "/settings/secrets", scope: "workspace", summary: "Sensitive values and rotation guidance" },
  ];

  let origin = $state("http://localhost");
  let draft = $state<SettingsDraft>({ ...defaultDraft });
  let savedAt = $state<string | null>(null);
  let errors = $state<SettingsError[]>([]);

  const apiDisplayUrl = $derived(`${origin}${draft.apiBaseUrl.startsWith("/") ? draft.apiBaseUrl : `/${draft.apiBaseUrl}`}`);
  const openApiUrl = $derived(`${origin}/api/v1/openapi.json`);
  const hasErrors = $derived(errors.length > 0);
  const errorGroups = $derived(groupErrors(errors));

  onMount(() => {
    origin = window.location.origin;
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      try {
        draft = { ...defaultDraft, ...JSON.parse(saved) };
        savedAt = "restored";
      } catch {
        window.localStorage.removeItem(storageKey);
      }
    }
  });

  function persist(): void {
    const nextErrors: SettingsError[] = [];
    if (!draft.apiBaseUrl.startsWith("/api/")) {
      nextErrors.push({
        route: "/settings/api",
        message: "API base URL must stay under /api/.",
        recovery: "Use /settings/api to verify the OpenAPI route before saving.",
      });
    }

    if (!draft.connectorUrl.startsWith("https://")) {
      nextErrors.push({
        route: "/settings/connectors",
        message: "Connector host must use https.",
        recovery: "Open /settings/connectors and test the host before syncing.",
      });
    }

    if (draft.connectorToken.trim().toLowerCase() === "bad-token") {
      nextErrors.push({
        route: "/settings/connectors",
        message: "Connector token failed validation.",
        recovery: "Rotate the token, paste the new value, then retry sync.",
      });
    }

    errors = nextErrors;
    if (nextErrors.length > 0) return;

    if (browser) {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
    }
    savedAt = new Date().toISOString();
  }

  function groupErrors(items: SettingsError[]): Array<{ route: string; messages: string[]; recoveries: string[] }> {
    const groups = new Map<string, { route: string; messages: string[]; recoveries: string[] }>();
    for (const item of items) {
      const group = groups.get(item.route) ?? { route: item.route, messages: [], recoveries: [] };
      group.messages.push(item.message);
      group.recoveries.push(item.recovery);
      groups.set(item.route, group);
    }
    return [...groups.values()];
  }
</script>

<svelte:head>
  <title>Settings | Fulcrum</title>
</svelte:head>

<main data-settings-overview data-settings-ready="true" class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
  <header class="flex flex-col gap-2">
    <p class="type-caption text-muted-foreground">Workspace settings</p>
    <h1 class="type-h1 font-semibold">Runtime control plane</h1>
    <p class="type-body max-w-3xl text-muted-foreground">
      Live routes, persisted safe edits, and scoped recovery checks for settings that affect the current workspace.
    </p>
  </header>

  <section class="grid gap-3 md:grid-cols-3" aria-label="Runtime truth">
    <div class="rounded-md border border-border bg-card p-4">
      <p class="type-caption text-muted-foreground">Web origin</p>
      <code data-settings-origin class="type-code break-all">{origin}</code>
    </div>
    <div class="rounded-md border border-border bg-card p-4">
      <p class="type-caption text-muted-foreground">API base URL</p>
      <code data-settings-api-url class="type-code break-all">{apiDisplayUrl}</code>
    </div>
    <div class="rounded-md border border-border bg-card p-4">
      <p class="type-caption text-muted-foreground">OpenAPI</p>
      <a data-settings-openapi href="/api/v1/openapi.json" class="type-code break-all text-primary underline">{openApiUrl}</a>
    </div>
  </section>

  <section class="grid gap-4 lg:grid-cols-[1fr_360px]" aria-label="Settings sections">
    <div class="grid gap-3 sm:grid-cols-2">
      {#each sections as section}
        <a
          data-settings-link={section.href}
          href={section.href}
          class="rounded-md border border-border bg-card p-4 transition-colors hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="type-h3 font-semibold">{section.label}</h2>
              <p class="type-caption mt-1 text-muted-foreground">{section.summary}</p>
            </div>
            <span class="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">{section.scope}</span>
          </div>
          <code class="type-code mt-3 block text-muted-foreground">{section.href}</code>
        </a>
      {/each}
    </div>

    <aside class="flex flex-col gap-4 rounded-md border border-border bg-card p-4" aria-label="Safe settings mutation">
      <div>
        <h2 class="type-h3 font-semibold">Safe edit check</h2>
        <p class="type-caption text-muted-foreground">Changes persist locally and errors point at the owning route.</p>
      </div>

      <label class="grid gap-1 type-caption">
        API base
        <input data-settings-api-input bind:value={draft.apiBaseUrl} class="rounded-md border border-input bg-background px-3 py-2 type-body" />
      </label>

      <label class="grid gap-1 type-caption">
        Connector host
        <input data-settings-connector-url bind:value={draft.connectorUrl} class="rounded-md border border-input bg-background px-3 py-2 type-body" />
      </label>

      <label class="grid gap-1 type-caption">
        Connector token
        <input data-settings-token-input type="password" bind:value={draft.connectorToken} class="rounded-md border border-input bg-background px-3 py-2 type-body" />
      </label>

      <label class="grid gap-1 type-caption">
        Default route
        <select data-settings-routing-select bind:value={draft.routingDefault} class="rounded-md border border-input bg-background px-3 py-2 type-body">
          <option value="codex">Codex</option>
          <option value="claude">Claude Code</option>
          <option value="gemini">Gemini</option>
          <option value="opencode">OpenCode</option>
        </select>
      </label>

      <label class="flex items-center gap-2 type-caption">
        <input data-settings-feature-toggle type="checkbox" bind:checked={draft.featureDiagnostics} class="h-4 w-4" />
        Connector diagnostics enabled
      </label>

      <label class="grid gap-1 type-caption">
        Theme
        <select data-settings-theme-select bind:value={draft.themeMode} class="rounded-md border border-input bg-background px-3 py-2 type-body">
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>

      <button
        type="button"
        data-settings-save
        onclick={persist}
        class="rounded-md bg-primary px-3 py-2 type-caption font-medium text-primary-foreground"
      >
        Save settings
      </button>

      {#if savedAt}
        <p data-settings-saved class="rounded-md border border-green-700/30 bg-green-950/20 px-3 py-2 type-caption text-green-700">
          Saved state: {savedAt}
        </p>
      {/if}

      {#if hasErrors}
        <div data-settings-errors class="grid gap-2">
          {#each errorGroups as errorGroup}
            <div data-settings-error={errorGroup.route} class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
              <p class="type-caption font-semibold text-destructive">{errorGroup.route}: {errorGroup.messages.join(" ")}</p>
              <p class="type-caption text-muted-foreground">{errorGroup.recoveries.join(" ")}</p>
            </div>
          {/each}
        </div>
      {/if}
    </aside>
  </section>
</main>
