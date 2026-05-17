export type Unsubscribe = () => void;

export interface AcpTransport {
  send(json: string): Promise<void>;
  onMessage(cb: (json: string) => void): Unsubscribe;
  onClose(cb: (reason?: string) => void): Unsubscribe;
  close(): Promise<void>;
}

export class TransportListeners<T> {
  private callbacks = new Set<(value: T) => void>();

  add(cb: (value: T) => void): Unsubscribe {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  emit(value: T): void {
    for (const cb of [...this.callbacks]) {
      try {
        cb(value);
      } catch (error) {
        console.error("Transport listener threw:", error);
      }
    }
  }

  clear(): void {
    this.callbacks.clear();
  }
}
