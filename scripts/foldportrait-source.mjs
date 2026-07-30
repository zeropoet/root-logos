#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const foldPortraitRoot = resolve(process.env.FOLDPORTRAIT_PATH || resolve(root, "../FoldPortrait"));
const sovereignStandardRoot = resolve(process.env.SOVEREIGN_STANDARD_PATH || resolve(root, "../sovereign-standard"));
const materialPath = resolve(root, "sources/sovereign-standard.snapshot.json");
const outputPath = resolve(root, "sources/foldportrait.snapshot.json");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const digest = (value) => createHash("sha256").update(
  typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))
).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ledger = await readJson(resolve(foldPortraitRoot, "Output/iterations/evolution.json"));
const material = await readJson(materialPath);
const materialWorks = new Map(material.works.map((work) => [work.artifact_id, work]));
const renders = [];

for (const entry of ledger) {
  const artifactId = basename(entry.svgPath, ".svg");
  const materialWork = materialWorks.get(artifactId);
  assert(materialWork, `${artifactId} has no Sovereign Standard material witness.`);
  const sovereignManifest = await readJson(resolve(
    sovereignStandardRoot, "witness/archive", artifactId, "manifest.json"
  ));
  const pngPath = resolve(foldPortraitRoot, "Output/png", `${artifactId}.png`);
  const pngHash = digest(await readFile(pngPath));
  assert(pngHash === materialWork.file_sha256, `${artifactId} PNG does not match its material witness.`);
  assert(sovereignManifest.sha256 === pngHash, `${artifactId} archive manifest has a different PNG witness.`);
  assert(sovereignManifest.foldportrait?.render_hash === entry.renderHash, `${artifactId} render hash diverged.`);
  assert(sovereignManifest.foldportrait?.convergence_hash === entry.convergenceHash, `${artifactId} convergence hash diverged.`);

  renders.push({
    artifact_id: artifactId,
    iteration: entry.iteration,
    convergence_hash: entry.convergenceHash,
    render_hash: entry.renderHash,
    memory_signature: entry.memorySignature,
    refinement_depth: entry.refinementDepth,
    svg_url: `https://zeropoet.github.io/FoldPortrait/Output/iterations/${artifactId}.svg`,
    png_url: `https://zeropoet.github.io/FoldPortrait/Output/png/${artifactId}.png`,
    material_witness: {
      file_sha256: materialWork.file_sha256,
      manifest_url: materialWork.manifest_url,
      mint_status: materialWork.mint_status,
      vessels: materialWork.vessels.map(({ vessel_number, public_url, state, convergence_hash }) => ({
        vessel_number, public_url, state, convergence_hash
      }))
    }
  });
}

const payload = {
  schema: "root-logos-foldportrait-witness/v1",
  source_id: "foldportrait",
  status: "witnessed",
  source_revision: `sha256:${digest(ledger)}`,
  repository: "https://github.com/zeropoet/FoldPortrait",
  public_url: "https://zeropoet.github.io/FoldPortrait/",
  relation: "render-materializes-as-witness-work",
  statement: "Each FoldPortrait render is bound to its corresponding Sovereign Standard material-witness object by artifact identity, render hash, convergence hash, and archived PNG hash.",
  boundary: "Root Logos receives public render identity and material lineage, not generation authority, minting authority, custody, collector identity, or private order data.",
  measures: {
    renders: renders.length,
    material_matches: renders.length,
    embodied_renders: renders.filter(({ material_witness }) => material_witness.vessels.length).length,
    prepared_renders: renders.filter(({ material_witness }) => material_witness.mint_status === "prepared").length
  },
  renders
};
const snapshot = { ...payload, witness: `sha256:${digest(payload)}` };
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
process.stdout.write(`Witnessed ${renders.length} FoldPortrait renders at ${snapshot.witness}.\n`);
