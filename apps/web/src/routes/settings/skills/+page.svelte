<script lang="ts">
  import { onMount } from "svelte";
  import type { PageData } from "./$types";
  import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
  import {
    Badge,
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    buttonVariants,
  } from "@fulcrum/ui-kit";
  import { cn } from "@fulcrum/ui-kit";

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
    upstream_conflict: SkillConflict | null;
  }

  type ConflictResolution = "keep_local" | "use_upstream" | "force" | "alt_version" | "skip" | "upgrade_installed";

  interface SkillConflict {
    local_content: string;
    upstream_content: string;
    installed_skill: string;
    installed_version: string;
    requested_skill: string;
    requested_version: string;
    reason: string;
    alt_versions: string[];
    recommended_resolution: ConflictResolution;
    force_safe: boolean;
    session_resolution: ConflictResolution | null;
  }

  type SkillsPayload = { skills: SkillItem[] };
  const SESSION_RESOLUTION_KEY = "fulcrum.skillConflictResolution";

  // Install form state
  let installSlug = $state("");
  let installRepo = $state("");
  let installing = $state(false);
  let installError = $state("");

  // Confirmation dialog state
  let confirmUninstall = $state<string | null>(null);

  // Local skills list for reactive updates
  let localSkills = $state<SkillItem[] | null>(null);

  interface InstallLogEntry {
    timestamp: string;
    action: string;
    slug: string;
    result: "ok" | "error";
    message?: string;
  }

  let installLog = $state<InstallLogEntry[]>([]);
  let selectedAltVersion = $state<string | null>(null);
  let forceAcknowledged = $state(false);
  let sessionConflictChoice = $state<string | null>(null);

  onMount(() => {
    sessionConflictChoice = sessionStorage.getItem(SESSION_RESOLUTION_KEY);
  });

  function recordLog(action: string, slug: string, result: "ok" | "error", message?: string): void {
    installLog = [
      { timestamp: new Date().toISOString(), action, slug, result, message },
      ...installLog,
    ].slice(0, 20);
  }

  function dependentsOf(slug: string, skills: SkillItem[]): SkillItem[] {
    return skills.filter((other) => other.slug !== slug && other.upstream_repo?.includes(slug));
  }

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
        recordLog("install", installSlug.trim(), "error", installError);
        return;
      }
      const skill = (await res.json()) as SkillItem;
      localSkills = [...(localSkills ?? []), skill];
      recordLog("install", skill.slug, "ok");
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
      recordLog("upgrade", slug, "ok");
    } else {
      recordLog("upgrade", slug, "error", `HTTP ${res.status}`);
    }
  }

  async function handleUpgradeAll(): Promise<void> {
    const res = await apiCall({ action: "upgrade", slug: "all" });
    if (res.ok) {
      const updated = (await res.json()) as SkillItem[];
      localSkills = updated;
      recordLog("upgrade-all", "all", "ok");
    } else {
      recordLog("upgrade-all", "all", "error", `HTTP ${res.status}`);
    }
  }

  async function handleUninstall(slug: string): Promise<void> {
    const res = await apiCall({ action: "uninstall", slug });
    if (res.ok || res.status === 204) {
      localSkills = (localSkills ?? []).filter((s) => s.slug !== slug);
      recordLog("uninstall", slug, "ok");
    } else {
      recordLog("uninstall", slug, "error", `HTTP ${res.status}`);
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

  async function handleResolveConflict(slug: string, resolution: ConflictResolution, altVersion?: string): Promise<void> {
    const res = await apiCall({ action: "resolve_conflict", slug, resolution, alt_version: altVersion });
    if (res.ok) {
      const updated = (await res.json()) as SkillItem;
      localSkills = (localSkills ?? []).map((s) => (s.slug === slug ? updated : s));
      const choice = JSON.stringify({ slug, resolution, alt_version: altVersion ?? null });
      sessionStorage.setItem(SESSION_RESOLUTION_KEY, choice);
      sessionConflictChoice = choice;
      recordLog("resolve-conflict", slug, "ok", resolution);
    } else {
      recordLog("resolve-conflict", slug, "error", `HTTP ${res.status}`);
    }
  }

  function recommendedLabel(resolution: ConflictResolution): string {
    return resolution.replace(/_/g, " ");
  }

  const AGENTS = ["claude", "codex", "gemini", "opencode", "pi"] as const;
</script>

<header
  data-skills-header
  class={cn("flex items-center justify-between gap-4 border-b border-border pb-4 mb-4")}
>
  <h1 class={cn("text-2xl font-semibold tracking-tight")}>Skills</h1>
  <Button
    data-upgrade-all
    onclick={handleUpgradeAll}
    variant="secondary"
  >Upgrade all</Button>
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

{#if installLog.length > 0}
  <section data-install-log class={cn("mb-4 rounded-md border border-border p-3")}>
    <h2 class={cn("text-sm font-medium mb-2")}>Install log</h2>
    <ul class={cn("space-y-1 text-xs")}>
      {#each installLog as entry, index (entry.timestamp + index)}
        <li
          data-install-log-entry={index}
          data-install-log-result={entry.result}
          class={cn("flex items-baseline gap-2 font-mono")}
        >
          <span class={cn("text-muted-foreground")}>{entry.timestamp}</span>
          <span class={cn(entry.result === "ok" ? "text-success" : "text-destructive")}>{entry.result}</span>
          <span>{entry.action}</span>
          <span class={cn("font-semibold")}>{entry.slug}</span>
          {#if entry.message}<span class={cn("text-muted-foreground")}>· {entry.message}</span>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

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
              <td data-slot="table-cell" class={cn("p-2 align-middle font-medium")}>
                <div class="flex items-center gap-2">
                  <span>{skill.slug}</span>
                  {#if skill.upstream_conflict || (skill.source === "upstream" && !skill.content_hash)}
                    <span
                      data-update-available={skill.slug}
                      class={cn("rounded-sm border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] uppercase text-warning-foreground")}
                    >Update available</span>
                  {/if}
                </div>
              </td>
              <td data-slot="table-cell" data-skill-version class={cn("p-2 align-middle font-mono text-xs")}>{skill.version}</td>
              <td data-slot="table-cell" class={cn("p-2 align-middle text-muted-foreground")}>{skill.source}</td>
              <td data-slot="table-cell" class={cn("p-2 align-middle font-mono text-xs text-muted-foreground")}>{skill.content_hash ?? "-"}</td>
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
                  <Button
                    data-upgrade-skill
                    onclick={() => void handleUpgrade(skill.slug)}
                    variant="secondary"
                    size="sm"
                  >Upgrade</Button>
                  {#if confirmUninstall === skill.slug}
                    {@const dependents = dependentsOf(skill.slug, skills)}
                    <div data-uninstall-confirm={skill.slug} class="flex flex-col gap-1">
                      {#if dependents.length > 0}
                        <span data-uninstall-dependents={skill.slug} class={cn("text-xs text-warning-foreground")}
                          >Dependents: {dependents.map((d) => d.slug).join(", ")}</span>
                      {:else}
                        <span data-uninstall-no-dependents={skill.slug} class={cn("text-xs text-muted-foreground")}
                          >No dependents detected.</span>
                      {/if}
                      <div class="flex gap-1">
                        <Button
                          data-confirm-uninstall
                          onclick={() => void handleUninstall(skill.slug)}
                          variant="danger"
                          size="sm"
                        >Confirm</Button>
                        <Button
                          data-cancel-uninstall
                          onclick={() => (confirmUninstall = null)}
                          variant="ghost"
                          size="sm"
                        >Cancel</Button>
                      </div>
                    </div>
                  {:else}
                    <Button
                      data-uninstall-skill
                      onclick={() => (confirmUninstall = skill.slug)}
                      variant="secondary"
                      size="sm"
                    >Uninstall</Button>
                  {/if}
                </div>
              </td>
            </tr>
            {#if skill.upstream_conflict}
              <tr data-conflict-card data-conflict-slug={skill.slug} class={cn("border-b")}>
                <td colspan="6" class={cn("p-4")}>
                  <Dialog open>
                    <DialogContent
                      data-conflict-resolution-dialog={skill.slug}
                      class="sm:max-w-3xl"
                      showCloseButton={false}
                    >
                      <DialogHeader>
                        <DialogTitle>Resolve skill conflict</DialogTitle>
                        <DialogDescription>
                          {skill.upstream_conflict.installed_skill} {skill.upstream_conflict.installed_version}
                          conflicts with {skill.upstream_conflict.requested_skill} {skill.upstream_conflict.requested_version}.
                        </DialogDescription>
                      </DialogHeader>

                      <div class={cn("space-y-4")}>
                        <div class={cn("flex flex-wrap items-center gap-2")}>
                          <Badge variant="warning" data-recommended-resolution={skill.upstream_conflict.recommended_resolution}>
                            Recommended: {recommendedLabel(skill.upstream_conflict.recommended_resolution)}
                          </Badge>
                          {#if sessionConflictChoice || skill.upstream_conflict.session_resolution}
                            <Badge variant="outline" data-session-resolution>Session choice saved</Badge>
                          {/if}
                        </div>

                        <p data-conflict-reason class={cn("text-sm text-muted-foreground")}>
                          {skill.upstream_conflict.reason}
                        </p>

                        <div class="grid gap-4 md:grid-cols-2">
                          <div>
                            <h4 class={cn("mb-1 text-xs font-medium text-muted-foreground")}>Installed</h4>
                            <p data-installed-skill-version class={cn("mb-2 text-sm font-medium")}>
                              {skill.upstream_conflict.installed_skill} {skill.upstream_conflict.installed_version}
                            </p>
                            <pre data-conflict-local class={cn("max-h-32 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap")}>{skill.upstream_conflict.local_content}</pre>
                          </div>
                          <div>
                            <h4 class={cn("mb-1 text-xs font-medium text-muted-foreground")}>Requested</h4>
                            <p data-requested-skill-version class={cn("mb-2 text-sm font-medium")}>
                              {skill.upstream_conflict.requested_skill} {skill.upstream_conflict.requested_version}
                            </p>
                            <pre data-conflict-upstream class={cn("max-h-32 overflow-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap")}>{skill.upstream_conflict.upstream_content}</pre>
                          </div>
                        </div>

                        <div class={cn("grid gap-3 md:grid-cols-2")}>
                          <div data-conflict-option="alt_version" class={cn("rounded-md border border-border p-3")}>
                            <div class={cn("mb-2 flex items-center justify-between gap-2")}>
                              <Label for="skill-alt-version">Use alternative version</Label>
                              {#if skill.upstream_conflict.recommended_resolution === "alt_version"}
                                <Badge variant="success" size="sm">Recommended</Badge>
                              {/if}
                            </div>
                            <Select bind:value={selectedAltVersion} type="single">
                              <SelectTrigger id="skill-alt-version" data-alt-version-select aria-label="Alternative skill version">
                                <SelectValue placeholder={skill.upstream_conflict.alt_versions[0] ?? "No compatible version"} />
                              </SelectTrigger>
                              <SelectContent>
                                {#each skill.upstream_conflict.alt_versions as version (version)}
                                  <SelectItem value={version} label={version} />
                                {/each}
                              </SelectContent>
                            </Select>
                            <p class={cn("mt-2 text-xs text-muted-foreground")}>Installs a compatible version without changing the installed skill.</p>
                          </div>

                          <div data-conflict-option="force" class={cn("rounded-md border border-border p-3")}>
                            <div class={cn("mb-2 flex items-center gap-2")}>
                              <Checkbox bind:checked={forceAcknowledged} data-force-warning-ack aria-label="Acknowledge force warning" />
                              <Label>Force with warning</Label>
                            </div>
                            <p class={cn("text-xs text-muted-foreground")}>
                              Only available when the conflict is marked safe. May bypass compatibility checks.
                            </p>
                          </div>

                          <div data-conflict-option="skip" class={cn("rounded-md border border-border p-3")}>
                            <h4 class={cn("text-sm font-medium")}>Skip this skill</h4>
                            <p class={cn("mt-1 text-xs text-muted-foreground")}>Leaves the current installation unchanged for this session.</p>
                          </div>

                          <div data-conflict-option="upgrade_installed" class={cn("rounded-md border border-border p-3")}>
                            <h4 class={cn("text-sm font-medium")}>Upgrade installed first</h4>
                            <p class={cn("mt-1 text-xs text-muted-foreground")}>Updates the installed skill before retrying the requested install.</p>
                          </div>
                        </div>
                      </div>

                      <DialogFooter class="flex-wrap gap-2">
                        <Button
                          data-alt-version-confirm
                          variant="primary"
                          size="sm"
                          disabled={skill.upstream_conflict.alt_versions.length === 0}
                          onclick={() => void handleResolveConflict(
                            skill.slug,
                            "alt_version",
                            selectedAltVersion ?? skill.upstream_conflict?.alt_versions[0],
                          )}
                        >Use alt version</Button>
                        <Button
                          data-force-conflict
                          variant="danger"
                          size="sm"
                          disabled={!skill.upstream_conflict.force_safe || !forceAcknowledged}
                          onclick={() => void handleResolveConflict(skill.slug, "force")}
                        >Force</Button>
                        <Button
                          data-skip-conflict
                          variant="secondary"
                          size="sm"
                          onclick={() => void handleResolveConflict(skill.slug, "skip")}
                        >Skip</Button>
                        <Button
                          data-upgrade-installed-first
                          variant="secondary"
                          size="sm"
                          onclick={() => void handleResolveConflict(skill.slug, "upgrade_installed")}
                        >Upgrade installed first</Button>
                        <Button
                          data-keep-local
                          variant="ghost"
                          size="sm"
                          onclick={() => void handleResolveConflict(skill.slug, "keep_local")}
                        >Keep local</Button>
                        <Button
                          data-use-upstream
                          variant="ghost"
                          size="sm"
                          onclick={() => void handleResolveConflict(skill.slug, "use_upstream")}
                        >Use requested</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/await}
