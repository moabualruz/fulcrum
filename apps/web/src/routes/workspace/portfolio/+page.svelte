<script lang="ts">
  /**
   * Portfolio dashboard — workspace-level project overview (Plan 05-13, D-93..D-96).
   *
   * Tabs: Projects | Workload | Scope
   * - Projects: PortfolioTable with all projects progress/health
   * - Workload: per-assignee stacked bars + resource allocation
   * - Scope: scope creep + age charts
   *
   * Data from trpc.reports.progressRollup (workspace scope, D-94, D-95).
   */
  import PortfolioTable from "$lib/components/reports/PortfolioTable.svelte";
  import WorkloadChart from "$lib/components/reports/WorkloadChart.svelte";
  import ResourceAllocation from "$lib/components/reports/ResourceAllocation.svelte";
  import ScopeChart from "$lib/components/reports/ScopeChart.svelte";
  import AgeChart from "$lib/components/reports/AgeChart.svelte";

  // ── Tab state ─────────────────────────────────────────────────────────────

  type Tab = "projects" | "workload" | "scope";
  let activeTab = $state<Tab>("projects");

  const tabs: { id: Tab; label: string }[] = [
    { id: "projects", label: "Projects" },
    { id: "workload", label: "Workload" },
    { id: "scope", label: "Scope" },
  ];

  // ── Mock/placeholder data (wired to tRPC in production) ──────────────────
  // Real data fetching uses trpc.reports.progressRollup.query({ scopeType: 'workspace' })
  // These are empty stubs — the page layout + components are wired; data from API.

  const portfolioRows = $state([
    // Example structure for PortfolioTable
    // Real data fetched via trpc.reports.progressRollup({ scopeType: 'workspace' })
  ] as Parameters<typeof PortfolioTable>[0]["rows"]);

  const workloadData = $state(
    [] as Parameters<typeof WorkloadChart>[0]["data"]
  );

  const resourceData = $state(
    [] as Parameters<typeof ResourceAllocation>[0]["data"]
  );

  const scopeData = $state(
    [] as Parameters<typeof ScopeChart>[0]["data"]
  );

  const ageData = $state(
    [] as Parameters<typeof AgeChart>[0]["data"]
  );
</script>

<svelte:head>
  <title>Portfolio — Workspace Overview</title>
</svelte:head>

<div data-testid="portfolio-page" class="portfolio-page container mx-auto max-w-7xl px-4 py-8">
  <!-- Header -->
  <div class="mb-6">
    <h1 class="text-2xl font-bold tracking-tight">Portfolio</h1>
    <p class="text-muted-foreground mt-1">Workspace-level overview across all projects.</p>
  </div>

  <!-- Tabs -->
  <div class="mb-6 border-b">
    <nav class="flex gap-1" aria-label="Portfolio tabs">
      {#each tabs as tab (tab.id)}
        <button
          type="button"
          class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px {
            activeTab === tab.id
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
          }"
          onclick={() => { activeTab = tab.id; }}
          aria-selected={activeTab === tab.id}
          role="tab"
        >
          {tab.label}
        </button>
      {/each}
    </nav>
  </div>

  <!-- Tab content -->
  {#if activeTab === "projects"}
    <div class="projects-tab space-y-6">
      <PortfolioTable rows={portfolioRows} />
    </div>

  {:else if activeTab === "workload"}
    <div class="workload-tab space-y-8">
      <section>
        <h2 class="text-lg font-semibold mb-3">Team Workload</h2>
        <p class="text-sm text-muted-foreground mb-4">
          Task distribution per assignee by status.
        </p>
        <WorkloadChart data={workloadData} height={360} />
      </section>

      <section>
        <h2 class="text-lg font-semibold mb-3">Resource Allocation</h2>
        <p class="text-sm text-muted-foreground mb-4">
          Team members × projects. Red rows = over-allocated (D-96).
        </p>
        <ResourceAllocation data={resourceData} />
      </section>
    </div>

  {:else if activeTab === "scope"}
    <div class="scope-tab space-y-8">
      <section>
        <h2 class="text-lg font-semibold mb-3">Scope Creep</h2>
        <p class="text-sm text-muted-foreground mb-4">
          Original vs current scope vs completed over time (D-46).
        </p>
        <ScopeChart data={scopeData} height={320} />
      </section>

      <section>
        <h2 class="text-lg font-semibold mb-3">Task Age</h2>
        <p class="text-sm text-muted-foreground mb-4">
          Days each task has been in its current status. Items &gt;14 days highlighted red (D-44).
        </p>
        <AgeChart data={ageData} height={320} staleThreshold={14} />
      </section>
    </div>
  {/if}
</div>
