import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TemporaryPostgres {
  dataDir: string;
  port: number;
  url: string;
  stop: () => Promise<void>;
}

const decoder = new TextDecoder();

function outputText(output: Uint8Array | ArrayBuffer | undefined): string {
  if (!output) return "";
  return decoder.decode(output);
}

function runPostgresCommand(command: string, args: string[]): { stderr: string; stdout: string } {
  const result = Bun.spawnSync({
    cmd: [command, ...args],
    env: {
      ...process.env,
      LANG: "C",
      LC_ALL: "C",
    },
    stderr: "pipe",
    stdout: "pipe",
  });

  const stdout = outputText(result.stdout);
  const stderr = outputText(result.stderr);
  if (result.exitCode !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed with exit code ${result.exitCode}`,
        stdout.trim(),
        stderr.trim(),
      ].filter(Boolean).join("\n"),
    );
  }

  return { stderr, stdout };
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

export async function startTemporaryPostgres(): Promise<TemporaryPostgres> {
  const dataDir = await mkdtemp(join(tmpdir(), "fulcrum-typeorm-postgres-"));
  const logFile = join(dataDir, "postgres.log");
  const port = await getFreePort();
  let started = false;

  const stop = async () => {
    if (started) {
      try {
        runPostgresCommand("pg_ctl", ["-D", dataDir, "-m", "fast", "-w", "stop"]);
      } finally {
        started = false;
      }
    }
    await rm(dataDir, { force: true, recursive: true });
  };

  try {
    runPostgresCommand("initdb", ["-D", dataDir, "-A", "trust", "-U", "postgres", "--no-locale"]);
    runPostgresCommand("pg_ctl", [
      "-D",
      dataDir,
      "-l",
      logFile,
      "-o",
      `-F -p ${port} -h 127.0.0.1`,
      "-w",
      "start",
    ]);
    started = true;

    return {
      dataDir,
      port,
      url: `postgresql://postgres@127.0.0.1:${port}/postgres`,
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
