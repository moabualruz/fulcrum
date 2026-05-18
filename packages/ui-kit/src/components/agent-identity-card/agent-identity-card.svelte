<script lang="ts" module>
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "../../utils.js";

	export type AgentCapability = "code" | "browse" | "shell" | "edit" | "review" | "plan";

	export type AgentIdentityCardProps = WithElementRef<HTMLAttributes<HTMLElement>> & {
		name: string;
		provider: string;
		model: string;
		tokenBudget?: number;
		tokensUsed?: number;
		capabilities?: AgentCapability[];
		costPerCall?: string;
		avatarInitials?: string;
	};
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		name,
		provider,
		model,
		tokenBudget,
		tokensUsed,
		capabilities = [],
		costPerCall,
		avatarInitials,
		class: className,
		...restProps
	}: AgentIdentityCardProps = $props();

	const budgetPercent = $derived.by(() => {
		if (!tokenBudget || tokenBudget <= 0 || tokensUsed === undefined) return null;
		return Math.min(100, Math.round((tokensUsed / tokenBudget) * 100));
	});
</script>

<article
	bind:this={ref}
	data-slot="agent-identity-card"
	data-provider={provider}
	class={cn(
		"grid gap-3 rounded-md border border-border bg-card p-4",
		className,
	)}
	{...restProps}
>
	<header class="flex items-start gap-3">
		<span
			aria-hidden="true"
			data-slot="agent-identity-card-avatar"
			class="grid size-10 shrink-0 place-items-center rounded-full bg-muted font-semibold text-foreground"
		>
			{avatarInitials ?? name.slice(0, 2).toUpperCase()}
		</span>
		<div class="grid">
			<p data-slot="agent-identity-card-name" class="text-sm font-semibold">{name}</p>
			<p data-slot="agent-identity-card-meta" class="text-xs text-muted-foreground">
				{provider} · {model}
			</p>
		</div>
	</header>
	{#if capabilities.length > 0}
		<ul class="flex flex-wrap items-center gap-1" data-slot="agent-identity-card-caps">
			{#each capabilities as capability (capability)}
				<li
					data-slot="agent-identity-card-cap"
					data-capability={capability}
					class="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
				>
					{capability}
				</li>
			{/each}
		</ul>
	{/if}
	<dl class="grid grid-cols-2 gap-2 text-xs">
		{#if budgetPercent !== null}
			<div>
				<dt class="text-muted-foreground">Tokens</dt>
				<dd data-slot="agent-identity-card-tokens" class="font-medium tabular-nums">
					{tokensUsed?.toLocaleString()} / {tokenBudget?.toLocaleString()} ({budgetPercent}%)
				</dd>
			</div>
		{/if}
		{#if costPerCall}
			<div>
				<dt class="text-muted-foreground">Cost / call</dt>
				<dd data-slot="agent-identity-card-cost" class="font-medium tabular-nums">{costPerCall}</dd>
			</div>
		{/if}
	</dl>
</article>
