#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
export const contractVersion = "FoldKernel-Integration-1.0.0";
export const protocolVersion = "FoldKernel-1.0.0";
export const packageVersion = "1.0.4";

function compare(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

function digest(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

export async function buildFoldKernelProjection() {
  const [graph, library] = await Promise.all([
    readJson("content/constitutional-graph.json"),
    readJson("works/library-composition.json"),
  ]);

  const permutation = library.primitives
    .map(({ order, work_id, sealed_edition }) => ({ order, work_id, sealed_edition }))
    .sort((left, right) => left.order - right.order || compare(left, right));
  const locks = {
    constitutional_revision: graph.meta.revision,
    sealed_editions: permutation.map(({ work_id, sealed_edition }) => ({ work_id, sealed_edition })),
  };
  const topology = {
    constitutional_nodes: graph.nodes.map(({ id, type, status }) => ({ id, type, status })).sort(compare),
    constitutional_edges: graph.edges.map(({ from, to, type }) => ({ from, to, type })).sort(compare),
    library_relations: library.relations.map(({ id, kind, from, to }) => ({ id, kind, from, to })).sort(compare),
  };
  const projection = {
    schema: "root-logos-foldkernel-projection/v1",
    contract_version: contractVersion,
    protocol_version: protocolVersion,
    package_version: packageVersion,
    authority: "Root Logos",
    source: {
      constitutional_revision: graph.meta.revision,
      library_witness: library.witness,
    },
    events: [
      { event: "permutation_commit", application_witness: digest(permutation) },
      { event: "lock_state_change", application_witness: digest(locks) },
      { event: "fold_topology_change", application_witness: digest(topology) },
    ],
    boundary: "Application witnesses interpret Root Logos state and are not FoldKernel convergence hashes.",
  };
  return { ...projection, projection_witness: digest(projection) };
}

export function serializeProjection(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  const target = new URL("content/foldkernel-projection.json", root);
  const serialized = serializeProjection(await buildFoldKernelProjection());
  if (process.argv.includes("--check")) {
    const current = await readFile(target, "utf8").catch(() => "");
    if (current !== serialized) throw new Error("FoldKernel projection drifted; run npm run foldkernel:project");
    process.stdout.write("PASS Root Logos FoldKernel projection is current.\n");
    return;
  }
  await writeFile(target, serialized);
  process.stdout.write(`${fileURLToPath(target)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
