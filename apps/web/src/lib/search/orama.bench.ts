/**
 * Orama search benchmark: validates <100ms at 10k documents.
 *
 * Run: cd apps/web && bun run src/lib/search/orama.bench.ts
 */

import { OramaIndex, type SearchDocument } from "./OramaIndex.ts";

const KINDS = ["task", "doc", "memory", "sprint"] as const;
const STATUSES = ["todo", "in_progress", "done", "archived"] as const;
const PROJECTS = ["project-alpha", "project-beta", "project-gamma", "project-delta"] as const;

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateDocs(count: number): SearchDocument[] {
  const docs: SearchDocument[] = [];
  for (let i = 0; i < count; i++) {
    docs.push({
      entityId: `entity-${i}`,
      title: `Document ${i}: ${randomItem(KINDS)} about topic ${i % 100}`,
      body: `This is the body of document ${i}. It contains searchable text about ${randomItem(KINDS)} and related information for project ${i % 50}.`,
      kind: randomItem(KINDS),
      project: randomItem(PROJECTS),
      status: randomItem(STATUSES),
      updatedAt: Date.now() - Math.floor(Math.random() * 86_400_000 * 30),
    });
  }
  return docs;
}

async function bench() {
  const DOC_COUNT = 10_000;
  console.log(`Building index with ${DOC_COUNT} documents...`);

  const index = new OramaIndex();
  const buildStart = performance.now();
  await index.build(generateDocs(DOC_COUNT));
  const buildMs = performance.now() - buildStart;
  console.log(`Build: ${buildMs.toFixed(1)}ms`);

  const queries = ["document", "task", "project", "body", "topic", "sprint", "memory", "information"];

  console.log("\nSearch benchmark (5 runs each):");
  const allMs: number[] = [];

  for (const q of queries) {
    const times: number[] = [];
    for (let r = 0; r < 5; r++) {
      const t0 = performance.now();
      await index.search(q, { limit: 20 });
      times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const max = Math.max(...times);
    allMs.push(...times);
    console.log(`  "${q}": avg ${avg.toFixed(2)}ms, max ${max.toFixed(2)}ms`);
  }

  const overallAvg = allMs.reduce((a, b) => a + b, 0) / allMs.length;
  const overallMax = Math.max(...allMs);
  console.log(`\nOverall: avg ${overallAvg.toFixed(2)}ms, max ${overallMax.toFixed(2)}ms`);

  // Assert < 100ms
  if (overallMax >= 100) {
    console.error(`FAIL: max search time ${overallMax.toFixed(2)}ms exceeds 100ms threshold`);
    process.exit(1);
  } else {
    console.log(`PASS: all searches under 100ms threshold`);
  }

  // Facet search bench
  console.log("\nFacet search benchmark:");
  const facetStart = performance.now();
  const facetResult = await index.search("document", { facets: true, limit: 20 });
  const facetMs = performance.now() - facetStart;
  console.log(`  Facet search: ${facetMs.toFixed(2)}ms, facets: ${JSON.stringify(Object.keys(facetResult.facets ?? {}))}`);
  if (facetMs >= 100) {
    console.error(`FAIL: facet search ${facetMs.toFixed(2)}ms exceeds 100ms`);
    process.exit(1);
  }

  console.log("\nAll benchmarks passed.");
}

bench().catch((err) => {
  console.error(err);
  process.exit(1);
});
