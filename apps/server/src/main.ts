import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/api/v1/doctor", (context) =>
  context.json({
    schemaVersion: "1.0",
    status: "ok",
    data: { summary: "scaffold", bind: "127.0.0.1" }
  })
);

const port = Number(process.env.FULCRUM_PORT ?? 4173);

serve({ fetch: app.fetch, hostname: "127.0.0.1", port });

console.log(`Fulcrum local API listening on http://127.0.0.1:${port}`);
