export interface ErrorTelemetry {
	recordError: (error: unknown) => Promise<unknown> | unknown;
}

export async function recordGlobalError(
	error: unknown,
	telemetry: ErrorTelemetry | undefined = getWindowTelemetry(),
): Promise<void> {
	try {
		await telemetry?.recordError(error);
	} catch {
		// Error telemetry must never create another unhandled error.
	}
}

export function installGlobalErrorHandler(
	telemetry: ErrorTelemetry | undefined = getWindowTelemetry(),
): () => void {
	if (typeof window === "undefined") return () => {};
	const handler = (
		message: string | Event,
		source?: string,
		lineno?: number,
		colno?: number,
		error?: Error,
	) => {
		void recordGlobalError(error ?? { message, source, lineno, colno }, telemetry);
		return false;
	};
	window.onerror = handler;
	return () => {
		if (window.onerror === handler) window.onerror = null;
	};
}

function getWindowTelemetry(): ErrorTelemetry | undefined {
	if (typeof window === "undefined") return undefined;
	return (window as Window & { telemetry?: ErrorTelemetry }).telemetry;
}

