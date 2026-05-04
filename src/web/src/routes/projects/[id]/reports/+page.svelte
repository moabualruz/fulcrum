<script lang="ts">
	import type { PageData } from "./$types";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const tabs = ["burndown", "velocity", "cycle-time", "throughput", "wip", "cfd"] as const;
	type Tab = (typeof tabs)[number];
	let activeTab = $state<Tab>("burndown");

	const tabLabels: Record<Tab, string> = {
		burndown: "Burndown",
		velocity: "Velocity",
		"cycle-time": "Cycle Time",
		throughput: "Throughput",
		wip: "WIP",
		cfd: "CFD",
	};

	const hasData = $derived({
		burndown: data.reports.burndown.length > 0,
		velocity: data.reports.velocity.length > 0,
		"cycle-time": data.reports.cycleTime.bins.length > 0,
		throughput: data.reports.throughput.length > 0,
		wip: data.reports.wip.length > 0,
		cfd: data.reports.cfd.length > 0,
	});
</script>

<header
	data-reports-header
	class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
>
	<div class={cn("flex items-baseline gap-3")}>
		<a href="/projects/{data.project.id}" data-back-project class={cn("text-sm text-muted-foreground hover:underline")}>← {data.project.name}</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>Reports</h1>
	</div>

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
</header>

<!-- Tab navigation -->
<nav data-report-tabs class={cn("flex gap-1 border-b border-border mb-6")} aria-label="Report tabs">
	{#each tabs as tab}
		<button
			data-tab={tab}
			class={cn(
				"px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
				activeTab === tab
					? "border-primary text-primary"
					: "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
			)}
			onclick={() => (activeTab = tab)}
			aria-selected={activeTab === tab}
			role="tab"
		>
			{tabLabels[tab]}
		</button>
	{/each}
</nav>

<!-- Tab content -->
<section data-report-content class={cn("min-h-[300px]")}>
	{#if !hasData[activeTab]}
		<div data-empty-state class={cn("flex flex-col items-center justify-center py-16 text-muted-foreground")}>
			<p class={cn("text-lg font-medium")}>No data yet</p>
			<p class={cn("text-sm mt-1")}>Complete some tasks or configure sprints to see {tabLabels[activeTab].toLowerCase()} data.</p>
		</div>
	{:else if activeTab === "burndown"}
		<div data-chart-burndown>
			<h2 class={cn("text-lg font-semibold mb-4")}>Burndown</h2>
			<table class={cn("w-full text-sm")}>
				<thead>
					<tr class={cn("border-b border-border text-left")}>
						<th class={cn("py-2 px-3")}>Date</th>
						<th class={cn("py-2 px-3")}>Ideal</th>
						<th class={cn("py-2 px-3")}>Actual</th>
					</tr>
				</thead>
				<tbody>
					{#each data.reports.burndown as point}
						<tr class={cn("border-b border-border/50")}>
							<td class={cn("py-1.5 px-3 font-mono")}>{point.date}</td>
							<td class={cn("py-1.5 px-3")}>{point.ideal}</td>
							<td class={cn("py-1.5 px-3")}>{point.actual === -1 ? "—" : point.actual}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if activeTab === "velocity"}
		<div data-chart-velocity>
			<h2 class={cn("text-lg font-semibold mb-4")}>Velocity</h2>
			<table class={cn("w-full text-sm")}>
				<thead>
					<tr class={cn("border-b border-border text-left")}>
						<th class={cn("py-2 px-3")}>Sprint</th>
						<th class={cn("py-2 px-3")}>Points</th>
					</tr>
				</thead>
				<tbody>
					{#each data.reports.velocity as bar}
						<tr class={cn("border-b border-border/50")}>
							<td class={cn("py-1.5 px-3")}>{bar.sprint_name}</td>
							<td class={cn("py-1.5 px-3")}>
								<div class={cn("flex items-center gap-2")}>
									<div class={cn("h-4 bg-primary rounded")} style="width: {Math.max(4, bar.points * 8)}px"></div>
									<span>{bar.points}</span>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if activeTab === "cycle-time"}
		<div data-chart-cycle-time>
			<h2 class={cn("text-lg font-semibold mb-4")}>Cycle Time</h2>
			<div class={cn("flex gap-6 mb-4")}>
				<div class={cn("rounded-lg border border-border bg-muted/50 p-4")}>
					<p class={cn("text-xs text-muted-foreground")}>P50</p>
					<p class={cn("text-2xl font-bold")} data-p50>{data.reports.cycleTime.p50}d</p>
				</div>
				<div class={cn("rounded-lg border border-border bg-muted/50 p-4")}>
					<p class={cn("text-xs text-muted-foreground")}>P90</p>
					<p class={cn("text-2xl font-bold")} data-p90>{data.reports.cycleTime.p90}d</p>
				</div>
			</div>
			<table class={cn("w-full text-sm")}>
				<thead>
					<tr class={cn("border-b border-border text-left")}>
						<th class={cn("py-2 px-3")}>Days</th>
						<th class={cn("py-2 px-3")}>Count</th>
					</tr>
				</thead>
				<tbody>
					{#each data.reports.cycleTime.bins as bin}
						<tr class={cn("border-b border-border/50")}>
							<td class={cn("py-1.5 px-3 font-mono")}>{bin.days}</td>
							<td class={cn("py-1.5 px-3")}>{bin.count}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if activeTab === "throughput"}
		<div data-chart-throughput>
			<h2 class={cn("text-lg font-semibold mb-4")}>Throughput</h2>
			<table class={cn("w-full text-sm")}>
				<thead>
					<tr class={cn("border-b border-border text-left")}>
						<th class={cn("py-2 px-3")}>Week</th>
						<th class={cn("py-2 px-3")}>Tasks Completed</th>
					</tr>
				</thead>
				<tbody>
					{#each data.reports.throughput as point}
						<tr class={cn("border-b border-border/50")}>
							<td class={cn("py-1.5 px-3 font-mono")}>{point.week_start}</td>
							<td class={cn("py-1.5 px-3")}>{point.count}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if activeTab === "wip"}
		<div data-chart-wip>
			<h2 class={cn("text-lg font-semibold mb-4")}>Work In Progress</h2>
			<table class={cn("w-full text-sm")}>
				<thead>
					<tr class={cn("border-b border-border text-left")}>
						<th class={cn("py-2 px-3")}>Date</th>
						<th class={cn("py-2 px-3")}>Pending</th>
						<th class={cn("py-2 px-3")}>In Progress</th>
						<th class={cn("py-2 px-3")}>Blocked</th>
					</tr>
				</thead>
				<tbody>
					{#each data.reports.wip as point}
						<tr class={cn("border-b border-border/50")}>
							<td class={cn("py-1.5 px-3 font-mono")}>{point.date}</td>
							<td class={cn("py-1.5 px-3")}>{point.pending}</td>
							<td class={cn("py-1.5 px-3")}>{point.in_progress}</td>
							<td class={cn("py-1.5 px-3")}>{point.blocked}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if activeTab === "cfd"}
		<div data-chart-cfd>
			<h2 class={cn("text-lg font-semibold mb-4")}>Cumulative Flow</h2>
			<table class={cn("w-full text-sm")}>
				<thead>
					<tr class={cn("border-b border-border text-left")}>
						<th class={cn("py-2 px-3")}>Date</th>
						<th class={cn("py-2 px-3")}>Pending</th>
						<th class={cn("py-2 px-3")}>In Progress</th>
						<th class={cn("py-2 px-3")}>Blocked</th>
						<th class={cn("py-2 px-3")}>Completed</th>
						<th class={cn("py-2 px-3")}>Cancelled</th>
					</tr>
				</thead>
				<tbody>
					{#each data.reports.cfd as point}
						<tr class={cn("border-b border-border/50")}>
							<td class={cn("py-1.5 px-3 font-mono")}>{point.date}</td>
							<td class={cn("py-1.5 px-3")}>{point.pending}</td>
							<td class={cn("py-1.5 px-3")}>{point.in_progress}</td>
							<td class={cn("py-1.5 px-3")}>{point.blocked}</td>
							<td class={cn("py-1.5 px-3")}>{point.completed}</td>
							<td class={cn("py-1.5 px-3")}>{point.cancelled}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
