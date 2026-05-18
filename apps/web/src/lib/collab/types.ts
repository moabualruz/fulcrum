// Collab types — shared by real and mock providers

export interface CollabUser {
	id: string;
	name: string;
	color: string;
}

export interface CursorState {
	userId: string;
	user: CollabUser;
	anchor: number;
	head: number;
}

export interface PresenceState {
	users: CollabUser[];
}

export interface CollabProvider {
	connect(): void;
	disconnect(): void;
	setUser(user: CollabUser): void;
	onPresenceChange(cb: (state: PresenceState) => void): () => void;
	onCursorChange(cb: (cursors: CursorState[]) => void): () => void;
	updateCursor(anchor: number, head: number): void;
	readonly connected: boolean;
	readonly document?: unknown;
}

export interface BellWebSocketOptions {
	url: string;
	onMessage(data: unknown): void;
	onOpen?(): void;
	onClose?(): void;
}

export interface BellWebSocket {
	close(): void;
	readonly readyState: number;
}
