<script lang="ts">
	import {
		Label,
		Checkbox,
		RadioGroup,
		RadioGroupItem,
		Select,
		SelectTrigger,
		SelectContent,
		SelectItem,
		SelectValue,
		Badge,
		StatusBadge,
		Avatar,
		AvatarImage,
		AvatarFallback,
		Chip,
		Kbd,
		Progress,
		Skeleton,
		Alert,
		Banner,
		EmptyState,
		ToastRegion,
		ToastStore,
	} from "@fulcrum/ui-kit";

	let progressValue = $state(42);
	let chipRemoved = $state(false);
	let bannerVisible = $state(true);
	const toastStore = new ToastStore();

	let agreeChecked = $state(false);
	let alphaChecked = $state(true);
	let indeterminateChecked = $state<boolean | "indeterminate">("indeterminate");
	let radioValue = $state("daily");
	let selectValue = $state<string | undefined>(undefined);

	const priorityOptions = [
		{ value: "p0", label: "P0 — critical" },
		{ value: "p1", label: "P1 — high" },
		{ value: "p2", label: "P2 — medium" },
		{ value: "p3", label: "P3 — low" },
	];

	const selectedPriorityLabel = $derived(
		priorityOptions.find((option) => option.value === selectValue)?.label ?? "Choose priority",
	);
</script>

<svelte:head>
	<title>Design kit - Fulcrum</title>
</svelte:head>

<main class="min-h-screen bg-background text-foreground">
	<section
		class="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8"
		data-design-kit-ready="true"
	>
		<header class="flex flex-col gap-2 border-b border-border pb-6">
			<p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Design kit</p>
			<h1 class="text-2xl font-semibold">Form primitives</h1>
			<p class="text-sm text-muted-foreground">
				Reference surface for Label, Checkbox, RadioGroup, and Select primitives shipped from
				<code class="rounded bg-muted px-1 py-0.5 text-xs">@fulcrum/ui-kit</code>. Every control
				renders with OKLCH semantic tokens and exposes data-* hooks for design-e2e.
			</p>
		</header>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="label"
		>
			<div class="flex items-baseline justify-between gap-3">
				<h2 class="text-lg font-semibold">Label</h2>
				<span class="text-xs text-muted-foreground">required &middot; optional &middot; default</span>
			</div>
			<div class="grid gap-3 sm:grid-cols-3">
				<Label for="email-required" required>Email</Label>
				<Label for="bio-optional" optional>Bio</Label>
				<Label for="display-plain">Display name</Label>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="checkbox"
		>
			<h2 class="text-lg font-semibold">Checkbox</h2>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={agreeChecked} aria-label="Agree to terms" />
					<span>Agree to terms (unchecked default)</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox bind:checked={alphaChecked} aria-label="Subscribe to alpha digest" />
					<span>Checked default</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox
						bind:indeterminate={indeterminateChecked as boolean}
						aria-label="Indeterminate selection"
					/>
					<span>Indeterminate state</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<Checkbox disabled aria-label="Disabled checkbox" />
					<span class="opacity-60">Disabled</span>
				</label>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="radio-group"
		>
			<h2 class="text-lg font-semibold">RadioGroup</h2>
			<RadioGroup bind:value={radioValue} aria-label="Digest cadence" data-design-kit-radio-group>
				<label class="flex items-center gap-2 text-sm">
					<RadioGroupItem value="daily" aria-label="Daily" />
					<span>Daily</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<RadioGroupItem value="weekly" aria-label="Weekly" />
					<span>Weekly</span>
				</label>
				<label class="flex items-center gap-2 text-sm">
					<RadioGroupItem value="never" aria-label="Never" />
					<span>Never</span>
				</label>
			</RadioGroup>
			<p class="text-xs text-muted-foreground" data-design-kit-radio-value>
				Selected cadence: {radioValue}
			</p>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="select"
		>
			<h2 class="text-lg font-semibold">Select</h2>
			<div class="grid gap-2 sm:max-w-xs">
				<Label for="select-priority">Priority</Label>
				<Select bind:value={selectValue} type="single">
					<SelectTrigger aria-label="Priority" data-design-kit-select-trigger>
						<span class={selectValue ? "text-foreground" : "text-muted-foreground"}>
							{selectedPriorityLabel}
						</span>
					</SelectTrigger>
					<SelectContent>
						{#each priorityOptions as option (option.value)}
							<SelectItem value={option.value} label={option.label} />
						{/each}
					</SelectContent>
				</Select>
				<p class="text-xs text-muted-foreground" data-design-kit-select-value>
					Selected: {selectValue ?? "—"}
				</p>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="badge"
		>
			<h2 class="text-lg font-semibold">Badge</h2>
			<div class="flex flex-wrap items-center gap-2">
				<Badge variant="default">Default</Badge>
				<Badge variant="accent">Accent</Badge>
				<Badge variant="success">Success</Badge>
				<Badge variant="warning">Warning</Badge>
				<Badge variant="destructive">Destructive</Badge>
				<Badge variant="outline">Outline</Badge>
				<Badge variant="default" size="sm">sm</Badge>
				<Badge variant="default" size="lg">lg</Badge>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="status-badge"
		>
			<h2 class="text-lg font-semibold">StatusBadge</h2>
			<div class="flex flex-wrap items-center gap-2">
				<StatusBadge status="queued" />
				<StatusBadge status="running" />
				<StatusBadge status="waiting-input" />
				<StatusBadge status="paused" />
				<StatusBadge status="completed" />
				<StatusBadge status="failed" />
				<StatusBadge status="blocked" />
				<StatusBadge status="cancelled" />
				<StatusBadge status="scheduled" />
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="avatar"
		>
			<h2 class="text-lg font-semibold">Avatar</h2>
			<div class="flex flex-wrap items-center gap-3">
				<Avatar size="xs"><AvatarFallback>JD</AvatarFallback></Avatar>
				<Avatar size="sm"><AvatarFallback>SM</AvatarFallback></Avatar>
				<Avatar size="md"><AvatarFallback>MK</AvatarFallback></Avatar>
				<Avatar size="lg"><AvatarFallback>NC</AvatarFallback></Avatar>
				<Avatar size="xl"><AvatarFallback>AL</AvatarFallback></Avatar>
				<Avatar size="md">
					<AvatarImage src="https://example.invalid/missing.png" alt="Missing" />
					<AvatarFallback>RX</AvatarFallback>
				</Avatar>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="chip"
		>
			<h2 class="text-lg font-semibold">Chip</h2>
			<div class="flex flex-wrap items-center gap-2">
				<Chip tone="neutral">label</Chip>
				<Chip tone="accent">accent</Chip>
				<Chip tone="success">success</Chip>
				<Chip tone="warning">warning</Chip>
				<Chip tone="destructive">danger</Chip>
				{#if !chipRemoved}
					<Chip tone="neutral" removable onremove={() => (chipRemoved = true)}>
						removable
					</Chip>
				{:else}
					<span class="text-xs text-muted-foreground" data-design-kit-chip-removed>chip removed</span>
				{/if}
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="kbd"
		>
			<h2 class="text-lg font-semibold">Kbd</h2>
			<div class="flex flex-wrap items-center gap-2 text-sm">
				<span class="flex items-center gap-1">Save <Kbd>⌘</Kbd><Kbd>S</Kbd></span>
				<span class="flex items-center gap-1">Open palette <Kbd>⌘</Kbd><Kbd>K</Kbd></span>
				<span class="flex items-center gap-1">Esc <Kbd>esc</Kbd></span>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="progress"
		>
			<h2 class="text-lg font-semibold">Progress</h2>
			<div class="grid gap-3 sm:max-w-md">
				<Progress value={progressValue} label="Indexing repositories" data-design-kit-progress />
				<div class="flex items-center gap-2">
					<button
						type="button"
						class="rounded-md border border-border px-2 py-1 text-xs"
						data-design-kit-progress-step
						onclick={() => (progressValue = Math.min(100, progressValue + 10))}
					>+10</button>
					<span class="text-xs text-muted-foreground" data-design-kit-progress-value>
						{progressValue}%
					</span>
				</div>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="skeleton"
		>
			<h2 class="text-lg font-semibold">Skeleton</h2>
			<div class="grid gap-4 sm:grid-cols-3">
				<Skeleton shape="text" lines={3} />
				<Skeleton shape="rect" height="4rem" />
				<Skeleton shape="circle" width="3rem" />
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="alert"
		>
			<h2 class="text-lg font-semibold">Alert</h2>
			<div class="grid gap-3">
				<Alert tone="info" title="Heads up">A new build is available for review.</Alert>
				<Alert tone="success" title="Saved">Project draft was saved automatically.</Alert>
				<Alert tone="warning" title="Token nearing limit">Plan budget at 88%; reduce parallel runs.</Alert>
				<Alert tone="error" title="Run aborted">Repository token rejected. Re-authenticate to continue.</Alert>
				<Alert tone="tip" title="Tip">You can pin frequent commands to the palette with <code>⌘K</code>.</Alert>
			</div>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="banner"
		>
			<h2 class="text-lg font-semibold">Banner</h2>
			{#if bannerVisible}
				<Banner
					tone="warning"
					title="Read-only mode"
					dismissible
					ondismiss={() => (bannerVisible = false)}
				>
					Your workspace is paused. New runs cannot be dispatched.
				</Banner>
			{:else}
				<span class="text-xs text-muted-foreground" data-design-kit-banner-dismissed
					>banner dismissed</span
				>
			{/if}
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="empty-state"
		>
			<h2 class="text-lg font-semibold">EmptyState</h2>
			<EmptyState
				title="No tasks yet"
				description="Capture an idea, accept an intake, or generate tasks from a plan."
			>
				{#snippet icon()}
					<span class="text-lg font-semibold">+</span>
				{/snippet}
				{#snippet actions()}
					<button
						type="button"
						class="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
						data-design-kit-empty-action
					>
						Capture task
					</button>
				{/snippet}
			</EmptyState>
		</article>

		<article
			class="grid gap-4 rounded-md border border-border bg-card p-5"
			data-design-kit-section="toast"
		>
			<h2 class="text-lg font-semibold">Toast</h2>
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					class="rounded-md border border-border px-3 py-1.5 text-xs"
					data-design-kit-toast-publish="success"
					onclick={() =>
						toastStore.publish({
							tone: "success",
							title: "Task captured",
							description: "Saved to inbox.",
							durationMs: 0,
						})}
				>
					Publish success
				</button>
				<button
					type="button"
					class="rounded-md border border-border px-3 py-1.5 text-xs"
					data-design-kit-toast-publish="error"
					onclick={() =>
						toastStore.publish({
							tone: "error",
							title: "Build failed",
							description: "Check the run log for details.",
							durationMs: 0,
						})}
				>
					Publish error
				</button>
				<span class="text-xs text-muted-foreground" data-design-kit-toast-count>
					Active: {toastStore.items.length}
				</span>
			</div>
		</article>
	</section>
	<ToastRegion store={toastStore} position="bottom-right" />
</main>
