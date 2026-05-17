<script lang="ts">
	import { enhance } from "$app/forms";
	import type { PageData } from "./$types";
	import { buttonVariants } from "$lib/components/ui/button";
	import { cn } from "$lib/utils.js";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	function formatTimestamp(value: string): string {
		const d = new Date(value);
		return d.toLocaleString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	let selectedVersion = $state<number | null>(null);
	let diffView = $state(false);
	let showDiff = $state(true);

	function selectVersion(version: number): void {
		selectedVersion = version;
		diffView = true;
	}

	const selectedData = $derived(
		data.versions.find((v) => v.version === selectedVersion),
	);

	const diffLines = $derived(() => {
		if (!selectedData || !data.doc.bodyMd) return [];
		const current = (data.doc.bodyMd ?? "").split("\n");
		const old = (selectedData.body ?? "").split("\n");
		const lines: Array<{ type: "same" | "add" | "remove"; text: string }> = [];
		const maxLen = Math.max(current.length, old.length);
		for (let i = 0; i < maxLen; i++) {
			const c = current[i];
			const o = old[i];
			if (c === o) lines.push({ type: "same", text: c ?? "" });
			else {
				if (o !== undefined) lines.push({ type: "remove", text: o });
				if (c !== undefined) lines.push({ type: "add", text: c });
			}
		}
		return lines;
	});
</script>

<header
	data-doc-history-header
	class={cn("flex items-baseline justify-between gap-4 border-b border-border pb-4 mb-4")}
>
	<div class={cn("flex items-baseline gap-3")}>
		<a
			href="/docs/{data.doc.id}"
			data-back-doc
			class={cn("text-sm text-muted-foreground hover:underline")}
		>← {data.doc.title}</a>
		<h1 class={cn("text-2xl font-semibold tracking-tight")}>History</h1>
	</div>
</header>

{#if data.versions.length === 0}
	<div
		data-empty-history
		class={cn("rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground")}
	>No version history yet.</div>
{:else}
	<div data-doc-history-view class={cn("grid grid-cols-[minmax(200px,1fr)_2fr] gap-6")}>
		<div data-restore-version hidden></div>
		<div data-version-list class={cn("flex flex-col gap-1")}>
			{#each data.versions as ver (ver.version)}
				{@const versionNumber = ver.version ?? ver.versionNum}
				<button
					type="button"
					data-version-item
					data-doc-version={versionNumber}
					data-version={versionNumber}
					data-selected={selectedVersion === versionNumber ? "true" : undefined}
					onclick={() => selectVersion(versionNumber)}
					class={cn(
						"flex flex-col gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
						selectedVersion === versionNumber
							? "border-primary bg-primary/5"
							: "border-border hover:bg-muted/50",
					)}
				>
					<span class={cn("font-medium")}>Version {versionNumber}</span>
					{#if ver.isSnapshot}
						<span data-snapshot-badge class={cn("text-xs text-muted-foreground")}>Snapshot</span>
					{/if}
					<span class={cn("text-xs text-muted-foreground")}>{ver.author ?? ""} — {formatTimestamp(ver.created_at ?? ver.createdAt)}</span>
				</button>
			{/each}
		</div>

		{#if diffView && selectedData}
			<div data-version-detail class={cn("flex flex-col gap-4")}>
				<div class={cn("flex items-center justify-between")}>
					<h2 class={cn("text-lg font-semibold")}>Version {selectedData.version}</h2>
					<div class={cn("flex items-center gap-2")}>
						<button type="button" onclick={() => { showDiff = !showDiff; }} class={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
							{showDiff ? "Raw" : "Diff"}
						</button>
						<form method="POST" action="?/restore" use:enhance>
							<input type="hidden" name="version" value={selectedData.version} />
							<button
								type="submit"
								data-restore-version
								data-restore-btn
								class={cn(buttonVariants({ variant: "outline" }))}
							>Restore this version</button>
						</form>
					</div>
				</div>
				{#if showDiff}
					<div data-version-diff class={cn("rounded-md border border-border overflow-hidden font-mono text-xs leading-5")}>
						{#each diffLines as line, i (i)}
							<div class={cn("px-3 py-0 flex gap-2", {
								"bg-green-50 text-green-800": line.type === "add",
								"bg-red-50 text-red-800": line.type === "remove",
								"text-muted-foreground": line.type === "same",
							})}>
								<span class={cn("w-5 shrink-0 text-right select-none text-muted-foreground")}>
									{line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
								</span>
								<pre class={cn("flex-1 whitespace-pre-wrap")}>{line.text}</pre>
							</div>
						{/each}
						{#if diffLines.length === 0}
							<p class={cn("px-3 py-4 text-center text-muted-foreground")}>No differences</p>
						{/if}
					</div>
				{:else}
					<div class={cn("rounded-md border border-border p-4")}>
						<h3 data-version-title class={cn("mb-2 text-sm font-medium")}>{selectedData.title}</h3>
						<pre
							data-version-body
							class={cn("whitespace-pre-wrap text-sm text-muted-foreground")}
						>{selectedData.body}</pre>
					</div>
				{/if}
			</div>
		{/if}
		{#if data.diffHtml}
			<div data-doc-history-diff>{@html data.diffHtml}</div>
		{/if}
	</div>
{/if}
