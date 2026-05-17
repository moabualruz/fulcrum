#!/usr/bin/env bun
// Cross-compile fulcrum to every supported platform via `bun build --compile`.
// Output: dist/fulcrum-<os>-<arch>{,.exe}
//
// Bun supports cross-compile from any host to any target.
// See https://bun.sh/docs/bundler/executables.

import { mkdir } from "node:fs/promises";

const OPTIONAL_NEST_TRANSPORT_EXTERNALS = [
  "@nestjs/platform-socket.io",
  "@grpc/grpc-js",
  "@grpc/proto-loader",
  "kafkajs",
  "nats",
  "amqplib",
  "amqp-connection-manager",
  "ioredis",
  "mqtt",
];

const TARGETS: Array<{ target: string; out: string }> = [
  { target: "bun-darwin-arm64",     out: "dist/fulcrum-darwin-arm64" },
  { target: "bun-darwin-x64",       out: "dist/fulcrum-darwin-x64" },
  { target: "bun-linux-x64",        out: "dist/fulcrum-linux-x64" },
  { target: "bun-linux-arm64",      out: "dist/fulcrum-linux-arm64" },
  { target: "bun-windows-x64",      out: "dist/fulcrum-windows-x64.exe" },
];

await mkdir("dist", { recursive: true });

for (const { target, out } of TARGETS) {
  const t0 = Date.now();
  process.stdout.write(`→ ${target} ... `);
  const proc = Bun.spawn(
    [
      "bun",
      "build",
      "--compile",
      "--minify",
      `--target=${target}`,
      "--external=@opentui/core-*",
      ...OPTIONAL_NEST_TRANSPORT_EXTERNALS.map((pkg) => `--external=${pkg}`),
      "apps/cli/src/main.ts",
      "--outfile",
      out,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const exit = await proc.exited;
  const ms = Date.now() - t0;
  if (exit === 0) {
    const file = Bun.file(out);
    const sz = ((await file.stat()).size / 1_000_000).toFixed(1);
    console.log(`${sz}MB (${ms}ms)`);
  } else {
    const err = await new Response(proc.stderr).text();
    console.log(`FAIL (${ms}ms)\n${err}`);
    process.exit(1);
  }
}
console.log("\nAll targets built. Upload dist/* to a GitHub release and update install.sh's BASE_URL.");
