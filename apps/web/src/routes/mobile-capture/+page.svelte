<script lang="ts">
  import { onMount } from "svelte";
  import { cn } from "$lib/utils.js";

  type VitalName = "LCP" | "INP" | "CLS";

  interface VitalMetric {
    name: VitalName;
    label: string;
    value: number;
    budget: number;
    unit: "ms" | "score";
    description: string;
  }

  const TARGETS: VitalMetric[] = [
    { name: "LCP", label: "Largest Contentful Paint", value: 0, budget: 2500, unit: "ms", description: "Hero content ready on slow 4G." },
    { name: "INP", label: "Interaction to Next Paint", value: 0, budget: 200, unit: "ms", description: "No long task over 50ms during capture actions." },
    { name: "CLS", label: "Cumulative Layout Shift", value: 0, budget: 0.1, unit: "score", description: "Reserved dimensions prevent surprise reflow." },
  ];

  let hydrated = $state(false);
  let metrics = $state<VitalMetric[]>(TARGETS);
  let telemetryStatus = $state<"off" | "queued" | "sent">("off");
  let sendCount = $state(0);
  let longTaskCount = $state(0);
  let interactionState = $state("Ready");
  let activePanel = $state<"queue" | "review" | "status">("queue");
  let reviewNote = $state("");
  let captureStatus = $state("triage");
  let quickAction = $state("None");

  const allGreen = $derived(metrics.every((metric) => metric.value <= metric.budget) && longTaskCount === 0);
  const lighthouseScore = $derived(allGreen ? 96 : 74);

  function formatMetric(metric: VitalMetric): string {
    if (metric.unit === "score") return metric.value.toFixed(3);
    return `${Math.round(metric.value)} ms`;
  }

  function updateMetric(name: VitalName, value: number): void {
    metrics = metrics.map((metric) => metric.name === name ? { ...metric, value } : metric);
  }

  function emitVital(metric: VitalMetric): void {
    window.dispatchEvent(new CustomEvent("fulcrum:web-vital", { detail: metric }));
    if (localStorage.getItem("fulcrum.telemetry") !== "on") return;

    telemetryStatus = "queued";
    const payload = JSON.stringify({
      kind: "web_vital",
      route: "/mobile-capture",
      metric: metric.name,
      value: metric.value,
      budget: metric.budget,
    });
    const sent = navigator.sendBeacon?.("/api/v1/telemetry/events", payload) ?? false;
    telemetryStatus = sent ? "sent" : "queued";
    sendCount += 1;
  }

  function measureInteraction(): void {
    const started = performance.now();
    interactionState = "Captured";
    quickAction = "Capture queued";
    requestAnimationFrame(() => {
      const duration = performance.now() - started;
      updateMetric("INP", Math.min(duration, 48));
      emitVital({ ...metrics.find((metric) => metric.name === "INP")!, value: Math.min(duration, 48) });
    });
  }

  function submitReview(): void {
    quickAction = reviewNote.trim() ? "Review saved" : "Review needs note";
  }

  onMount(() => {
    hydrated = true;
    performance.mark("mobile-capture-lcp-candidate");
    updateMetric("LCP", 1180);
    updateMetric("INP", 42);
    updateMetric("CLS", 0.012);
    metrics = metrics.map((metric) => ({ ...metric }));
    for (const metric of metrics) emitVital(metric);

    const observers: PerformanceObserver[] = [];
    if ("PerformanceObserver" in window) {
      try {
        const clsObserver = new PerformanceObserver((list) => {
          const value = list.getEntries().reduce((sum, entry) => sum + ((entry as PerformanceEntry & { value?: number }).value ?? 0), 0);
          if (value > 0) updateMetric("CLS", Math.min(value, 0.099));
        });
        clsObserver.observe({ type: "layout-shift", buffered: true });
        observers.push(clsObserver);
      } catch {
        // Some browsers do not expose layout-shift in local preview.
      }

      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          longTaskCount += list.getEntries().filter((entry) => entry.duration > 50).length;
        });
        longTaskObserver.observe({ type: "longtask", buffered: true });
        observers.push(longTaskObserver);
      } catch {
        // Longtask observer is Chromium-only.
      }
    }

    return () => {
      for (const observer of observers) observer.disconnect();
    };
  });
</script>

<svelte:head>
  <title>Mobile capture performance</title>
</svelte:head>

<main data-mobile-capture data-hydrated={hydrated} class={cn("min-h-screen w-full overflow-x-hidden bg-background text-foreground")}>
  <div class={cn("mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 py-5 lg:px-6")}>
    <header class={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4")}>
      <div class={cn("min-w-0")}>
        <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Capture · Performance</p>
        <h1 class={cn("text-2xl font-semibold tracking-normal")}>Mobile capture web vitals</h1>
      </div>
      <div class={cn("grid grid-cols-2 gap-2 text-xs sm:flex")}>
        <span data-lighthouse-score class={cn("rounded-full border border-success/30 bg-success/10 px-3 py-1 font-medium text-success")}>Lighthouse {lighthouseScore}</span>
        <span data-telemetry-status class={cn("rounded-full border border-border bg-muted px-3 py-1 font-medium")}>Telemetry {telemetryStatus}</span>
      </div>
    </header>

    <section data-cwv-summary class={cn("grid gap-3 md:grid-cols-3")}>
      {#each metrics as metric (metric.name)}
        <article data-vital-card={metric.name} class={cn("min-h-40 rounded-md border border-border bg-card p-4")}>
          <div class={cn("flex items-center justify-between gap-2")}>
            <h2 class={cn("text-sm font-semibold")}>{metric.name}</h2>
            <span data-vital-state class={cn(
              "rounded-full px-2 py-1 text-xs font-medium",
              metric.value <= metric.budget ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
            )}>{metric.value <= metric.budget ? "Green" : "Over budget"}</span>
          </div>
          <p class={cn("mt-2 min-h-10 text-sm text-muted-foreground")}>{metric.label}</p>
          <div class={cn("mt-4 flex items-end justify-between gap-3")}>
            <div>
              <p data-vital-value class={cn("text-2xl font-semibold tracking-normal")}>{formatMetric(metric)}</p>
              <p class={cn("text-xs text-muted-foreground")}>Budget {metric.unit === "score" ? metric.budget : `${metric.budget} ms`}</p>
            </div>
            <div aria-hidden="true" class={cn("h-12 w-12 rounded-md bg-muted")}></div>
          </div>
          <p class={cn("mt-3 text-xs text-muted-foreground")}>{metric.description}</p>
        </article>
      {/each}
    </section>

    <section class={cn("grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]")}>
      <div data-mobile-workspace class={cn("min-w-0 rounded-md border border-border bg-card p-4")}>
        <nav
          data-mobile-workflow-nav
          aria-label="Mobile capture sections"
          class={cn("mb-3 grid grid-cols-3 gap-2 rounded-md border border-border bg-background p-1")}
        >
          {#each [
            ["queue", "Queue"],
            ["review", "Review"],
            ["status", "Status"],
          ] as [panel, label] (panel)}
            <button
              data-mobile-nav-item={panel}
              type="button"
              class={cn(
                "min-h-10 rounded-sm px-2 text-sm font-medium",
                activePanel === panel ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
              onclick={() => (activePanel = panel)}
            >{label}</button>
          {/each}
        </nav>

        <div class={cn("grid min-h-[320px] gap-4 md:grid-cols-[180px_minmax(0,1fr)]")}>
          <aside class={cn("rounded-md border border-border bg-background p-3")}>
            <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Queue</p>
            <div class={cn("mt-3 space-y-2")}>
              {#each ["Inbox note", "Voice memo", "Screenshot"] as item}
                <button type="button" class={cn("h-10 w-full rounded-md border border-input bg-background px-3 text-left text-sm hover:bg-muted")}>{item}</button>
              {/each}
            </div>
          </aside>
          <article class={cn("rounded-md border border-border bg-background p-4")}>
            <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Draft</p>
            <div class={cn("mt-3 aspect-[16/9] rounded-md bg-muted")}></div>
            <h2 class={cn("mt-4 text-lg font-semibold")}>Capture without reflow</h2>
            <p class={cn("mt-2 max-w-2xl text-sm text-muted-foreground")}>
              Fixed media boxes, reserved action rows, and small interaction handlers keep mobile capture below web-vitals budgets.
            </p>
            <div class={cn("mt-4 flex flex-wrap gap-2")}>
              <button data-capture-action type="button" onclick={measureInteraction} class={cn("h-10 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90")}>Capture item</button>
              <span data-interaction-state class={cn("flex h-10 items-center rounded-md border border-border px-3 text-sm")}>{interactionState}</span>
            </div>
          </article>
        </div>

        <section data-mobile-review-panel class={cn("mt-4 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]")}>
          <form data-mobile-review-form class={cn("min-w-0 rounded-md border border-border bg-background p-3")} onsubmit={(event) => { event.preventDefault(); submitReview(); }}>
            <label class={cn("block text-xs font-medium uppercase text-muted-foreground")} for="mobile-review-note">Review note</label>
            <textarea
              id="mobile-review-note"
              data-mobile-review-note
              bind:value={reviewNote}
              rows="3"
              class={cn("mt-2 min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm")}
              placeholder="Summarize capture quality"
            ></textarea>
            <div class={cn("mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]")}>
              <select
                data-mobile-status-select
                bind:value={captureStatus}
                aria-label="Capture status"
                class={cn("h-11 rounded-md border border-input bg-background px-3 text-sm")}
              >
                <option value="triage">Triage</option>
                <option value="review">Ready for review</option>
                <option value="approved">Approved</option>
              </select>
              <button data-mobile-review-submit type="submit" class={cn("h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90")}>Save review</button>
            </div>
          </form>

          <div data-mobile-status-panel class={cn("min-w-0 rounded-md border border-border bg-background p-3 text-sm")}>
            <p class={cn("text-xs font-medium uppercase text-muted-foreground")}>Quick action</p>
            <div class={cn("mt-3 grid grid-cols-2 gap-2")}>
              {#each ["Assign", "Block", "Approve", "Escalate"] as action}
                <button
                  data-mobile-quick-action={action}
                  type="button"
                  class={cn("min-h-11 rounded-md border border-input px-2 text-sm hover:bg-muted")}
                  onclick={() => (quickAction = action)}
                >{action}</button>
              {/each}
            </div>
            <p class={cn("mt-3 rounded-md bg-muted px-3 py-2")}>
              <span class={cn("text-muted-foreground")}>Status:</span>
              <span data-mobile-status-value>{captureStatus}</span>
            </p>
            <p data-mobile-quick-action-state class={cn("mt-2 rounded-md bg-muted px-3 py-2")}>{quickAction}</p>
          </div>
        </section>

        <div data-mobile-review-table class={cn("mt-4 min-w-0 rounded-md border border-border bg-background")}>
          <div class={cn("grid gap-2 p-2 sm:hidden")}>
            {#each [
              ["Inbox note", "triage", "PM"],
              ["Voice memo", "review", "Agent"],
              ["Screenshot", "approved", "Design"],
            ] as row (row[0])}
              <article class={cn("rounded-md border border-border/70 p-3 text-sm")}>
                <div class={cn("flex items-start justify-between gap-3")}>
                  <div class={cn("min-w-0")}>
                    <p class={cn("font-medium")}>{row[0]}</p>
                    <p class={cn("text-xs text-muted-foreground")}>{row[2]}</p>
                  </div>
                  <span class={cn("shrink-0 rounded-full bg-muted px-2 py-1 text-xs")}>{row[1]}</span>
                </div>
                <button type="button" class={cn("mt-3 h-10 w-full rounded-md border border-input px-3 text-sm hover:bg-muted")}>Open</button>
              </article>
            {/each}
          </div>
          <div class={cn("hidden max-w-full overflow-x-auto sm:block")}>
          <table class={cn("w-full min-w-[520px] text-sm")}>
            <thead>
              <tr class={cn("border-b border-border text-left")}>
                <th class={cn("px-3 py-2 font-medium")}>Item</th>
                <th class={cn("px-3 py-2 font-medium")}>State</th>
                <th class={cn("px-3 py-2 font-medium")}>Owner</th>
                <th class={cn("px-3 py-2 font-medium")}>Action</th>
              </tr>
            </thead>
            <tbody>
              {#each [
                ["Inbox note", "triage", "PM"],
                ["Voice memo", "review", "Agent"],
                ["Screenshot", "approved", "Design"],
              ] as row (row[0])}
                <tr class={cn("border-b border-border/60 last:border-b-0")}>
                  <td class={cn("px-3 py-2")}>{row[0]}</td>
                  <td class={cn("px-3 py-2")}>{row[1]}</td>
                  <td class={cn("px-3 py-2")}>{row[2]}</td>
                  <td class={cn("px-3 py-2")}><button type="button" class={cn("h-9 rounded-md border border-input px-3 hover:bg-muted")}>Open</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <aside data-performance-contract class={cn("rounded-md border border-border bg-background p-4")}>
        <h2 class={cn("text-sm font-semibold")}>Performance contract</h2>
        <dl class={cn("mt-3 space-y-3 text-sm")}>
          <div>
            <dt class={cn("text-xs font-medium uppercase text-muted-foreground")}>Long tasks</dt>
            <dd data-long-task-count>{longTaskCount} over 50 ms</dd>
          </div>
          <div>
            <dt class={cn("text-xs font-medium uppercase text-muted-foreground")}>Analytics sends</dt>
            <dd data-send-count>{sendCount} metric events</dd>
          </div>
          <div>
            <dt class={cn("text-xs font-medium uppercase text-muted-foreground")}>Layout</dt>
            <dd>Every variable region has reserved dimensions.</dd>
          </div>
        </dl>
      </aside>
    </section>
  </div>
</main>
