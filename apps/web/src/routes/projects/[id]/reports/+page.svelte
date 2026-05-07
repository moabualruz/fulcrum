<script lang="ts">
	import type { PageData } from "./$types";
	import { cn } from "$lib/utils.js";
	import BurndownChart from "$lib/components/reports/BurndownChart.svelte";
	import VelocityChart from "$lib/components/reports/VelocityChart.svelte";
	import CfdChart from "$lib/components/reports/CfdChart.svelte";
	import CycleTimeChart from "$lib/components/reports/CycleTimeChart.svelte";
	import ThroughputChart from "$lib/components/reports/ThroughputChart.svelte";
	import WipChart from "$lib/components/reports/WipChart.svelte";
	import ForecastChart from "$lib/components/reports/ForecastChart.svelte";
	import ReportDatePicker from "$lib/components/reports/ReportDatePicker.svelte";
	import { page } from "$app/state";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const tabs = ["burndown", "velocity", "cycle-time", "throughput", "wip", "cfd", "forecast"] as const;
	type Tab = (typeof tabs)[number];
	function parseTab(value: string | null): Tab {
		return tabs.includes(value as Tab) ? (value as Tab) : "burndown";
	}

	let activeTab = $state<Tab>(parseTab(page.url.searchParams.get("tab")));

	const tabLabels: Record<Tab, string> = {
		burndown: "Burndown",
		velocity: "Velocity",
		"cycle-time": "Cycle Time",
		throughput: "Throughput",
		wip: "WIP",
		cfd: "CFD",
		forecast: "Forecast",
	};

	// Date range state
	let dateRange = $state({
		start: new Date(Date.now() - 30 * 86400000),
		end: new Date(),
	});

	// Transform server data to chart component prop shapes
	const burndownData = $derived(
		data.reports.burndown.map((d) => ({
			date: d.date,
			remaining: d.actual === -1 ? 0 : d.actual,
			ideal: d.ideal,
		}))
	);

	const velocityData = $derived(
		data.reports.velocity.map((d) => {
			const avg = data.reports.velocity.reduce((s, v) => s + v.points, 0) / (data.reports.velocity.length || 1);
			return { sprint: d.sprint_name, completed: d.points, average: avg };
		})
	);

	const cycleTimeData = $derived(
		data.reports.cycleTime.bins.map((b, i) => ({
			taskId: `task-${i}`,
			completedAt: new Date(Date.now() - i * 86400000).toISOString(),
			cycleTimeHours: b.days * 8,
		}))
	);

	const cycleTimePercentiles = $derived({
		p50: data.reports.cycleTime.p50 * 8,
		p75: data.reports.cycleTime.p90 * 8,
		p95: data.reports.cycleTime.p90 * 8,
	});

	const throughputData = $derived(
		data.reports.throughput.map((d) => {
			const avg = data.reports.throughput.reduce((s, v) => s + v.count, 0) / (data.reports.throughput.length || 1);
			return { week: d.week_start, completed: d.count, average: avg };
		})
	);

	const wipData = $derived(
		data.reports.wip.map((d) => ({
			date: d.date,
			wipCount: d.in_progress,
		}))
	);

	const cfdData = $derived(
		data.reports.cfd.map((d) => ({
			date: d.date,
			backlog: d.pending,
			started: d.in_progress,
			completed: d.completed,
			canceled: d.cancelled,
		}))
	);

	// Throughput history for Monte Carlo (weekly counts)
	const throughputHistory = $derived(data.reports.throughput.map((d) => d.count));

	// Remaining estimate from burndown last point
	const remainingPoints = $derived(
		burndownData.length > 0 ? (burndownData[burndownData.length - 1]?.remaining ?? 0) : 0
	);

	function handleDateChange(range: { start: Date; end: Date }) {
		dateRange = range;
	}

	$effect(() => {
		activeTab = parseTab(page.url.searchParams.get("tab"));
	});

	function exportCsv(tab: Tab) {
		let rows: string[][] = [];
		let filename = `${tab}-${data.project.id}.csv`;

		if (tab === "burndown") {
			rows = [["Date", "Remaining", "Ideal"], ...burndownData.map((d) => [d.date, String(d.remaining), String(d.ideal)])];
		} else if (tab === "velocity") {
			rows = [["Sprint", "Completed", "Average"], ...velocityData.map((d) => [d.sprint, String(d.completed), String(d.average.toFixed(1))])];
		} else if (tab === "throughput") {
			rows = [["Week", "Completed", "Average"], ...throughputData.map((d) => [d.week, String(d.completed), String(d.average.toFixed(1))])];
		}

		if (rows.length === 0) return;
		const csv = rows.map((r) => r.join(",")).join("\n");
		const blob = new Blob([csv], { type: "text/csv" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div data-testid="reports-page">
<header
	data-reports-header
	class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
>
	<div class={cn("flex items-baseline gap-3")}>
		<a href="/projects/{data.project.id}" data-back-project class={cn("text-sm text-muted-foreground hover:underline")}>← {data.project.name}</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>Reports</h1>
	</div>

	<div class={cn("flex items-center gap-3")}>
		<ReportDatePicker value={dateRange} onChange={handleDateChange} />

		{#if data.reports.sprints.length > 0}
			<div data-sprint-selector class={cn("flex items-center gap-2")}>
				<label for="sprint-select" class={cn("text-sm text-muted-foreground")}>Sprint</label>
				<select
					id="sprint-select"
					data-sprint-select
					class={cn("border-input bg-background h-9 rounded-md border px-3 py-1 text-sm shadow-xs")}
					onchange={(e) => {
						const target = e.target as HTMLSelectElement;
						const url = new URL(window.location.href);
						if (target.value) {
							url.searchParams.set("sprint", target.value);
						} else {
							url.searchParams.delete("sprint");
						}
						window.location.href = url.toString();
					}}
				>
					<option value="">All sprints</option>
					{#each data.reports.sprints as sprint}
						<option value={sprint.id} selected={data.selectedSprintId === sprint.id}>
							{sprint.name} ({sprint.start_date} – {sprint.end_date})
						</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>
</header>

<!-- Tab navigation -->
<nav data-report-tabs class={cn("flex gap-1 border-b border-border mb-6")} aria-label="Report tabs">
	{#each tabs as tab}
		<a
			href={`?tab=${tab}`}
			data-tab={tab}
			data-testid={`report-tab-${tab}`}
			class={cn(
				"px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
				activeTab === tab
					? "border-primary text-primary"
					: "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
			)}
			onpointerdown={() => (activeTab = tab)}
			onclick={() => (activeTab = tab)}
			onfocus={() => (activeTab = tab)}
			aria-selected={activeTab === tab}
			role="tab"
		>
			{tabLabels[tab]}
		</a>
	{/each}
</nav>

<!-- Tab content -->
<section data-report-content class={cn("min-h-[300px]")}>
	{#if activeTab === "burndown"}
		<div data-chart-burndown data-testid="chart-burndown" class={cn("space-y-3")}>
			<div class={cn("flex items-center justify-between")}>
				<div>
					<h2 class={cn("text-lg font-semibold")}>Burndown</h2>
					<p class={cn("text-sm text-muted-foreground")}>Remaining work vs ideal progress</p>
				</div>
				<button
					type="button"
					onclick={() => exportCsv("burndown")}
					class={cn("text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1")}
				>
					Export CSV
				</button>
			</div>
			<BurndownChart data={burndownData} />
		</div>
	{:else if activeTab === "velocity"}
		<div data-chart-velocity data-testid="chart-velocity" class={cn("space-y-3")}>
			<div class={cn("flex items-center justify-between")}>
				<div>
					<h2 class={cn("text-lg font-semibold")}>Velocity</h2>
					<p class={cn("text-sm text-muted-foreground")}>Story points completed per sprint</p>
				</div>
				<button
					type="button"
					onclick={() => exportCsv("velocity")}
					class={cn("text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1")}
				>
					Export CSV
				</button>
			</div>
			<VelocityChart data={velocityData} />
		</div>
	{:else if activeTab === "cycle-time"}
		<div data-chart-cycle-time data-testid="chart-cycle-time" class={cn("space-y-3")}>
			<div>
				<h2 class={cn("text-lg font-semibold")}>Cycle Time</h2>
				<p class={cn("text-sm text-muted-foreground")}>Time from started to completed per task</p>
			</div>
			<CycleTimeChart data={cycleTimeData} percentiles={cycleTimePercentiles} />
		</div>
	{:else if activeTab === "throughput"}
		<div data-chart-throughput data-testid="chart-throughput" class={cn("space-y-3")}>
			<div class={cn("flex items-center justify-between")}>
				<div>
					<h2 class={cn("text-lg font-semibold")}>Throughput</h2>
					<p class={cn("text-sm text-muted-foreground")}>Tasks completed per week (12-week rolling)</p>
				</div>
				<button
					type="button"
					onclick={() => exportCsv("throughput")}
					class={cn("text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1")}
				>
					Export CSV
				</button>
			</div>
			<ThroughputChart data={throughputData} />
		</div>
	{:else if activeTab === "wip"}
		<div data-chart-wip data-testid="chart-wip" class={cn("space-y-3")}>
			<div>
				<h2 class={cn("text-lg font-semibold")}>Work In Progress</h2>
				<p class={cn("text-sm text-muted-foreground")}>In-progress task count over time</p>
			</div>
			<WipChart data={wipData} />
		</div>
	{:else if activeTab === "cfd"}
		<div data-chart-cfd data-testid="chart-cfd" class={cn("space-y-3")}>
			<div>
				<h2 class={cn("text-lg font-semibold")}>Cumulative Flow Diagram</h2>
				<p class={cn("text-sm text-muted-foreground")}>Task distribution across statuses over time</p>
			</div>
			<CfdChart data={cfdData} />
		</div>
	{:else if activeTab === "forecast"}
		<div data-chart-forecast data-testid="chart-forecast" class={cn("space-y-3")}>
			<div>
				<h2 class={cn("text-lg font-semibold")}>Forecast</h2>
				<p class={cn("text-sm text-muted-foreground")}>Monte Carlo simulation — P50/P75/P85/P95 completion dates</p>
			</div>
			<ForecastChart
				remaining={remainingPoints}
				throughputHistory={throughputHistory}
				scopeLabel={data.reports.sprints.find((s) => s.id === data.selectedSprintId)?.name ?? "Project"}
			/>
		</div>
	{/if}
</section>
</div>
