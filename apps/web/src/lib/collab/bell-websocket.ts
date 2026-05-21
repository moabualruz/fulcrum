/**
 * Bell badge WebSocket: replaces 60s poll when flag ON.
 * Connects to /api/ws/notify; auto-retries with exponential back-off.
 */
import type { BellWebSocket, BellWebSocketOptions } from "./types.js";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;

export class BellWebSocketClient implements BellWebSocket {
	private ws: WebSocket | null = null;
	private retries = 0;
	private closed = false;
	private opts: BellWebSocketOptions;

	constructor(opts: BellWebSocketOptions) {
		this.opts = opts;
		this._open();
	}

	get readyState(): number {
		return this.ws?.readyState ?? WebSocket.CLOSED;
	}

	close(): void {
		this.closed = true;
		this.ws?.close();
	}

	private _open(): void {
		if (this.closed) return;
		this.ws = new WebSocket(this.opts.url);

		this.ws.onopen = () => {
			this.retries = 0;
			this.opts.onOpen?.();
		};

		this.ws.onmessage = (evt) => {
			try {
				const data = JSON.parse(evt.data as string);
				this.opts.onMessage(data);
			} catch {
				this.opts.onMessage(evt.data);
			}
		};

		this.ws.onclose = () => {
			this.opts.onClose?.();
			if (!this.closed && this.retries < MAX_RETRIES) {
				const delay = BASE_DELAY_MS * 2 ** this.retries;
				this.retries++;
				setTimeout(() => this._open(), delay);
			}
		};
	}
}

/** Factory: returns null when flag OFF (no WebSocket attempted). */
export function createBellWebSocket(
	opts: BellWebSocketOptions,
	enabled: boolean,
): BellWebSocket | null {
	if (!enabled) return null;
	return new BellWebSocketClient(opts);
}
