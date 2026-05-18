<script lang="ts">
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import FolderOpenIcon from "@lucide/svelte/icons/folder-open";
	import PlusIcon from "@lucide/svelte/icons/plus";
	import SearchIcon from "@lucide/svelte/icons/search";
	import XIcon from "@lucide/svelte/icons/x";
	import type { PageData } from "./$types";

	import { buttonVariants } from "$lib/components/ui/button";
	import SetActiveButton from "$lib/components/projects/SetActiveButton.svelte";
	import RouteSkeleton from "$lib/components/feedback/RouteSkeleton.svelte";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
	type ProjectsPayload = Awaited<PageData["streamed"]["data"]>;

	let filter = $state("");
	let statusFilter = $state<"all" | "active" | "ready">("all");

	function truncate(value: string | null, max = 80): string {
		if (!value) return "";
		return value.length > max ? `${value.slice(0, max - 1)}…` : value;
	}

	// Render `updated_at` as an ISO short stamp (`YYYY-MM-DD HH:mm`). Keeps the
	// table column predictable across timezones — the live shell layout already
	// renders the user-local clock elsewhere; this column tracks the kernel's
	// stored timestamp.
	function formatUpdated(value: string): string {
		const isoDate = value.slice(0, 10);
		const isoTime = value.slice(11, 16);
		return isoTime ? `${isoDate} ${isoTime}` : isoDate;
	}

	function formatCount(value: number, label: string): string {
		return `${value} ${label}${value === 1 ? "" : "s"}`;
	}

	function projectStatus(project: ProjectsPayload["projects"][number]): "active" | "ready" {
		return data.activeProjectId === project.slug ? "active" : "ready";
	}

	function filterProjects(projects: ProjectsPayload["projects"]): ProjectsPayload["projects"] {
		const needle = filter.trim().toLowerCase();
		return projects.filter((p) => {
			const matchesText =
				needle === "" ||
				p.name.toLowerCase().includes(needle) ||
				p.slug.toLowerCase().includes(needle) ||
				(p.description ?? "").toLowerCase().includes(needle);
			const matchesStatus = statusFilter === "all" || projectStatus(p) === statusFilter;
			return matchesText && matchesStatus;
		});
	}

	function resetFilters(): void {
		filter = "";
		statusFilter = "all";
	}
</script>

{#await data.streamed.data}
	<RouteSkeleton kind="list" />
{:then payload}
	{@const visible = filterProjects(payload.projects)}

	<section data-projects-page class={cn("min-w-0")}>
	<header data-projects-header class={cn("border-b border-border pb-4 mb-4")}>
		<div class={cn("flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between")}>
			<div class={cn("min-w-0")}>
					<h1 class={cn("text-2xl font-semibold tracking-tight")}>Projects</h1>
					<p class={cn("mt-1 max-w-2xl text-sm text-muted-foreground")}>
						Open the workspace that should own capture, planning, build, review, and ship work.
					</p>
				</div>
				<div class={cn("flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row")}>
					<a
						href="/settings/data"
						data-import-projects
						data-slot="button"
						class={cn(buttonVariants({ variant: "outline" }), "w-full justify-center gap-2 sm:w-auto")}
				>
					<FolderOpenIcon class="size-4" aria-hidden="true" />
					Import
				</a>
					<a
						href="/projects/new"
						data-new-project
						data-slot="button"
						class={cn(buttonVariants({ variant: "default" }), "w-full justify-center gap-2 sm:w-auto")}
				>
					<PlusIcon class="size-4" aria-hidden="true" />
					New project
				</a>
			</div>
		</div>
	</header>

	<div
		data-projects-controls
		class={cn("mb-4 grid gap-2 rounded-lg border border-border bg-muted/20 p-2 sm:grid-cols-[minmax(0,1fr)_180px_auto]")}
	>
		<label class={cn("relative block")}>
			<span class={cn("sr-only")}>Search projects</span>
			<SearchIcon class="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
			<input
				type="search"
				data-projects-filter
				aria-label="Search projects"
				placeholder="Search projects"
				bind:value={filter}
				class={cn(
					"border-input bg-background placeholder:text-muted-foreground flex h-9 w-full rounded-md border py-1 pl-9 pr-3 text-sm shadow-xs",
				)}
			/>
		</label>
		<label class={cn("block")}>
			<span class={cn("sr-only")}>Filter by status</span>
			<select
				data-status-filter
				aria-label="Filter by project status"
				bind:value={statusFilter}
				class={cn("border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs")}
			>
				<option value="all">All status</option>
				<option value="active">Active</option>
				<option value="ready">Ready</option>
			</select>
		</label>
		<button
			type="button"
			data-projects-reset
			disabled={filter.trim() === "" && statusFilter === "all"}
			onclick={resetFilters}
			class={cn(buttonVariants({ variant: "outline" }), "gap-2 disabled:pointer-events-none disabled:opacity-40")}
		>
			<XIcon class="size-4" aria-hidden="true" />
			Reset
		</button>
	</div>

	{#if filter.trim() !== "" || statusFilter !== "all"}
		<div
			data-applied-filters
			class={cn("mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground")}
		>
			<span class={cn("font-medium text-foreground")}>Applied filters</span>
			{#if filter.trim() !== ""}
				<span class={cn("rounded-4xl border border-border bg-background px-2 py-1")}>Search: {filter}</span>
			{/if}
			{#if statusFilter !== "all"}
				<span class={cn("rounded-4xl border border-border bg-background px-2 py-1")}>Status: {statusFilter}</span>
			{/if}
		</div>
	{/if}

	{#if payload.projects.length === 0}
		<div
			data-empty-projects
			class={cn("rounded-lg border border-dashed border-border bg-muted/20 p-6")}
		>
			<h2 class={cn("text-base font-semibold text-foreground")}>No projects yet</h2>
			<p class={cn("mt-1 max-w-xl text-sm text-muted-foreground")}>
				Create a workspace project, import existing data, or search for a project already connected to this install.
			</p>
				<div class={cn("mt-4 flex flex-col gap-2 sm:flex-row")}>
					<a
						href="/projects/new"
						data-empty-create-project
						class={cn(buttonVariants({ variant: "default" }), "w-full justify-center gap-2 sm:w-auto")}
					>
						<PlusIcon class="size-4" aria-hidden="true" />
						New project
					</a>
					<a
						href="/settings/data"
						data-empty-import-projects
						class={cn(buttonVariants({ variant: "outline" }), "w-full justify-center gap-2 sm:w-auto")}
					>
						<FolderOpenIcon class="size-4" aria-hidden="true" />
						Import data
					</a>
					<a
						href="/search"
						data-empty-open-existing
						class={cn(buttonVariants({ variant: "outline" }), "w-full justify-center gap-2 sm:w-auto")}
					>
						<SearchIcon class="size-4" aria-hidden="true" />
						Search all projects
				</a>
			</div>
		</div>
	{:else if visible.length === 0}
		<div
			data-empty-filter
			class={cn("rounded-lg border border-dashed border-border bg-muted/20 p-6")}
		>
			<h2 class={cn("text-base font-semibold text-foreground")}>No matching projects</h2>
			<p class={cn("mt-1 text-sm text-muted-foreground")}>No project matches the current search or status filter.</p>
			<button type="button" data-empty-filter-reset onclick={resetFilters} class={cn(buttonVariants({ variant: "outline" }), "mt-4 gap-2")}>
				<XIcon class="size-4" aria-hidden="true" />
				Clear filters
			</button>
		</div>
	{:else}
		<div data-projects-list class={cn("grid gap-2")}>
			<div
				data-projects-list-header
				class={cn("hidden grid-cols-[minmax(180px,1.2fr)_120px_170px_160px_220px] gap-3 border-b border-border px-3 pb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground lg:grid")}
			>
				<span>Project</span>
				<span>Status</span>
				<span>Counts</span>
				<span>Latest activity</span>
				<span>Actions</span>
			</div>
			{#each visible as project (project.id)}
				{@const status = projectStatus(project)}
				<article
					data-project-row
					data-project-id={project.id}
					data-project-status={status}
					class={cn(
						"grid gap-3 rounded-lg border border-border bg-background p-3 shadow-xs transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(180px,1.2fr)_120px_170px_160px_220px] lg:items-center",
					)}
				>
					<div class={cn("min-w-0")}>
						<a href="/projects/{project.id}" class={cn("font-medium hover:underline")}>{project.name}</a>
						<div class={cn("mt-1 truncate font-mono text-xs text-muted-foreground")}>{project.slug}</div>
						{#if project.description}
							<p class={cn("mt-2 line-clamp-2 text-sm text-muted-foreground lg:hidden")}>{truncate(project.description, 120)}</p>
						{/if}
					</div>
					<div>
						<span
							data-project-status-badge
							class={cn(
								"inline-flex h-6 items-center rounded-4xl border px-2 text-xs font-medium",
								status === "active"
									? "border-success/30 bg-success/10 text-success"
									: "border-border bg-muted text-muted-foreground",
							)}
						>
							{status === "active" ? "Active" : "Ready"}
						</span>
					</div>
					<div data-project-counts class={cn("grid grid-cols-3 gap-2 text-xs text-muted-foreground sm:flex sm:flex-wrap")}>
						<span class={cn("rounded-md bg-muted px-2 py-1")}>{formatCount(project.open_task_count, "open")}</span>
						<span class={cn("rounded-md bg-muted px-2 py-1")}>{formatCount(project.task_count, "task")}</span>
						<span class={cn("rounded-md bg-muted px-2 py-1")}>{formatCount(project.doc_count, "doc")}</span>
					</div>
					<div class={cn("font-mono text-xs text-muted-foreground")}>
						<span class={cn("lg:hidden")}>Updated </span>{formatUpdated(project.latest_activity_at)}
					</div>
					<div class={cn("flex flex-wrap items-center gap-2")}>
						<a
							href="/projects/{project.id}"
							data-project-primary-action
							class={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
						>
							Open
							<ArrowRightIcon class="size-4" aria-hidden="true" />
						</a>
						<SetActiveButton slug={project.slug} active={status === "active"} />
					</div>
				</article>
			{/each}
		</div>
	{/if}
	</section>
{/await}
