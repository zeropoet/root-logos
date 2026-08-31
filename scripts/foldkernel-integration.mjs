#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { issueRootLogosValueReceipt } from "./foldkernel-value-receipt.mjs";

const root = new URL("../", import.meta.url);
export const contractVersion = "FoldKernel-Integration-1.0.0";
export const protocolVersion = "FoldKernel-1.0.0";
export const packageVersion = "1.0.5";

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

function valuePeriod(updated) {
  const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const match = new RegExp(`^(${names.join("|")}) ([0-9]{4})$`).exec(updated);
  if (!match) throw new Error("constitutional update period is invalid");
  const month = names.indexOf(match[1]) + 1;
  const year = Number(match[2]);
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    periodStart: `${year}-${String(month).padStart(2, "0")}-01`,
    periodEnd: `${year}-${String(month).padStart(2, "0")}-${finalDay}`,
  };
}

async function main() {
  const target = new URL("content/foldkernel-projection.json", root);
  const projection = await buildFoldKernelProjection();
  const serialized = serializeProjection(projection);
  const graph = await readJson("content/constitutional-graph.json");
  const valueReceipt = issueRootLogosValueReceipt({
    eventID: `root-logos-${graph.meta.revision}`,
    artifactDigest: projection.projection_witness.replace("sha256:", ""),
    outputKind: "constitutional_projection",
    ...valuePeriod(graph.meta.updated),
  });
  const valueTarget = new URL("content/foldkernel-value-receipt.json", root);
  const valueSerialized = serializeProjection(valueReceipt);
  if (process.argv.includes("--check")) {
    const current = await readFile(target, "utf8").catch(() => "");
    if (current !== serialized) throw new Error("FoldKernel projection drifted; run npm run foldkernel:project");
    const currentValue = await readFile(valueTarget, "utf8").catch(() => "");
    if (currentValue !== valueSerialized) throw new Error("FoldKernel value receipt drifted; run npm run foldkernel:project");
    process.stdout.write("PASS Root Logos FoldKernel projection is current.\n");
    return;
  }
  await writeFile(target, serialized);
  await writeFile(valueTarget, valueSerialized);
  process.stdout.write(`${fileURLToPath(target)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
