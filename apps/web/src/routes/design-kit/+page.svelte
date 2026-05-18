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
	} from "@fulcrum/ui-kit";

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
	</section>
</main>
