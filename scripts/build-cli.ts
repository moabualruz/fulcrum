#!/usr/bin/env bun

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const OUTFILE = "dist/fulcrum";
const WARN_BYTES = 130 * 1024 * 1024;
const MAX_BYTES = 150 * 1024 * 1024;

await mkdir(dirname(OUTFILE), { recursive: true });

const proc = Bun.spawn(
  [
    "bun", "build", "--compile", "--minify",
    "--external", "@grpc/proto-loader",
    "--external", "@grpc/grpc-js",
    "--external", "amqplib",
    "--external", "amqp-connection-manager",
    "--external", "kafkajs",
    "--external", "mqtt",
    "--external", "nats",
    "--external", "@nestjs/websockets",
    "--external", "ioredis",
    "apps/cli/src/main.ts", "--outfile", OUTFILE,
  ],
  {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  },
);

const [stdout, stderr, exitCode] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);

if (stdout.length > 0) process.stdout.write(stdout);
if (stderr.length > 0) process.stderr.write(stderr);
if (exitCode !== 0) process.exit(exitCode);

const stat = await Bun.file(OUTFILE).stat();
const sizeMb = stat.size / 1024 / 1024;
console.log(`built ${OUTFILE}`);
console.log(`binary size ${sizeMb.toFixed(1)}MB`);

if (stat.size > MAX_BYTES) {
  console.error(`binary size ${sizeMb.toFixed(1)}MB exceeds 150MB limit`);
  process.exit(1);
}

if (stat.size > WARN_BYTES) {
  console.warn(`binary size ${sizeMb.toFixed(1)}MB exceeds 130MB warning threshold`);
}
