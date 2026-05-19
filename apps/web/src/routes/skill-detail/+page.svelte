<script lang="ts">
  type VersionRecord = { version: string; notes: string; released: string };

  const SKILL = {
    name: "jq",
    author: "stedolan",
    versions: [
      { version: "1.7.1", notes: "Bug fixes for regex and slurp mode.", released: "2025-09-01" },
      { version: "1.7.0", notes: "Streaming parser plus new operators.", released: "2024-12-01" },
      { version: "1.6.0", notes: "Initial stable.", released: "2023-04-12" },
    ] as VersionRecord[],
    description: "jq is a lightweight command-line JSON processor.",
  };

  let selectedVersion = $state<string>(SKILL.versions[0]!.version);
  let installed = $state<{ version: string } | null>(null);
  const active = $derived(SKILL.versions.find((v) => v.version === selectedVersion) ?? SKILL.versions[0]!);

  function install(): void { installed = { version: selectedVersion }; }
</script>

<svelte:head><title>Skill detail | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-skill-detail-page>
  <header class="space-y-1">
    <h1 class="text-2xl font-semibold" data-skill-name>{SKILL.name}</h1>
    <p class="text-xs text-muted-foreground">
      author <span data-skill-author>{SKILL.author}</span> · latest <span data-skill-latest>{SKILL.versions[0]!.version}</span>
    </p>
  </header>

  <p class="text-sm" data-skill-description>{SKILL.description}</p>

  <label class="flex items-center gap-2 text-xs">
    Version
    <select data-skill-version-select bind:value={selectedVersion} class="rounded-md border border-border bg-background px-2 py-1">
      {#each SKILL.versions as v}<option value={v.version}>{v.version}</option>{/each}
    </select>
  </label>

  <section class="rounded-md border border-border p-3" data-skill-version-detail>
    <p class="text-xs text-muted-foreground">Released <span data-skill-version-released>{active.released}</span></p>
    <p class="text-sm" data-skill-version-notes>{active.notes}</p>
  </section>

  <button type="button" data-skill-install onclick={install} class="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Install {selectedVersion}</button>

  {#if installed}
    <p data-skill-installed class="text-xs text-primary">Installed v{installed.version}.</p>
  {/if}
</main>
