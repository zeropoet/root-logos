#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const foldPortraitRoot = resolve(process.env.FOLDPORTRAIT_PATH || resolve(root, "../FoldPortrait"));
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
const reflectionLedger = await readJson(resolve(foldPortraitRoot, "Output/reflections/reflection-ledger.json"));
const currentReflection = await readJson(resolve(foldPortraitRoot, "Output/reflections/current.json"));
const material = await readJson(materialPath);
const materialWorks = new Map(material.works.map((work) => [work.artifact_id, work]));
const renders = [];

for (const entry of ledger) {
  const artifactId = basename(entry.svgPath, ".svg");
  const materialWork = materialWorks.get(artifactId);
  assert(materialWork, `${artifactId} has no Sovereign Standard material witness.`);
  const pngPath = resolve(foldPortraitRoot, "Output/png", `${artifactId}.png`);
  const pngHash = digest(await readFile(pngPath));
  assert(pngHash === materialWork.file_sha256, `${artifactId} PNG does not match its material witness.`);

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

const reflections = reflectionLedger.map((cycle) => {
  assert(cycle.schema === "foldportrait-reflection-cycle/v1", `${cycle.cycleID} has an unsupported reflection schema.`);
  assert(/^FP-REFLECT-\d{4}$/.test(cycle.cycleID), `${cycle.cycleID} has an invalid reflection identity.`);
  assert(/^[a-f0-9]{64}$/.test(cycle.witnessDigest), `${cycle.cycleID} lacks a system witness digest.`);
  assert(/^[a-f0-9]{64}$/.test(cycle.foldKernelIdentity), `${cycle.cycleID} lacks FoldKernel identity continuity.`);
  assert(/^[a-f0-9]{64}$/.test(cycle.renderHash), `${cycle.cycleID} lacks a render hash.`);
  assert(cycle.correlations.length > 0 && cycle.chosenRules.length > 0, `${cycle.cycleID} made no visual reflection choices.`);
  cycle.correlations.forEach((correlation) => {
    assert(correlation.left.split(".")[0] !== correlation.right.split(".")[0], `${cycle.cycleID} contains a same-source correlation.`);
    assert(["structural-resonance", "pearson"].includes(correlation.method), `${cycle.cycleID} has an invalid correlation method.`);
    assert(correlation.interpretation, `${cycle.cycleID} lacks an epistemic interpretation.`);
  });
  const artifact = basename(cycle.artifact);
  const notes = basename(cycle.notes);
  return {
    cycle_id: cycle.cycleID,
    sequence: cycle.sequence,
    witnessed_at: cycle.witnessedAt,
    witness_digest: cycle.witnessDigest,
    foldkernel_identity: cycle.foldKernelIdentity,
    render_hash: cycle.renderHash,
    previous_cycle_id: cycle.previousCycleID,
    chosen_rules: cycle.chosenRules,
    correlations: cycle.correlations,
    svg_url: `https://zeropoet.github.io/FoldPortrait/Output/reflections/${artifact}`,
    notes_url: `https://zeropoet.github.io/FoldPortrait/Output/reflections/${notes}`,
    boundary: cycle.boundary
  };
});
assert(reflections.at(-1)?.cycle_id === currentReflection.cycleID, "The FoldPortrait current reflection does not match its lineage head.");
assert(reflections.at(-1)?.render_hash === currentReflection.renderHash, "The FoldPortrait current reflection hash diverged.");

const payload = {
  schema: "root-logos-foldportrait-witness/v2",
  source_id: "foldportrait",
  status: "witnessed",
  source_revision: `sha256:${digest({ ledger, reflectionLedger, currentReflection })}`,
  repository: "https://github.com/zeropoet/FoldPortrait",
  public_url: "https://zeropoet.github.io/FoldPortrait/",
  relation: "render-materializes-as-witness-work; system-witness-becomes-autonomous-visual-reflection",
  statement: "FoldPortrait preserves its sealed material render lineage while autonomously choosing bounded, noncausal visual relations from aggregate public system witnesses. Each reflection remains FoldKernel-bound, additive, and independently witnessed.",
  boundary: "Root Logos receives public render identity, material lineage, reflection choices, and epistemic limits—not FoldPortrait generation authority, source authority, minting authority, custody, collector identity, private order data, or causal truth.",
  measures: {
    renders: renders.length,
    material_matches: renders.length,
    embodied_renders: renders.filter(({ material_witness }) => material_witness.vessels.length).length,
    prepared_renders: renders.filter(({ material_witness }) => material_witness.mint_status === "prepared").length,
    reflection_cycles: reflections.length,
    current_correlations: reflections.at(-1)?.correlations.length || 0,
    current_rules: reflections.at(-1)?.chosen_rules.length || 0
  },
  renders,
  reflections,
  current_reflection: currentReflection.cycleID,
  material_source_witness: material.witness
};
const snapshot = { ...payload, witness: `sha256:${digest(payload)}` };
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
process.stdout.write(`Witnessed ${renders.length} sealed FoldPortrait renders and ${reflections.length} autonomous reflections at ${snapshot.witness}.\n`);
