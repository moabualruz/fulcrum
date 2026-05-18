<script lang="ts">
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import { buttonVariants } from "@fulcrum/ui-kit";
  import { cn } from "$lib/utils.js";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  interface SkillItem {
    id: string;
    slug: string;
    version: string;
    source: "local" | "upstream";
    upstream_repo: string | null;
    content_hash: string | null;
    enabled_agents: string[];
    upstream_conflict: { local_content: string; upstream_content: string } | null;
  }

  type SkillsPayload = { skills: SkillItem[] };

  // Install form state
  let installSlug = $state("");
  let installRepo = $state("");
  let installing = $state(false);
  let installError = $state("");

  // Confirmation dialog state
  let confirmUninstall = $state<string | null>(null);

  // Local skills list for reactive updates
  let localSkills = $state<SkillItem[] | null>(null);

  async function apiCall(body: Record<string, unknown>): Promise<Response> {
    return fetch("/api/skills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function handleInstall(): Promise<void> {
    if (!installSlug.trim()) {
      installError = "Slug is required";
      return;
    }
    installing = true;
    installError = "";
    try {
      const res = await apiCall({
        action: "install",
        slug: installSlug.trim(),
        upstream_repo: installRepo.trim() || undefined,
      });
      if (!res.ok) {
        const err = await res.json();
        installError = (err as { error: string }).error;
        return;
      }
      const skill = (await res.json()) as SkillItem;
      localSkills = [...(localSkills ?? []), skill];
      installSlug = "";
      installRepo = "";
    } finally {
      installing = false;
    }
  }

  async function handleUpgrade(slug: string): Promise<void> {
    const res = await apiCall({ action: "upgrade", slug });
    if (res.ok) {
      const updated = (await res.json()) as SkillItem;
      localSkills = (localSkills ?? []).map((s) => (s.slug === slug ? updated : s));
    }
  }

  async function handleUpgradeAll(): Promise<void> {
    const res = await apiCall({ action: "upgrade", slug: "all" });
    if (res.ok) {
      const updated = (await res.json()) as SkillItem[];
      localSkills = updated;
    }
  }

  async function handleUninstall(slug: string): Promise<void> {
    const res = await apiCall({ action: "uninstall", slug });
    if (res.ok || res.status === 204) {
      localSkills = (localSkills ?? []).filter((s) => s.slug !== slug);
    }
    confirmUninstall = null;
  }

  async function handleToggleAgent(slug: string, agent: string, currentAgents: string[]): Promise<void> {
    const newAgents = currentAgents.includes(agent)
      ? currentAgents.filter((a) => a !== agent)
      : [...currentAgents, agent];
    const res = await apiCall({
      action: "update_enabled_agents",
      slug,
      enabled_agents: newAgents,
    });
    if (res.ok) {
      const updated = (await res.json()) as SkillItem;
      localSkills = (localSkills ?? []).map((s) => (s.slug === slug ? updated : s));
    }
  }

  async function handleResolveConflict(slug: string, resolution: "keep_local" | "use_upstream"): Promise<void> {
    const res = await apiCall({ action: "resolve_conflict", slug, resolution });
    if (res.ok) {
      const updated = (await res.json()) as SkillItem;
      localSkills = (localSkills ?? []).map((s) => (s.slug === slug ? updated : s));
    }
  }

  const AGENTS = ["claude", "codex", "gemini", "opencode", "pi"] as const;
</script>

<header
  data-skills-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Skills</h1>
  <button
    data-upgrade-all
    onclick={handleUpgradeAll}
    class={cn(buttonVariants({ variant: "outline" }))}
  >Upgrade all</button>
</header>

<!-- Install form -->
<form
  data-install-form
  class={cn("mb-6 flex flex-wrap items-end gap-2")}
  onsubmit={(e) => { e.preventDefault(); void handleInstall(); }}
>
  <div class="flex flex-col gap-1">
    <label for="install-slug" class={cn("text-sm font-medium")}>Slug</label>
    <input
      id="install-slug"
      data-install-slug
      type="text"
      placeholder="skill-name"
      bind:value={installSlug}
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    />
  </div>
  <div class="flex flex-col gap-1">
    <label for="install-repo" class={cn("text-sm font-medium")}>Upstream repo (optional)</label>
    <input
      id="install-repo"
      data-install-repo
      type="text"
      placeholder="https://github.com/..."
      bind:value={installRepo}
      class={cn("border-input bg-background flex h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
    />
  </div>
  <button
    data-install-submit
    type="submit"
    disabled={installing}
    class={cn(buttonVariants({ variant: "default" }))}
  >{installing ? "Installing…" : "Install"}</button>
  {#if installError}
    <span data-install-error class={cn("text-sm text-destructive")}>{installError}</span>
  {/if}
</form>

{#await data.streamed.data}
  <RouteSkeleton kind="list" />
{:then payload}
  {@const skills = localSkills ?? payload.skills}

  {#if skills.length === 0}
    <div
      data-empty-skills
      class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
    >No skills installed.</div>
  {:else}
    <div data-slot="table-container" class={cn("relative w-full overflow-x-auto")}>
      <table data-slot="table" data-skills-table class={cn("w-full caption-bottom text-sm")}>
        <thead data-slot="table-header" class={cn("[&_tr]:border-b")}>
          <tr data-slot="table-row" class={cn("border-b transition-colors")}>
            <th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Slug</th>
            <th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Version</th>
            <th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Source</th>
            <th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Hash</th>
            <th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Agents</th>
            <th data-slot="table-head" class={cn("h-10 px-2 text-left align-middle font-medium")}>Actions</th>
          </tr>
        </thead>
        <tbody data-slot="table-body" class={cn("[&_tr:last-child]:border-0")}>
          {#each skills as skill (skill.id)}
            <tr
              data-slot="table-row"
              data-skill-row
              data-skill-slug={skill.slug}
              class={cn("hover:bg-muted/50 border-b transition-colors")}
            >
              <td data-slot="table-cell" class={cn("p-2 align-middle font-medium")}>{skill.slug}</td>
              <td data-slot="table-cell" data-skill-version class={cn("p-2 align-middle font-mono text-xs")}>{skill.version}</td>
              <td data-slot="table-cell" class={cn("p-2 align-middle text-muted-foreground")}>{skill.source}</td>
              <td data-slot="table-cell" class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}>{skill.content_hash ?? "—"}</td>
              <td data-slot="table-cell" class={cn("p-2 align-middle")}>
                <div class="flex flex-wrap gap-1">
                  {#each AGENTS as agent (agent)}
                    <button
                      data-agent-toggle
                      data-agent={agent}
                      aria-pressed={skill.enabled_agents.includes(agent)}
                      onclick={() => void handleToggleAgent(skill.slug, agent, skill.enabled_agents)}
                      class={cn(
                        "rounded px-1.5 py-0.5 text-xs border transition-colors",
                        skill.enabled_agents.includes(agent)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-border",
                      )}
                    >{agent}</button>
                  {/each}
                </div>
              </td>
              <td data-slot="table-cell" class={cn("p-2 align-middle")}>
                <div class="flex gap-1">
                  <button
                    data-upgrade-skill
                    onclick={() => void handleUpgrade(skill.slug)}
                    class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >Upgrade</button>
                  {#if confirmUninstall === skill.slug}
                    <button
                      data-confirm-uninstall
                      onclick={() => void handleUninstall(skill.slug)}
                      class={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
                    >Confirm</button>
                    <button
                      data-cancel-uninstall
                      onclick={() => (confirmUninstall = null)}
                      class={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                    >Cancel</button>
                  {:else}
                    <button
                      data-uninstall-skill
                      onclick={() => (confirmUninstall = skill.slug)}
                      class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >Uninstall</button>
                  {/if}
                </div>
              </td>
            </tr>
            {#if skill.upstream_conflict}
              <tr data-conflict-card data-conflict-slug={skill.slug} class={cn("border-b")}>
                <td colspan="6" class={cn("p-4")}>
                  <div class={cn("rounded-lg border border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20 p-4")}>
                    <h3 class={cn("text-sm font-semibold mb-2")}>Upstream conflict for "{skill.slug}"</h3>
                    <div class="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <h4 class={cn("text-xs font-medium mb-1 text-muted-foreground")}>Local</h4>
                        <pre data-conflict-local class={cn("rounded bg-muted p-2 text-xs overflow-x-auto whitespace-pre-wrap")}>{skill.upstream_conflict.local_content}</pre>
                      </div>
                      <div>
                        <h4 class={cn("text-xs font-medium mb-1 text-muted-foreground")}>Upstream</h4>
                        <pre data-conflict-upstream class={cn("rounded bg-muted p-2 text-xs overflow-x-auto whitespace-pre-wrap")}>{skill.upstream_conflict.upstream_content}</pre>
                      </div>
                    </div>
                    <div class="flex gap-2">
                      <button
                        data-keep-local
                        onclick={() => void handleResolveConflict(skill.slug, "keep_local")}
                        class={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >Keep Local</button>
                      <button
                        data-use-upstream
                        onclick={() => void handleResolveConflict(skill.slug, "use_upstream")}
                        class={cn(buttonVariants({ variant: "default", size: "sm" }))}
                      >Use Upstream</button>
                    </div>
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/await}
