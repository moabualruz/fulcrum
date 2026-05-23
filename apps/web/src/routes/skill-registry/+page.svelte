<script lang="ts">
  import { Select } from "@fulcrum/ui-kit";
  type Source = "bundled" | "npm" | "local";
  type Skill = { name: string; version: string; author: string; description: string; source: Source };

  const SKILLS: Skill[] = [
    { name: "jq", version: "1.7.1", author: "stedolan", description: "Slice and transform JSON streams.", source: "bundled" },
    { name: "ripgrep", version: "14.1.0", author: "BurntSushi", description: "Search files recursively.", source: "bundled" },
    { name: "tldr", version: "3.2.0", author: "tldr-pages", description: "Simplified man pages.", source: "npm" },
    { name: "scratch", version: "0.1.0", author: "you", description: "Local-only scratch helper.", source: "local" },
  ];

  let query = $state("");
  let sourceFilter = $state<Source | "all">("all");
  const filtered = $derived(
    SKILLS.filter((s) => {
      if (sourceFilter !== "all" && s.source !== sourceFilter) return false;
      if (query && !`${s.name} ${s.description} ${s.author}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    }),
  );
</script>

<svelte:head><title>Skill registry | Fulcrum</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-4 p-6" data-skill-registry-page>
  <h1 class="text-2xl font-semibold">Skill registry</h1>

  <div class="flex flex-wrap items-center gap-2">
    <input data-skill-search type="search" bind:value={query} placeholder="Search skills" class="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm" />
    <select data-skill-source-filter bind:value={sourceFilter} class="rounded-md border border-border bg-background px-2 py-1 text-xs">
      <option value="all">all sources</option>
      <option value="bundled">bundled</option>
      <option value="npm">npm</option>
      <option value="local">local</option>
    </select>
  </div>

  <p data-skill-count class="text-xs text-muted-foreground">{filtered.length} skills</p>

  <ul class="space-y-2" data-skill-list>
    {#each filtered as s}
      <li data-skill-row={s.name} data-skill-source={s.source} class="rounded-md border border-border p-3">
        <div class="flex items-baseline justify-between gap-2">
          <strong class="text-sm">{s.name}</strong>
          <span class="text-xs text-muted-foreground">v{s.version} · {s.author} · {s.source}</span>
        </div>
        <p class="text-xs">{s.description}</p>
      </li>
    {/each}
  </ul>
</main>
