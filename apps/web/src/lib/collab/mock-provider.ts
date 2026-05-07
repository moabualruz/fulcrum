/**
 * MockCollabProvider — used in tests and when real Hocuspocus is unavailable.
 * Implements the CollabProvider interface without any network calls.
 */
import type { CollabProvider, CollabUser, CursorState, PresenceState } from "./types.js";

export class MockCollabProvider implements CollabProvider {
	private _connected = false;
	private _user: CollabUser | null = null;
	private _presenceCbs = new Set<(state: PresenceState) => void>();
	private _cursorCbs = new Set<(cursors: CursorState[]) => void>();
	private _users = new Map<string, CollabUser>();
	private _cursors = new Map<string, CursorState>();

	get connected(): boolean {
		return this._connected;
	}

	connect(): void {
		this._connected = true;
		if (this._user) {
			this._users.set(this._user.id, this._user);
			this._emitPresence();
		}
	}

	disconnect(): void {
		this._connected = false;
		if (this._user) {
			this._users.delete(this._user.id);
			this._cursors.delete(this._user.id);
			this._emitPresence();
			this._emitCursors();
		}
	}

	setUser(user: CollabUser): void {
		this._user = user;
		if (this._connected) {
			this._users.set(user.id, user);
			this._emitPresence();
		}
	}

	onPresenceChange(cb: (state: PresenceState) => void): () => void {
		this._presenceCbs.add(cb);
		return () => this._presenceCbs.delete(cb);
	}

	onCursorChange(cb: (cursors: CursorState[]) => void): () => void {
		this._cursorCbs.add(cb);
		return () => this._cursorCbs.delete(cb);
	}

	updateCursor(anchor: number, head: number): void {
		if (!this._connected || !this._user) return;
		this._cursors.set(this._user.id, { userId: this._user.id, user: this._user, anchor, head });
		this._emitCursors();
	}

	/** Test helper — simulate a remote user joining */
	simulateUserJoin(user: CollabUser): void {
		this._users.set(user.id, user);
		this._emitPresence();
	}

	/** Test helper — simulate a remote user leaving */
	simulateUserLeave(userId: string): void {
		this._users.delete(userId);
		this._cursors.delete(userId);
		this._emitPresence();
		this._emitCursors();
	}

	/** Test helper — simulate a remote cursor update */
	simulateRemoteCursor(cursor: CursorState): void {
		this._cursors.set(cursor.userId, cursor);
		this._emitCursors();
	}

	private _emitPresence(): void {
		const state: PresenceState = { users: Array.from(this._users.values()) };
		for (const cb of this._presenceCbs) cb(state);
	}

	private _emitCursors(): void {
		const cursors = Array.from(this._cursors.values());
		for (const cb of this._cursorCbs) cb(cursors);
	}
}
