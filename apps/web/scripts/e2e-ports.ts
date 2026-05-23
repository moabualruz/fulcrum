import { createServer } from "node:net";

export interface PortBlockOptions {
  count: number;
  preferredBase?: number;
}

export async function allocatePortBlock(options: PortBlockOptions): Promise<number[]> {
  const count = Math.max(1, options.count);

  if (options.preferredBase) {
    const requested = range(options.preferredBase, count);
    await assertPortsAvailable(requested);
    return requested;
  }

  const ports: number[] = [];
  for (let index = 0; index < count; index += 1) {
    ports.push(await getAvailablePort());
  }
  return ports;
}

async function assertPortsAvailable(ports: number[]): Promise<void> {
  for (const port of ports) {
    if (!(await isPortAvailable(port))) {
      throw new Error(`E2E port ${port} is already in use`);
    }
  }
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Could not allocate E2E port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function range(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => start + index);
}
