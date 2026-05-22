<script lang="ts">
  import { Select } from "@fulcrum/ui-kit";
	import { enhance } from "$app/forms";
	import type { PageData, ActionData } from "./$types";
	import type {
		AiAssistSettings,
		ResolvedAiAssistSettings,
		SettingSource,
	} from "@platform-core/application/settings/ai-assist-resolver.ts";

	interface Props {
		data: PageData;
		form?: ActionData;
	}

	let { data, form }: Props = $props();

	let settings = $state<AiAssistSettings>({ ...(data.settings ?? {}) } as AiAssistSettings);
	let scope = $state<"user" | "org">("user");

	const resolved = $derived<ResolvedAiAssistSettings>(data.resolved);

	function sourceBadge(source: SettingSource): string {
		switch (source) {
			case "session":
				return "Session override";
			case "user":
				return "Your preference";
			case "org":
				return "Org default";
			default:
				return "Built-in default";
		}
	}
</script>

<svelte:head>
	<title>AI Assist | Fulcrum Settings</title>
</svelte:head>

<div data-settings-ai-assist class="mx-auto flex max-w-3xl flex-col gap-6 py-8 px-4">
	<header>
		<h1 class="text-2xl font-semibold tracking-tight">AI Assist</h1>
		<p class="mt-1 text-sm text-muted-foreground">
			Per-session, user, and org defaults for AI Assist checkpointing and event transport.
		</p>
	</header>

	{#if form?.saveError}
		<p data-save-error class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
			{form.saveError}
		</p>
	{/if}
	{#if form?.saved}
		<p data-save-success class="rounded-md border border-emerald-500/30 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
			AI Assist settings saved ({form.scope}).
		</p>
	{/if}

	<section data-settings-ai-assist-resolved class="rounded-md border border-border bg-card p-4">
		<h2 class="text-sm font-semibold">Effective resolution</h2>
		<dl class="mt-2 grid grid-cols-2 gap-y-1 text-sm">
			<dt class="text-muted-foreground">Checkpoint mode</dt>
			<dd>
				<span data-resolved-key="checkpointMode" data-resolved-source={resolved.checkpointMode.source}>
					{resolved.checkpointMode.value}
				</span>
				<span class="ml-1 text-xs text-muted-foreground">({sourceBadge(resolved.checkpointMode.source)})</span>
			</dd>
			<dt class="text-muted-foreground">Retention (count)</dt>
			<dd>
				<span data-resolved-key="retentionCount" data-resolved-source={resolved.retentionCount.source}>
					{resolved.retentionCount.value}
				</span>
				<span class="ml-1 text-xs text-muted-foreground">({sourceBadge(resolved.retentionCount.source)})</span>
			</dd>
			<dt class="text-muted-foreground">Retention (days)</dt>
			<dd>
				<span data-resolved-key="retentionDays" data-resolved-source={resolved.retentionDays.source}>
					{resolved.retentionDays.value}
				</span>
				<span class="ml-1 text-xs text-muted-foreground">({sourceBadge(resolved.retentionDays.source)})</span>
			</dd>
			<dt class="text-muted-foreground">Events transport</dt>
			<dd>
				<span data-resolved-key="eventsTransport" data-resolved-source={resolved.eventsTransport.source}>
					{resolved.eventsTransport.value}
				</span>
				<span class="ml-1 text-xs text-muted-foreground">({sourceBadge(resolved.eventsTransport.source)})</span>
			</dd>
		</dl>
	</section>

	<form method="POST" action="?/save" use:enhance class="rounded-md border border-border bg-card p-4 flex flex-col gap-4">
		<fieldset class="flex items-center gap-3 text-sm">
			<legend class="sr-only">Save scope</legend>
			<label class="flex items-center gap-2">
				<input type="radio" name="scope" value="user" bind:group={scope} data-scope-user />
				Save as my preference
			</label>
			<label class="flex items-center gap-2">
				<input type="radio" name="scope" value="org" bind:group={scope} data-scope-org />
				Save as org default
			</label>
		</fieldset>

		<label class="flex flex-col gap-1 text-sm font-medium">
			Checkpoint mode
			<select name="checkpointMode" bind:value={settings.checkpointMode} data-field="checkpointMode" class="h-9 rounded-md border border-input bg-background px-2">
				<option value="auto">auto</option>
				<option value="git">git</option>
				<option value="file">file</option>
				<option value="none">none</option>
			</select>
		</label>

		<label class="flex flex-col gap-1 text-sm font-medium">
			Retention (count)
			<input
				type="number"
				name="retentionCount"
				min="1"
				max="10000"
				bind:value={settings.retentionCount}
				data-field="retentionCount"
				class="h-9 rounded-md border border-input bg-background px-2"
			/>
		</label>

		<label class="flex flex-col gap-1 text-sm font-medium">
			Retention (days)
			<input
				type="number"
				name="retentionDays"
				min="1"
				max="3650"
				bind:value={settings.retentionDays}
				data-field="retentionDays"
				class="h-9 rounded-md border border-input bg-background px-2"
			/>
		</label>

		<label class="flex flex-col gap-1 text-sm font-medium">
			Events transport
			<select name="eventsTransport" bind:value={settings.eventsTransport} data-field="eventsTransport" class="h-9 rounded-md border border-input bg-background px-2">
				<option value="memory">memory</option>
				<option value="db-outbox">db-outbox</option>
				<option value="external">external</option>
			</select>
		</label>

		<button type="submit" data-save-ai-assist class="h-9 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
			Save
		</button>
	</form>
</div>
