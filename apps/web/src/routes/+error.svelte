<script lang="ts">
	import { page } from "$app/state";
	import { buttonVariants } from "@fulcrum/ui-kit";
	import { cn } from "$lib/utils.js";

	const error = $derived(page.error);
	const status = $derived(page.status);
	const code = $derived((error as { code?: string } | null)?.code);
	const recovery = $derived((error as { recovery?: string } | null)?.recovery);
	const traceId = $derived((error as { traceId?: string } | null)?.traceId);
	const permissionDenied = $derived(status === 403 || code === "FORBIDDEN");
</script>

<main class="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
	<section class="w-full max-w-md space-y-4 text-center">
		<p class="text-sm text-muted-foreground">{status}</p>
		<h1 class="text-2xl font-semibold">
			{permissionDenied ? "Permission denied" : "Something went wrong"}
		</h1>
		<p class="text-sm text-muted-foreground">
			{permissionDenied
				? "You do not have access to this Fulcrum page."
				: error?.message ?? "Fulcrum could not render this page."}
		</p>
		<p class="text-sm text-muted-foreground">
			{recovery ?? (permissionDenied ? "Request access or switch workspace." : "Retry the page, then run fulcrum doctor if it fails again.")}
		</p>
		{#if traceId}
			<p class="font-mono text-xs text-muted-foreground">trace={traceId}</p>
		{/if}
		<a href="/" class={cn(buttonVariants({ variant: "default" }))}>Go home</a>
	</section>
</main>
