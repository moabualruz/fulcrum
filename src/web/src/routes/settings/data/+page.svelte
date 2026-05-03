<script lang="ts">
	import type { PageData } from "./$types";

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Import state
	let importFile: FileList | undefined = $state();
	let columnMapJson = $state('{"Title":"title","Status":"status"}');
	let importResult: string | null = $state(null);
	let importError: string | null = $state(null);

	async function handleImport(e: SubmitEvent) {
		e.preventDefault();
		importResult = null;
		importError = null;

		if (!importFile || importFile.length === 0) {
			importError = "No file selected.";
			return;
		}

		let columnMap: Record<string, string>;
		try {
			columnMap = JSON.parse(columnMapJson);
		} catch {
			importError = "Column map is not valid JSON.";
			return;
		}

		const formData = new FormData();
		formData.append("file", importFile[0]);
		formData.append("columnMap", JSON.stringify(columnMap));

		const res = await fetch("/api/data/import-csv", {
			method: "POST",
			body: formData,
		});
		const json = await res.json();
		if (!res.ok) {
			importError = json.error ?? "Import failed.";
		} else {
			importResult = `Imported ${json.written} records (${json.skipped} skipped).`;
		}
	}
</script>

<svelte:head>
	<title>Settings › Data — Fulcrum</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-8 space-y-10">
	<h1 class="text-2xl font-semibold">Data</h1>

	<!-- Export Section -->
	<section class="space-y-4">
		<h2 class="text-lg font-medium">Export</h2>

		{#if data.exportCsvEnabled}
			<div class="rounded border p-4 flex items-center justify-between">
				<div>
					<p class="font-medium">CSV</p>
					<p class="text-sm text-muted-foreground">Download all tasks as a CSV file.</p>
				</div>
				<a
					href="/api/data/export-csv?entity=tasks"
					class="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
					download="tasks.csv"
				>
					Download
				</a>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				CSV export is not enabled. Set <code>FULCRUM_FEATURES=export-csv</code> to enable.
			</p>
		{/if}
	</section>

	<!-- Import Section -->
	<section class="space-y-4">
		<h2 class="text-lg font-medium">Import</h2>

		{#if data.importCsvEnabled}
			<!-- CSV sub-tab -->
			<div class="rounded border p-4 space-y-4">
				<h3 class="font-medium">CSV</h3>

				<form onsubmit={handleImport} class="space-y-3">
					<!-- File upload -->
					<div>
						<label for="csv-file" class="block text-sm font-medium mb-1">CSV File</label>
						<input
							id="csv-file"
							type="file"
							accept=".csv,text/csv"
							class="block w-full text-sm"
							onchange={(e) => { importFile = (e.target as HTMLInputElement).files ?? undefined; }}
						/>
					</div>

					<!-- Column mapper -->
					<div>
						<label for="col-map" class="block text-sm font-medium mb-1">
							Column Map (JSON)
							<span class="text-muted-foreground font-normal">— maps CSV header → Fulcrum field</span>
						</label>
						<textarea
							id="col-map"
							bind:value={columnMapJson}
							rows="3"
							class="w-full rounded border px-2 py-1 font-mono text-xs"
							placeholder='{"Title":"title","Status":"status"}'
						></textarea>
					</div>

					{#if importError}
						<p class="text-sm text-destructive">{importError}</p>
					{/if}
					{#if importResult}
						<p class="text-sm text-green-600">{importResult}</p>
					{/if}

					<button
						type="submit"
						class="rounded bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90"
					>
						Import
					</button>
				</form>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				CSV import is not enabled. Set <code>FULCRUM_FEATURES=import-csv</code> to enable.
			</p>
		{/if}
	</section>
</div>
