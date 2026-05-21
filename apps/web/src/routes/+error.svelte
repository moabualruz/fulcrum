<script lang="ts">
	import { page } from "$app/state";
	import { buttonVariants, ErrorBanner } from "@fulcrum/ui-kit";
	import { cn } from "$lib/utils.js";

	const error = $derived(page.error);
	const status = $derived(page.status);
	const code = $derived((error as { code?: string } | null)?.code);
	const suppliedRecovery = $derived((error as { recovery?: string } | null)?.recovery);
	const suppliedTraceId = $derived((error as { traceId?: string } | null)?.traceId);
	const traceId = $derived(suppliedTraceId ?? fallbackTraceId(status, code));
	const errorCopy = $derived(copyForStatus(status, code, suppliedRecovery, traceId));

	function fallbackTraceId(statusCode: number, errorCode: string | undefined): string {
		const suffix = (errorCode ?? `http_${statusCode}`).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
		return `tr_${suffix}`;
	}

	function copyForStatus(
		statusCode: number,
		errorCode: string | undefined,
		recovery: string | undefined,
		trace: string,
	): { title: string; message: string; actionLabel: string } {
		if (statusCode === 403 || errorCode === "FORBIDDEN") {
			return {
				title: "You don't have access to this page.",
				message: `${recovery ?? "Your current workspace role cannot open this surface. Ask an admin to add you, or switch workspace."} trace=${trace}`,
				actionLabel: "Switch workspace",
			};
		}
		if (statusCode === 404) {
			return {
				title: "This page no longer exists.",
				message: `${recovery ?? "It may have moved or been archived. Open the route from the sidebar or audit trail."} trace=${trace}`,
				actionLabel: "Open home",
			};
		}
		return {
			title: "Fulcrum could not render this page.",
			message: `${recovery ?? "The local API or route module failed before the surface loaded. Retry this route, then run `fulcrum doctor`."} trace=${trace}`,
			actionLabel: "Open home",
		};
	}

	function retryRoute(): void {
		if (typeof window !== "undefined") window.location.reload();
	}
</script>

<main class="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
	<section class="w-full max-w-xl space-y-4" data-error-boundary-status={status}>
		<p class="font-mono text-xs text-muted-foreground">status={status}</p>
		<ErrorBanner
			title={errorCopy.title}
			message={errorCopy.message}
			{traceId}
			retryLabel="Retry"
			onRetry={retryRoute}
			surface="block"
		/>
		<a href="/" class={cn(buttonVariants({ variant: "default" }))}>{errorCopy.actionLabel}</a>
	</section>
</main>
