<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { AreaChart } from "layerchart";

  interface ForecastBand {
    date: string;
    p50: number;
    p75: number;
    p85: number;
    p95: number;
  }

  interface Props {
    remaining: number;
    throughputHistory: number[];
    targetDate?: string;
    scopeLabel?: string;
    height?: number;
  }

  let { remaining, throughputHistory = [], targetDate, scopeLabel, height = 320 }: Props = $props();

  let forecastData = $state<ForecastBand[]>([]);
  let completionDates = $state<{ p50: string; p75: string; p85: string; p95: string } | null>(null);

  // Monte Carlo simulation: 1000 iterations sampling from throughputHistory
  function runMonteCarlo(remaining: number, history: number[]): number[] {
    if (history.length === 0 || remaining <= 0) return [];
    const iterations = 1000;
    const completionDays: number[] = [];

    for (let i = 0; i < iterations; i++) {
      let left = remaining;
      let day = 0;
      while (left > 0 && day < 365) {
        // Sample with replacement from history
        const idx = Math.floor(Math.random() * history.length);
        const throughput = history[idx] ?? 0;
        left = Math.max(0, left - throughput);
        day++;
      }
      completionDays.push(day);
    }

    return completionDays.sort((a, b) => a - b);
  }

  function percentile(sorted: number[], p: number): number {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
  }

  function addDays(base: Date, days: number): string {
    const d = new Date(base.getTime() + days * 86400000);
    return d.toISOString().slice(0, 10);
  }

  onMount(() => {
    if (!browser || throughputHistory.length === 0 || remaining <= 0) return;

    const sorted = runMonteCarlo(remaining, throughputHistory);
    if (sorted.length === 0) return;

    const today = new Date();
    const p50d = percentile(sorted, 50);
    const p75d = percentile(sorted, 75);
    const p85d = percentile(sorted, 85);
    const p95d = percentile(sorted, 95);

    completionDates = {
      p50: addDays(today, p50d),
      p75: addDays(today, p75d),
      p85: addDays(today, p85d),
      p95: addDays(today, p95d),
    };

    // Build fan chart data: progress bands from today to p95
    const bands: ForecastBand[] = [];
    for (let d = 0; d <= p95d; d++) {
      const date = addDays(today, d);
      bands.push({
        date,
        p50: d <= p50d ? 1 : 0,
        p75: d <= p75d ? 0.75 : 0,
        p85: d <= p85d ? 0.5 : 0,
        p95: d <= p95d ? 0.25 : 0,
      });
    }
    forecastData = bands;
  });
</script>

<div data-testid="forecast-chart" class="forecast-chart" style="height: {height}px;">
  {#if scopeLabel}
    <div class="scope-label" style="font-size: 0.875rem; font-weight: 500; margin-bottom: 0.5rem;">
      {scopeLabel}
    </div>
  {/if}

  {#if browser && forecastData.length > 0}
    <AreaChart
      data={forecastData}
      x={(d: ForecastBand) => new Date(d.date)}
      y={(d: ForecastBand) => d.p95}
      series={[
        { key: "p95", label: "P95", value: (d: ForecastBand) => d.p95, color: "hsl(var(--chart-4))", props: { fillOpacity: 0.2 } },
        { key: "p85", label: "P85", value: (d: ForecastBand) => d.p85, color: "hsl(var(--chart-3))", props: { fillOpacity: 0.3 } },
        { key: "p75", label: "P75", value: (d: ForecastBand) => d.p75, color: "hsl(var(--chart-2))", props: { fillOpacity: 0.4 } },
        { key: "p50", label: "P50", value: (d: ForecastBand) => d.p50, color: "hsl(var(--chart-1))", props: { fillOpacity: 0.7 } },
      ]}
      legend
      tooltip
      grid
      axis
    />
    {#if completionDates}
      <div class="completion-dates" style="display: flex; gap: 1.5rem; font-size: 0.75rem; margin-top: 0.5rem; color: hsl(var(--muted-foreground));">
        <span>P50: {completionDates.p50}</span>
        <span>P75: {completionDates.p75}</span>
        <span>P85: {completionDates.p85}</span>
        <span>P95: {completionDates.p95}</span>
      </div>
    {/if}
  {:else if !browser}
    <div class="chart-ssr-placeholder" style="height: {height}px; background: hsl(var(--muted)); border-radius: 0.5rem;"></div>
  {:else}
    <div class="chart-empty" style="height: {height}px; display: flex; align-items: center; justify-content: center; color: hsl(var(--muted-foreground));">
      {remaining <= 0 ? "No remaining work to forecast" : throughputHistory.length === 0 ? "No throughput history available" : "Computing forecast..."}
    </div>
  {/if}
</div>
