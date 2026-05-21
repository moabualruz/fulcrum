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
	import ReviewWorkbench from "$lib/components/review/ReviewWorkbench.svelte";
	import { page } from "$app/state";

	type ReviewWorkbenchFile = {
		path: string;
		oldPath?: string;
		patch: string;
		additions: number;
		deletions: number;
		index?: number;
		viewed?: boolean;
		active?: boolean;
		annotationCount: number;
		searchMatchCount: number;
	};

	type ReviewWorkbenchTreeNode = {
		type: "file" | "folder";
		name: string;
		path: string;
		additions: number;
		deletions: number;
		fileIndex?: number;
		children?: ReviewWorkbenchTreeNode[];
	};

	type ReviewWorkbenchAnnotation = {
		id: string;
		type: string;
		scope?: "file" | "line";
		filePath: string;
		lineStart: number;
		lineEnd: number;
		side?: "old" | "new";
		text?: string;
		severity?: string;
		suggestedCode?: string;
		originalCode?: string;
		conventionalLabel?: string;
		decorations?: string[];
	};

	type ReviewWorkbenchSearchMatch = {
		id: string;
		filePath: string;
		side: "addition" | "deletion" | "context";
		lineNumber: number;
		snippet: string;
	};

	type ReviewWorkbenchModel = {
		projectId?: string;
		traceId?: string;
		reviewId?: string;
		files: ReviewWorkbenchFile[];
		visibleFiles: ReviewWorkbenchFile[];
		selectedFile: ReviewWorkbenchFile | null;
		fileTree: ReviewWorkbenchTreeNode[];
		annotationGroups: Array<{
			filePath: string;
			annotations: ReviewWorkbenchAnnotation[];
			blockingCount: number;
			suggestionCount: number;
		}>;
		search: {
			query: string;
			groups: Array<{
				filePath: string;
				matches: ReviewWorkbenchSearchMatch[];
			}>;
			activeMatch: ReviewWorkbenchSearchMatch | null;
			previousMatchId: string | null;
			nextMatchId: string | null;
		};
		suggestions: Array<{
			annotationId: string;
			filePath: string;
			lineStart: number;
			lineEnd: number;
			canApply: boolean;
			originalCode?: string;
			suggestedCode: string;
		}>;
		feedbackMarkdown: string;
		submission: {
			targets: Array<{
				prUrl: string;
				prNumber: number;
				prTitle: string;
				prRepo: string;
				fileCount: number;
				annotationCount: number;
				status: string;
			}>;
			orphans: Array<{
				reason: string;
				markdown: string;
				annotations: ReviewWorkbenchAnnotation[];
			}>;
		};
		liveLog: {
			displayText: string;
			isLive?: boolean;
			hasOutput?: boolean;
			isWaiting?: boolean;
			truncated?: boolean;
		};
		summary: {
			fileCount: number;
			visibleFileCount: number;
			viewedFileCount: number;
			annotationCount: number;
			blockingAnnotationCount: number;
			suggestionCount: number;
			searchMatchCount: number;
		};
	};

	interface Props {
		data: PageData;
		form?: {
			ok: boolean;
			mode?: "finalQa" | "finalQaGate" | "uatHandoff" | "uatDecision" | "autoDecision" | "e2eRun" | "reviewWorkbench" | "reviewSession";
			message?: string;
			report?: {
				traceId: string;
				status: "passed" | "failed";
				nextAction: string;
				readyForUserAcceptance: boolean;
				summary: {
					taskCount: number;
					docCount: number;
					openFeedbackRunCount: number;
				};
				checks: Array<{ id: string; status: "pass" | "fail" | "warn"; details: string }>;
			};
			gate?: {
				traceId?: string;
				loopAttempted: boolean;
				readyForUserAcceptance: boolean;
				nextAction: string;
				feedbackLoop: {
					iterations?: number;
					exhausted: boolean;
					stopReason: string;
				} | null;
				finalQa: {
					status: "passed" | "failed";
					nextAction: string;
					readyForUserAcceptance: boolean;
					summary: {
						openFeedbackRunCount: number;
					};
				};
			};
			handoff?: {
				traceId?: string;
				status: "ready" | "blocked";
				finalQaStatus: "passed" | "failed";
				nextAction: string;
				reviewSessions: Array<{
					id: string;
					type: "uat" | "code_review";
					title: string;
					status: string;
				}>;
				decisionOptions: Array<{ id: string; label: string; description: string }>;
			};
			decision?: {
				traceId?: string;
				status: "review_started" | "changes_requested" | "approved" | "blocked";
				nextAction: string;
				decision: string;
				reviewType: "uat" | "code_review";
				feedbackRuns: Array<{ id: string; taskId: string; agent: string; status: string }>;
				generatedE2eTests: Array<{
					artifactId: string;
					filename: string;
					path: string;
					runner: "bun" | "playwright";
					storePath: string;
					bodyPath: string;
					coverageCases?: Array<{ id: string; criterion: string }>;
				}>;
			};
			autoDecision?: {
				traceId?: string;
				settingKey: string;
				status: "not_configured" | "disabled" | "applied" | "blocked";
				nextAction: string;
				config: {
					enabled: boolean;
					decision: string;
					reviewType: "uat" | "code_review";
				} | null;
				decision: {
					status: string;
					generatedE2eTests: Array<{
						artifactId: string;
						filename: string;
						path: string;
						runner: "bun" | "playwright";
						storePath: string;
						bodyPath: string;
						coverageCases?: Array<{ id: string; criterion: string }>;
					}>;
				} | null;
			};
			e2eRun?: {
				traceId?: string;
				runner: "bun" | "playwright";
				status: "passed" | "failed" | "planned";
				command: string[];
				cwd?: string;
				testFiles: string[];
				artifactIds: string[];
				stdout: string;
				stderr: string;
				exitCode: number | null;
				ciCommand: string[];
				ciEnv: Record<string, string>;
			};
				reviewWorkbench?: {
					projectId?: string;
					traceId?: string;
				reviewId?: string;
				files: ReviewWorkbenchFile[];
				visibleFiles: ReviewWorkbenchFile[];
				selectedFile: ReviewWorkbenchFile | null;
				fileTree: ReviewWorkbenchTreeNode[];
				annotationGroups: Array<{
					filePath: string;
					annotations: ReviewWorkbenchAnnotation[];
					blockingCount: number;
					suggestionCount: number;
				}>;
				search: {
					query: string;
					groups: Array<{
						filePath: string;
						matches: ReviewWorkbenchSearchMatch[];
					}>;
					activeMatch: ReviewWorkbenchSearchMatch | null;
					previousMatchId: string | null;
					nextMatchId: string | null;
				};
				suggestions: Array<{
					annotationId: string;
					filePath: string;
					lineStart: number;
					lineEnd: number;
					canApply: boolean;
					originalCode?: string;
					suggestedCode: string;
				}>;
				feedbackMarkdown: string;
				submission: {
					targets: Array<{
						prUrl: string;
						prNumber: number;
						prTitle: string;
						prRepo: string;
						fileCount: number;
						annotationCount: number;
						status: string;
					}>;
					orphans: Array<{
						reason: string;
						markdown: string;
						annotations: ReviewWorkbenchAnnotation[];
					}>;
				};
				liveLog: {
					displayText: string;
					isLive?: boolean;
					hasOutput?: boolean;
					isWaiting?: boolean;
					truncated?: boolean;
				};
				summary: {
					fileCount: number;
					visibleFileCount: number;
					viewedFileCount: number;
					annotationCount: number;
					blockingAnnotationCount: number;
					suggestionCount: number;
					searchMatchCount: number;
				};
			};
				reviewSession?: {
					projectId: string;
					traceId?: string;
				reviewId: string;
				reviewType: "plan" | "uat" | "code_review";
					title?: string;
					status: "saved" | "loaded" | "annotated";
					revision: number;
					model: ReviewWorkbenchModel;
				};
		};
	}

	let { data, form }: Props = $props();

	const tabs = ["burndown", "velocity", "cycle-time", "throughput", "wip", "cfd", "forecast", "final-qa"] as const;
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
		wip: "Active work",
		cfd: "CFD",
		forecast: "Forecast",
		"final-qa": "Final QA",
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

<div data-testid="reports-page" class={cn("min-w-0 overflow-x-hidden px-4 py-4 sm:px-6")}>
<header
	data-reports-header
	class={cn("mb-4 flex min-w-0 flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between")}
>
	<div class={cn("flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3")}>
		<a href="/projects/{data.project.id}" data-back-project class={cn("min-w-0 break-words text-sm text-muted-foreground hover:underline")}>← {data.project.name}</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>Reports</h1>
	</div>

	<div class={cn("flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center")}>
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
<nav data-report-tabs class={cn("mb-6 flex max-w-full gap-1 overflow-x-auto border-b border-border pb-px")} aria-label="Report tabs">
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
<section data-report-content class={cn("min-h-[300px] min-w-0")}>
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
	{:else if activeTab === "final-qa"}
		<div data-final-qa-panel class={cn("space-y-4")}>
			<div class={cn("flex items-start justify-between gap-4")}>
				<div>
					<h2 class={cn("text-lg font-semibold")}>Final QA</h2>
					<p class={cn("text-sm text-muted-foreground")}>Docs, task criteria, runs, artifacts, and review feedback</p>
				</div>
				<div class={cn("grid gap-2")}>
					<form method="POST" action="?/finalQa" class={cn("flex items-center gap-2")}>
						<label for="final-qa-trace" class={cn("text-sm text-muted-foreground")}>Trace</label>
						<input
							id="final-qa-trace"
							name="traceId"
							value={`trace-final-qa-${data.project.id}`}
							class={cn("h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm")}
						/>
						<button
							type="submit"
							class={cn("h-9 rounded-md border border-border bg-primary px-3 text-sm font-medium text-primary-foreground")}
						>
							Run Final QA
						</button>
					</form>
					<form method="POST" action="?/finalQaGate" class={cn("grid gap-2 rounded-md border border-border p-3")}>
						<input type="hidden" name="traceId" value={`trace-final-qa-${data.project.id}`} />
						<div class={cn("grid gap-2 sm:grid-cols-2")}>
							<label class={cn("grid gap-1 text-sm")}>
								<span class={cn("text-muted-foreground")}>Reviewer</span>
								<input name="reviewerAgent" value="qa-reviewer" class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")} />
							</label>
							<label class={cn("grid gap-1 text-sm")}>
								<span class={cn("text-muted-foreground")}>Feedback Agent</span>
								<input name="feedbackAgent" value="codex" class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")} />
							</label>
						</div>
						<div class={cn("flex items-center justify-between gap-2")}>
							<input type="hidden" name="maxIterations" value="10" />
							<span class={cn("text-xs text-muted-foreground")}>Runs automated feedback before handoff.</span>
							<button
								type="submit"
								class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
							>
								Run QA Gate
							</button>
						</div>
					</form>
					<form method="POST" action="?/uatHandoff" class={cn("flex items-center justify-end gap-2")}>
						<label for="uat-handoff-trace" class={cn("text-sm text-muted-foreground")}>Trace</label>
						<input
							id="uat-handoff-trace"
							name="traceId"
							value={`trace-final-qa-${data.project.id}`}
							class={cn("h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm")}
						/>
						<button
							type="submit"
							class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
						>
							Prepare UAT
						</button>
					</form>
					<form method="POST" action="?/uatDecision" class={cn("grid gap-2 rounded-md border border-border p-3")}>
						<input type="hidden" name="traceId" value={`trace-final-qa-${data.project.id}`} />
						<input type="hidden" name="decision" value="approve_without_manual_review" />
						<input type="hidden" name="reviewType" value="uat" />
						<input type="hidden" name="e2eRunner" value="playwright" />
						<label for="uat-decision-feedback" class={cn("text-sm text-muted-foreground")}>Decision note</label>
						<textarea
							id="uat-decision-feedback"
							name="feedbackText"
							rows="2"
							class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
						>Approved.</textarea>
						<button
							type="submit"
							class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
						>
							Approve UAT
						</button>
					</form>
					<form method="POST" action="?/autoDecision" class={cn("flex items-center justify-end gap-2")}>
						<label for="auto-decision-trace" class={cn("text-sm text-muted-foreground")}>Trace</label>
						<input
							id="auto-decision-trace"
							name="traceId"
							value={`trace-final-qa-${data.project.id}`}
							class={cn("h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm")}
						/>
						<button
							type="submit"
							class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
						>
							Apply Auto Decision
						</button>
					</form>
					<form method="POST" action="?/e2eRun" class={cn("flex items-center justify-end gap-2")}>
						<label for="e2e-run-trace" class={cn("text-sm text-muted-foreground")}>Trace</label>
						<input
							id="e2e-run-trace"
							name="traceId"
							value={`trace-final-qa-${data.project.id}`}
							class={cn("h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm")}
						/>
						<select
							name="runner"
							aria-label="Generated E2E runner"
							class={cn("h-9 rounded-md border border-input bg-background px-2 text-sm")}
						>
							<option value="bun">Bun</option>
							<option value="playwright">Playwright</option>
						</select>
						<label class={cn("flex items-center gap-1 text-sm text-muted-foreground")}>
							<input type="checkbox" name="planOnly" value="1" />
							Plan
						</label>
						<button
							type="submit"
							class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
						>
							Run Generated E2E
						</button>
					</form>
					<form method="POST" action="?/reviewWorkbench" class={cn("grid gap-2 rounded-md border border-border p-3")}>
						<input type="hidden" name="traceId" value={`trace-final-qa-${data.project.id}`} />
						<input type="hidden" name="reviewId" value={`review-${data.project.id}`} />
						<label for="review-workbench-search" class={cn("text-sm text-muted-foreground")}>Search</label>
						<input
							id="review-workbench-search"
							name="searchQuery"
							value="trace"
							class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
						/>
						<label for="review-workbench-files" class={cn("text-sm text-muted-foreground")}>Diff files JSON</label>
						<textarea
							id="review-workbench-files"
							name="filesJson"
							rows="3"
							class={cn("w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs")}
						></textarea>
						<label for="review-workbench-annotations" class={cn("text-sm text-muted-foreground")}>Annotations JSON</label>
						<textarea
							id="review-workbench-annotations"
							name="annotationsJson"
							rows="3"
							class={cn("w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs")}
						></textarea>
						<button
							type="submit"
							class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
						>
							Build Review Workbench
						</button>
					</form>
					<form method="POST" action="?/reviewSessionSave" class={cn("grid gap-2 rounded-md border border-border p-3")}>
						<input type="hidden" name="traceId" value={`trace-final-qa-${data.project.id}`} />
						<input type="hidden" name="reviewId" value={`review-${data.project.id}`} />
						<input type="hidden" name="reviewType" value="code_review" />
						<input type="hidden" name="title" value="Persisted review session" />
						<input type="hidden" name="searchQuery" value="trace" />
						<label for="review-session-save-files" class={cn("text-sm text-muted-foreground")}>Session files JSON</label>
						<textarea
							id="review-session-save-files"
							name="filesJson"
							rows="3"
							class={cn("w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs")}
						></textarea>
						<label for="review-session-save-annotations" class={cn("text-sm text-muted-foreground")}>Session annotations JSON</label>
						<textarea
							id="review-session-save-annotations"
							name="annotationsJson"
							rows="3"
							class={cn("w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs")}
						></textarea>
						<button
							type="submit"
							class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
						>
							Save Review Session
						</button>
					</form>
					<form method="POST" action="?/reviewSessionLoad" class={cn("flex items-center justify-end gap-2")}>
						<label for="review-session-load-id" class={cn("text-sm text-muted-foreground")}>Review</label>
						<input
							id="review-session-load-id"
							name="reviewId"
							value={`review-${data.project.id}`}
							class={cn("h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm")}
						/>
						<input type="hidden" name="searchQuery" value="trace" />
						<button
							type="submit"
							class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
						>
							Load Review Session
						</button>
					</form>
					<form method="POST" action="?/reviewSessionAnnotate" class={cn("grid gap-2 rounded-md border border-border p-3")}>
						<input type="hidden" name="reviewId" value={`review-${data.project.id}`} />
						<input type="hidden" name="type" value="suggestion" />
						<input type="hidden" name="scope" value="line" />
						<input type="hidden" name="side" value="new" />
						<input type="hidden" name="searchQuery" value="trace" />
						<label for="review-session-annotation-file" class={cn("text-sm text-muted-foreground")}>File</label>
						<input
							id="review-session-annotation-file"
							name="filePath"
							value="src/app.ts"
							class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
						/>
						<div class={cn("grid gap-2 sm:grid-cols-2")}>
							<label class={cn("grid gap-1 text-sm text-muted-foreground")}>
								Start
								<input
									name="lineStart"
									value="1"
									class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
								/>
							</label>
							<label class={cn("grid gap-1 text-sm text-muted-foreground")}>
								End
								<input
									name="lineEnd"
									value="1"
									class={cn("h-9 rounded-md border border-input bg-background px-3 py-1 text-sm")}
								/>
							</label>
						</div>
						<label for="review-session-annotation-text" class={cn("text-sm text-muted-foreground")}>Annotation</label>
						<textarea
							id="review-session-annotation-text"
							name="annotationText"
							rows="2"
							class={cn("w-full rounded-md border border-input bg-background px-3 py-2 text-sm")}
						>Inline review note.</textarea>
						<label for="review-session-suggested-code" class={cn("text-sm text-muted-foreground")}>Suggested code</label>
						<textarea
							id="review-session-suggested-code"
							name="suggestedCode"
							rows="2"
							class={cn("w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs")}
						></textarea>
						<button
							type="submit"
							class={cn("h-9 rounded-md border border-border bg-background px-3 text-sm font-medium")}
						>
							Add Annotation
						</button>
					</form>
				</div>
			</div>

			{#if form?.mode === "finalQa" && form.ok && form.report}
				<div data-final-qa-result class={cn("space-y-3 rounded-md border border-border p-4")}>
					<div class={cn("grid gap-2 sm:grid-cols-4")}>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Status</div>
							<div class={cn("font-medium")}>{form.report.status}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Next</div>
							<div class={cn("font-medium")}>{form.report.nextAction}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Trace</div>
							<div class={cn("font-medium")}>{form.report.traceId}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Open Feedback</div>
							<div class={cn("font-medium")}>{form.report.summary.openFeedbackRunCount}</div>
						</div>
					</div>

					<div class={cn("grid gap-2 sm:grid-cols-3")}>
						<div data-final-qa-task-count>tasks: {form.report.summary.taskCount}</div>
						<div data-final-qa-doc-count>docs: {form.report.summary.docCount}</div>
						<div data-final-qa-uat-ready>uat ready: {form.report.readyForUserAcceptance ? "yes" : "no"}</div>
					</div>

					<ul class={cn("space-y-2")}>
						{#each form.report.checks as check}
							<li class={cn("rounded border border-border px-3 py-2 text-sm")}>
								<span class={cn("font-medium")}>{check.id}</span>
								<span class={cn("ml-2 text-muted-foreground")}>[{check.status}]</span>
								<div class={cn("text-muted-foreground")}>{check.details}</div>
							</li>
						{/each}
					</ul>
				</div>
			{:else if form?.mode === "finalQa" && !form.ok}
				<div data-final-qa-error class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
					{form.message}
				</div>
			{/if}

			{#if form?.mode === "finalQaGate" && form.ok && form.gate}
				<div data-final-qa-gate-result class={cn("space-y-3 rounded-md border border-border p-4")}>
					<div class={cn("grid gap-2 sm:grid-cols-4")}>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Final</div>
							<div class={cn("font-medium")}>{form.gate.finalQa.status}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Next</div>
							<div class={cn("font-medium")}>{form.gate.nextAction}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Loop</div>
							<div class={cn("font-medium")}>{form.gate.loopAttempted ? "attempted" : "skipped"}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Open Feedback</div>
							<div class={cn("font-medium")}>{form.gate.finalQa.summary.openFeedbackRunCount}</div>
						</div>
					</div>
					<div class={cn("grid gap-2 text-sm sm:grid-cols-3")}>
						<div data-final-qa-gate-stop>stop: {form.gate.feedbackLoop?.stopReason ?? "none"}</div>
						<div data-final-qa-gate-exhausted>exhausted: {form.gate.feedbackLoop?.exhausted ? "yes" : "no"}</div>
						<div data-final-qa-gate-ready>ready: {form.gate.readyForUserAcceptance ? "yes" : "no"}</div>
					</div>
					<div class={cn("text-sm text-muted-foreground")}>trace {form.gate.traceId ?? "none"}</div>
				</div>
			{:else if form?.mode === "finalQaGate" && !form.ok}
				<div data-final-qa-gate-error class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
					{form.message}
				</div>
			{/if}

			{#if form?.mode === "uatHandoff" && form.ok && form.handoff}
				<div data-uat-handoff-result class={cn("space-y-3 rounded-md border border-border p-4")}>
					<div class={cn("grid gap-2 sm:grid-cols-4")}>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Status</div>
							<div class={cn("font-medium")}>{form.handoff.status}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Final QA</div>
							<div class={cn("font-medium")}>{form.handoff.finalQaStatus}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Next</div>
							<div class={cn("font-medium")}>{form.handoff.nextAction}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Trace</div>
							<div class={cn("font-medium")}>{form.handoff.traceId ?? "none"}</div>
						</div>
					</div>

					<div class={cn("grid gap-3 md:grid-cols-2")}>
						<div>
							<h3 class={cn("mb-2 text-sm font-medium")}>Review Sessions</h3>
							<ul class={cn("space-y-2")}>
								{#each form.handoff.reviewSessions as session}
									<li class={cn("rounded border border-border px-3 py-2 text-sm")}>
										<span class={cn("font-medium")}>{session.title}</span>
										<span class={cn("ml-2 text-muted-foreground")}>{session.status}</span>
									</li>
								{/each}
							</ul>
						</div>
						<div>
							<h3 class={cn("mb-2 text-sm font-medium")}>Decision Options</h3>
							<ul class={cn("space-y-2")}>
								{#each form.handoff.decisionOptions as option}
									<li class={cn("rounded border border-border px-3 py-2 text-sm")}>
										<span class={cn("font-medium")}>{option.label}</span>
										<div class={cn("text-muted-foreground")}>{option.description}</div>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				</div>
			{:else if form?.mode === "uatHandoff" && !form.ok}
				<div data-uat-handoff-error class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
					{form.message}
				</div>
			{/if}

			{#if form?.mode === "uatDecision" && form.ok && form.decision}
				<div data-uat-decision-result class={cn("space-y-3 rounded-md border border-border p-4")}>
					<div class={cn("grid gap-2 sm:grid-cols-4")}>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Status</div>
							<div class={cn("font-medium")}>{form.decision.status}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Next</div>
							<div class={cn("font-medium")}>{form.decision.nextAction}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Decision</div>
							<div class={cn("font-medium")}>{form.decision.decision}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Trace</div>
							<div class={cn("font-medium")}>{form.decision.traceId ?? "none"}</div>
						</div>
					</div>

					<div>
						<h3 class={cn("mb-2 text-sm font-medium")}>Generated E2E</h3>
						<ul class={cn("space-y-2")}>
							{#each form.decision.generatedE2eTests as generated}
								<li class={cn("rounded border border-border px-3 py-2 text-sm")}>
										<span class={cn("font-medium")}>{generated.filename}</span>
										<div class={cn("text-muted-foreground")}>{generated.path}</div>
										<div class={cn("text-muted-foreground")}>runner: {generated.runner}</div>
										{#if generated.coverageCases}
											<div class={cn("text-muted-foreground")}>coverage: {generated.coverageCases.length} case(s)</div>
										{/if}
										<div class={cn("text-muted-foreground")}>{generated.bodyPath}</div>
									</li>
								{/each}
						</ul>
					</div>
				</div>
			{:else if form?.mode === "uatDecision" && !form.ok}
				<div data-uat-decision-error class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
					{form.message}
				</div>
			{/if}

			{#if form?.mode === "autoDecision" && form.ok && form.autoDecision}
				<div data-auto-decision-result class={cn("space-y-3 rounded-md border border-border p-4")}>
					<div class={cn("grid gap-2 sm:grid-cols-4")}>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Status</div>
							<div class={cn("font-medium")}>{form.autoDecision.status}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Next</div>
							<div class={cn("font-medium")}>{form.autoDecision.nextAction}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Setting</div>
							<div class={cn("font-medium")}>{form.autoDecision.settingKey}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Trace</div>
							<div class={cn("font-medium")}>{form.autoDecision.traceId ?? "none"}</div>
						</div>
					</div>
					{#if form.autoDecision.config}
						<div class={cn("text-sm text-muted-foreground")}>
							{form.autoDecision.config.decision} [{form.autoDecision.config.reviewType}]
						</div>
					{/if}
					{#if form.autoDecision.decision}
						<div class={cn("text-sm text-muted-foreground")}>decision status: {form.autoDecision.decision.status}</div>
						<ul class={cn("space-y-2")}>
							{#each form.autoDecision.decision.generatedE2eTests as generated}
								<li class={cn("rounded border border-border px-3 py-2 text-sm")}>
									<span class={cn("font-medium")}>{generated.filename}</span>
									<div class={cn("text-muted-foreground")}>{generated.path}</div>
									<div class={cn("text-muted-foreground")}>runner: {generated.runner}</div>
									{#if generated.coverageCases}
										<div class={cn("text-muted-foreground")}>coverage: {generated.coverageCases.length} case(s)</div>
									{/if}
									<div class={cn("text-muted-foreground")}>{generated.bodyPath}</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else if form?.mode === "autoDecision" && !form.ok}
				<div data-auto-decision-error class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
					{form.message}
				</div>
			{/if}

			{#if form?.mode === "e2eRun" && form.ok && form.e2eRun}
				<div data-e2e-run-result class={cn("space-y-3 rounded-md border border-border p-4")}>
						<div class={cn("grid gap-2 sm:grid-cols-5")}>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Status</div>
							<div class={cn("font-medium")}>{form.e2eRun.status}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Runner</div>
							<div class={cn("font-medium")}>{form.e2eRun.runner}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Exit</div>
							<div class={cn("font-medium")}>{form.e2eRun.exitCode ?? "planned"}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Trace</div>
							<div class={cn("font-medium")}>{form.e2eRun.traceId ?? "none"}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Artifacts</div>
							<div class={cn("font-medium")}>{form.e2eRun.artifactIds.length}</div>
						</div>
					</div>
					<div class={cn("text-sm text-muted-foreground")}>{form.e2eRun.command.join(" ")}</div>
					{#if form.e2eRun.cwd}
						<div class={cn("text-sm text-muted-foreground")}>cwd: {form.e2eRun.cwd}</div>
					{/if}
					<div class={cn("text-sm text-muted-foreground")}>ci: {form.e2eRun.ciCommand.join(" ")}</div>
					<ul class={cn("space-y-2")}>
						{#each form.e2eRun.testFiles as testFile}
							<li class={cn("rounded border border-border px-3 py-2 text-sm")}>{testFile}</li>
						{/each}
					</ul>
				</div>
			{:else if form?.mode === "e2eRun" && !form.ok}
				<div data-e2e-run-error class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
					{form.message}
				</div>
			{/if}

			{#if form?.mode === "reviewWorkbench" && form.ok && form.reviewWorkbench}
				<ReviewWorkbench model={form.reviewWorkbench} aiStreamUrl={`/api/review/stream?projectId=${data.projectId}`} />
				<!-- Legacy inline render preserved below for data debugging -->
				<details class={cn("mt-2")}>
					<summary class={cn("text-xs text-muted-foreground cursor-pointer")}>Raw review data</summary>
				<div data-review-workbench-result data-review-workbench-editor class={cn("overflow-hidden rounded-md border border-border")}>
					<div class={cn("grid gap-px bg-border lg:grid-cols-[260px_minmax(0,1fr)_340px]")}>
						<aside data-review-file-tree class={cn("min-h-[520px] bg-background")}>
							<div class={cn("flex h-11 items-center justify-between border-b border-border px-3")}>
								<h3 class={cn("text-xs font-semibold uppercase text-muted-foreground")}>Files</h3>
								<span class={cn("text-xs text-muted-foreground")}>
									{form.reviewWorkbench.summary.viewedFileCount}/{form.reviewWorkbench.summary.fileCount}
								</span>
							</div>
							<div class={cn("space-y-1 p-3 text-sm")}>
								{#each form.reviewWorkbench.fileTree as node}
									<div class={cn("space-y-1")}>
										<div
											class={cn(
												"flex min-h-8 items-center justify-between gap-2 rounded px-2",
												node.type === "folder" ? "bg-muted/40 text-muted-foreground" : "hover:bg-muted"
											)}
										>
											<span class={cn("truncate font-medium")}>{node.name}</span>
											<span class={cn("shrink-0 font-mono text-xs text-muted-foreground")}>+{node.additions} -{node.deletions}</span>
										</div>
										{#if node.children}
											<div class={cn("space-y-1 pl-4")}>
												{#each node.children as child}
													<div
														class={cn(
															"flex min-h-8 items-center justify-between gap-2 rounded px-2",
															form.reviewWorkbench.selectedFile?.path === child.path ? "bg-primary/10 text-primary" : "hover:bg-muted"
														)}
													>
														<span class={cn("truncate")}>{child.name}</span>
														<span class={cn("shrink-0 text-xs text-muted-foreground")}>
															{form.reviewWorkbench.visibleFiles.find((file) => file.path === child.path)?.annotationCount ?? 0}
														</span>
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
								{#if form.reviewWorkbench.visibleFiles.length === 0}
									<div class={cn("rounded bg-muted/40 px-3 py-2 text-sm text-muted-foreground")}>No visible files</div>
								{/if}
							</div>
						</aside>

						<main data-review-diff-pane class={cn("min-h-[520px] bg-background")}>
							<div class={cn("flex h-11 items-center justify-between border-b border-border px-3")}>
								<div class={cn("min-w-0")}>
									<h3 class={cn("truncate text-sm font-semibold")}>
										{form.reviewWorkbench.selectedFile?.path ?? "No file selected"}
									</h3>
									<div class={cn("text-xs text-muted-foreground")}>
										trace {form.reviewWorkbench.traceId ?? "none"} · review {form.reviewWorkbench.reviewId ?? "none"}
									</div>
								</div>
								<div class={cn("flex shrink-0 items-center gap-2 text-xs text-muted-foreground")}>
									<span>{form.reviewWorkbench.summary.annotationCount} annotations</span>
									<span>{form.reviewWorkbench.summary.searchMatchCount} matches</span>
								</div>
							</div>
							{#if form.reviewWorkbench.selectedFile}
								<pre class={cn("m-0 max-h-[470px] overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap")}>{form.reviewWorkbench.selectedFile.patch}</pre>
							{:else}
								<div class={cn("p-4 text-sm text-muted-foreground")}>Build or load a review session to inspect a diff.</div>
							{/if}
						</main>

						<aside data-review-sidebar class={cn("min-h-[520px] bg-background")}>
							<div class={cn("grid h-11 grid-cols-3 border-b border-border text-xs font-medium")}>
								<div data-review-sidebar-tab-annotations class={cn("flex items-center justify-center border-r border-border bg-muted/50")}>Annotations</div>
								<div data-review-sidebar-tab-ai class={cn("flex items-center justify-center border-r border-border")}>AI</div>
								<div data-review-sidebar-tab-agents class={cn("flex items-center justify-center")}>Agents</div>
							</div>
							<div class={cn("max-h-[480px] overflow-auto p-3")}>
								<div class={cn("space-y-3")}>
									{#each form.reviewWorkbench.annotationGroups as group}
										<section class={cn("space-y-2")}>
											<div class={cn("flex items-center justify-between gap-2")}>
												<h4 class={cn("truncate text-sm font-medium")}>{group.filePath}</h4>
												<span class={cn("shrink-0 text-xs text-muted-foreground")}>
													{group.blockingCount} blocking · {group.suggestionCount} suggestions
												</span>
											</div>
											{#each group.annotations as annotation}
												<article class={cn("rounded border border-border px-3 py-2 text-sm")}>
													<div class={cn("flex items-center justify-between gap-2 text-xs text-muted-foreground")}>
														<span>{annotation.scope === "file" ? "file" : `L${annotation.lineStart}-${annotation.lineEnd}`}</span>
														<span>{annotation.type}</span>
													</div>
													{#if annotation.text}
														<p class={cn("mt-1 text-sm")}>{annotation.text}</p>
													{/if}
													{#if annotation.suggestedCode}
														<div class={cn("mt-2 rounded bg-muted/40 p-2")}>
															<div class={cn("mb-1 text-xs font-medium text-muted-foreground")}>Suggestion</div>
															<pre class={cn("m-0 whitespace-pre-wrap font-mono text-xs")}>{annotation.suggestedCode}</pre>
														</div>
													{/if}
												</article>
											{/each}
										</section>
									{/each}
								</div>
							</div>
						</aside>
					</div>

					<div class={cn("grid gap-px border-t border-border bg-border lg:grid-cols-3")}>
						<section data-review-search-dock class={cn("bg-background p-3")}>
							<div class={cn("mb-2 flex items-center justify-between gap-2")}>
								<h3 class={cn("text-sm font-semibold")}>Search</h3>
								<span class={cn("text-xs text-muted-foreground")}>
									prev {form.reviewWorkbench.search.previousMatchId ?? "none"} · next {form.reviewWorkbench.search.nextMatchId ?? "none"}
								</span>
							</div>
							<div class={cn("mb-2 text-xs text-muted-foreground")}>query: {form.reviewWorkbench.search.query || "none"}</div>
							<ul class={cn("space-y-2")}>
								{#each form.reviewWorkbench.search.groups as group}
									<li class={cn("rounded border border-border px-3 py-2 text-sm")}>
										<div class={cn("font-medium")}>{group.filePath}</div>
										<div class={cn("text-xs text-muted-foreground")}>{group.matches.length} match(es)</div>
										{#each group.matches.slice(0, 2) as match}
											<div class={cn("mt-1 text-xs text-muted-foreground")}>{match.side} L{match.lineNumber}: {match.snippet}</div>
										{/each}
									</li>
								{/each}
							</ul>
						</section>

						<section data-review-submission-dock class={cn("bg-background p-3")}>
							<div class={cn("mb-2 flex items-center justify-between gap-2")}>
								<h3 class={cn("text-sm font-semibold")}>Submission</h3>
								<span class={cn("text-xs text-muted-foreground")}>
									targets {form.reviewWorkbench.submission.targets.length} · orphans {form.reviewWorkbench.submission.orphans.length}
								</span>
							</div>
							<ul class={cn("space-y-2")}>
								{#each form.reviewWorkbench.submission.targets as target}
									<li class={cn("rounded border border-border px-3 py-2 text-sm")}>
										<div class={cn("font-medium")}>#{target.prNumber || "current"} {target.prTitle || target.prRepo || "Current review"}</div>
										<div class={cn("text-xs text-muted-foreground")}>{target.annotationCount} annotations across {target.fileCount} files · {target.status}</div>
									</li>
								{/each}
								{#each form.reviewWorkbench.submission.orphans as orphan}
									<li class={cn("rounded border border-border px-3 py-2 text-sm")}>
										<div class={cn("font-medium")}>{orphan.reason}</div>
										<div class={cn("text-xs text-muted-foreground")}>{orphan.annotations.length} finding(s)</div>
									</li>
								{/each}
							</ul>
							<div data-review-feedback-export class={cn("mt-3")}>
								<h4 class={cn("mb-1 text-xs font-semibold uppercase text-muted-foreground")}>Feedback Export</h4>
								<pre class={cn("max-h-32 overflow-auto rounded bg-muted/40 p-2 whitespace-pre-wrap text-xs")}>{form.reviewWorkbench.feedbackMarkdown}</pre>
							</div>
							{#if form.reviewWorkbench.suggestions.length > 0}
								<div class={cn("mt-3")}>
									<h4 class={cn("mb-1 text-xs font-semibold uppercase text-muted-foreground")}>Suggestions</h4>
									<ul class={cn("space-y-1")}>
										{#each form.reviewWorkbench.suggestions as suggestion}
											<li class={cn("text-xs text-muted-foreground")}>
												{suggestion.filePath}: L{suggestion.lineStart}-{suggestion.lineEnd} · {suggestion.canApply ? "applicable" : "manual"}
											</li>
										{/each}
									</ul>
								</div>
							{/if}
						</section>

						<section data-review-live-log-dock class={cn("bg-background p-3")}>
							<div class={cn("mb-2 flex items-center justify-between gap-2")}>
								<h3 class={cn("text-sm font-semibold")}>Live Log</h3>
								<span class={cn("text-xs text-muted-foreground")}>
									{form.reviewWorkbench.liveLog.isLive ? "live" : "captured"}{form.reviewWorkbench.liveLog.truncated ? " · truncated" : ""}
								</span>
							</div>
							{#if form.reviewWorkbench.liveLog.displayText}
								<pre class={cn("max-h-56 overflow-auto rounded bg-muted/40 p-3 whitespace-pre-wrap font-mono text-xs")}>{form.reviewWorkbench.liveLog.displayText}</pre>
							{:else}
								<div class={cn("rounded bg-muted/40 p-3 text-sm text-muted-foreground")}>
									{form.reviewWorkbench.liveLog.isWaiting ? "Waiting for output" : "No output captured"}
								</div>
							{/if}
						</section>
					</div>
				</div>
				</details>
			{:else if form?.mode === "reviewWorkbench" && !form.ok}
				<div data-review-workbench-error class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
					{form.message}
				</div>
			{/if}

			{#if form?.mode === "reviewSession" && form.ok && form.reviewSession}
				<div data-review-session-result class={cn("space-y-3 rounded-md border border-border p-4")}>
					<div class={cn("grid gap-2 sm:grid-cols-5")}>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Status</div>
							<div class={cn("font-medium")}>{form.reviewSession.status}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Review</div>
							<div class={cn("font-medium")}>{form.reviewSession.reviewId}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Trace</div>
							<div class={cn("font-medium")}>{form.reviewSession.traceId ?? "none"}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Revision</div>
							<div class={cn("font-medium")}>{form.reviewSession.revision}</div>
						</div>
						<div>
							<div class={cn("text-xs text-muted-foreground")}>Search</div>
							<div class={cn("font-medium")}>{form.reviewSession.model.summary.searchMatchCount}</div>
						</div>
					</div>
						<div class={cn("text-sm text-muted-foreground")}>
							files: {form.reviewSession.model.summary.fileCount}
							visible: {form.reviewSession.model.summary.visibleFileCount}
							annotations: {form.reviewSession.model.summary.annotationCount}
						</div>
						<div data-review-session-workbench class={cn("overflow-hidden rounded-md border border-border")}>
							<div class={cn("grid gap-px bg-border lg:grid-cols-[240px_minmax(0,1fr)_320px]")}>
								<section data-review-session-file-tree class={cn("bg-background")}>
									<div class={cn("border-b border-border px-3 py-2 text-xs font-semibold uppercase text-muted-foreground")}>
										Session Files
									</div>
									<div class={cn("space-y-1 p-3 text-sm")}>
										{#each form.reviewSession.model.fileTree as node}
											<div class={cn("rounded px-2 py-1")}>
												<div class={cn("flex items-center justify-between gap-2")}>
													<span class={cn("truncate font-medium")}>{node.name}</span>
													<span class={cn("shrink-0 font-mono text-xs text-muted-foreground")}>+{node.additions} -{node.deletions}</span>
												</div>
												{#if node.children}
													<div class={cn("mt-1 space-y-1 pl-3")}>
														{#each node.children as child}
															<div class={cn("flex items-center justify-between gap-2 text-xs text-muted-foreground")}>
																<span class={cn("truncate")}>{child.path}</span>
																<span>{child.additions}/{child.deletions}</span>
															</div>
														{/each}
													</div>
												{/if}
											</div>
										{/each}
									</div>
								</section>

								<section data-review-session-diff-pane class={cn("bg-background")}>
									<div class={cn("border-b border-border px-3 py-2")}>
										<div class={cn("truncate text-sm font-semibold")}>
											{form.reviewSession.model.selectedFile?.path ?? "No file selected"}
										</div>
										<div class={cn("text-xs text-muted-foreground")}>
											{form.reviewSession.model.summary.annotationCount} annotations · {form.reviewSession.model.summary.searchMatchCount} matches
										</div>
									</div>
									{#if form.reviewSession.model.selectedFile}
										<pre class={cn("m-0 max-h-72 overflow-auto p-3 whitespace-pre-wrap font-mono text-xs")}>{form.reviewSession.model.selectedFile.patch}</pre>
									{/if}
								</section>

								<section data-review-session-sidebar class={cn("bg-background")}>
									<div class={cn("border-b border-border px-3 py-2 text-xs font-semibold uppercase text-muted-foreground")}>
										Session Annotations
									</div>
									<div class={cn("max-h-72 overflow-auto p-3")}>
										{#each form.reviewSession.model.annotationGroups as group}
											<div class={cn("mb-3")}>
												<div class={cn("flex items-center justify-between gap-2")}>
													<span class={cn("truncate text-sm font-medium")}>{group.filePath}</span>
													<span class={cn("shrink-0 text-xs text-muted-foreground")}>
														{group.blockingCount}/{group.suggestionCount}
													</span>
												</div>
												{#each group.annotations as annotation}
													<div class={cn("mt-2 rounded border border-border px-3 py-2 text-sm")}>
														<div class={cn("text-xs text-muted-foreground")}>
															{annotation.scope === "file" ? "file" : `L${annotation.lineStart}-${annotation.lineEnd}`} · {annotation.type}
														</div>
														{#if annotation.text}
															<div>{annotation.text}</div>
														{/if}
													</div>
												{/each}
											</div>
										{/each}
									</div>
								</section>
							</div>

							<div class={cn("grid gap-px border-t border-border bg-border lg:grid-cols-3")}>
								<section data-review-session-search-dock class={cn("bg-background p-3")}>
									<div class={cn("mb-2 flex items-center justify-between gap-2")}>
										<h4 class={cn("text-sm font-semibold")}>Search</h4>
										<span class={cn("text-xs text-muted-foreground")}>
											prev {form.reviewSession.model.search.previousMatchId ?? "none"} · next {form.reviewSession.model.search.nextMatchId ?? "none"}
										</span>
									</div>
									{#each form.reviewSession.model.search.groups as group}
										<div class={cn("rounded border border-border px-3 py-2 text-sm")}>
											<div class={cn("font-medium")}>{group.filePath}</div>
											<div class={cn("text-xs text-muted-foreground")}>{group.matches.length} match(es)</div>
										</div>
									{/each}
								</section>

								<section data-review-session-submission-dock class={cn("bg-background p-3")}>
									<div class={cn("mb-2 flex items-center justify-between gap-2")}>
										<h4 class={cn("text-sm font-semibold")}>Submission</h4>
										<span class={cn("text-xs text-muted-foreground")}>
											targets {form.reviewSession.model.submission.targets.length} · orphans {form.reviewSession.model.submission.orphans.length}
										</span>
									</div>
									<pre class={cn("max-h-28 overflow-auto rounded bg-muted/40 p-2 whitespace-pre-wrap text-xs")}>{form.reviewSession.model.feedbackMarkdown}</pre>
									{#each form.reviewSession.model.submission.orphans as orphan}
										<div class={cn("mt-2 text-xs text-muted-foreground")}>{orphan.reason}: {orphan.annotations.length}</div>
									{/each}
								</section>

								<section data-review-session-live-log-dock class={cn("bg-background p-3")}>
									<div class={cn("mb-2 flex items-center justify-between gap-2")}>
										<h4 class={cn("text-sm font-semibold")}>Live Log</h4>
										<span class={cn("text-xs text-muted-foreground")}>{form.reviewSession.model.liveLog.isLive ? "live" : "captured"}</span>
									</div>
									<pre class={cn("max-h-28 overflow-auto rounded bg-muted/40 p-2 whitespace-pre-wrap font-mono text-xs")}>{form.reviewSession.model.liveLog.displayText}</pre>
								</section>
							</div>
						</div>
					</div>
				{:else if form?.mode === "reviewSession" && !form.ok}
				<div data-review-session-error class={cn("rounded-md border border-destructive/40 p-3 text-sm text-destructive")}>
					{form.message}
				</div>
			{/if}
		</div>
	{/if}
</section>
</div>
