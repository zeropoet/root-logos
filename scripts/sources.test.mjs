import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sealPublicWitnesses, syncFoldForge, syncSovereignStandard, validateSources } from "./sources.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const foldForge = resolve(root, "../FoldForge");
const sovereignStandard = resolve(root, "../sovereign-standard/root-logos-witness-export.json");
const foldForgeSnapshotPath = resolve(root, "sources/foldforge.snapshot.json");
const sovereignStandardSnapshotPath = resolve(root, "sources/sovereign-standard.snapshot.json");
const originalFoldForgeSnapshot = await readFile(foldForgeSnapshotPath, "utf8");
const originalSovereignStandardSnapshot = await readFile(sovereignStandardSnapshotPath, "utf8");

const first = await syncFoldForge(foldForge);
const firstBytes = await readFile(resolve(root, "sources/foldforge.snapshot.json"), "utf8");
const second = await syncFoldForge(foldForge);
const secondBytes = await readFile(resolve(root, "sources/foldforge.snapshot.json"), "utf8");
const materialFirst = await syncSovereignStandard(sovereignStandard);
const materialFirstBytes = await readFile(resolve(root, "sources/sovereign-standard.snapshot.json"), "utf8");
const materialSecond = await syncSovereignStandard(sovereignStandard);
const materialSecondBytes = await readFile(resolve(root, "sources/sovereign-standard.snapshot.json"), "utf8");
await sealPublicWitnesses();
const validated = await validateSources();

assert.equal(first.witness, second.witness, "Unchanged evidence must produce an unchanged witness.");
assert.equal(firstBytes, secondBytes, "Source synchronization must be deterministic.");
assert.equal(materialFirst.witness, materialSecond.witness, "Unchanged material evidence must preserve its witness.");
assert.equal(materialFirstBytes, materialSecondBytes, "Material witness synchronization must be deterministic.");
assert.equal(first.status, "witnessed");
assert.equal(first.compositions.length, 4);
assert.equal(first.language_composition.terms.length, 12);
assert.equal(
  new Set(first.language_composition.terms.map(({ term }) => term)).size,
  12,
  "The living language composition must contain twelve distinct terms without freezing their identity."
);
assert.deepEqual(
  first.language_composition.terms.map(({ rank }) => rank),
  Array.from({ length: 12 }, (_, index) => index + 1),
  "The current terms must remain deterministically ranked."
);
assert.match(first.language_composition.witness, /^sha256:[a-f0-9]{64}$/);
assert.equal(validated.registry.sources.find(({ id }) => id === "foldforge").status, "active");
assert.equal(validated.registry.sources.find(({ id }) => id === "foldforge").public_url, "https://foldforge.xyz");
assert.equal(validated.registry.sources.find(({ id }) => id === "x").public_url, "https://x.com/rootlogos");
assert.equal(validated.registry.sources.find(({ id }) => id === "telos").public_url, "https://sovereignstandard.co/guides/ritual-seekers-shizuoka-fukamushi-sencha-v1.html");
assert.equal(validated.registry.sources.find(({ id }) => id === "sovereign-standard").public_url, "https://sovereignstandard.co");
assert.equal(validated.registry.sources.find(({ id }) => id === "foldportrait").public_url, "https://zeropoet.github.io/FoldPortrait/");
const telosWitness = validated.publicWitnesses.find(({ source_id }) => source_id === "telos");
assert.equal(telosWitness.work_relations.length, 0);
assert.equal(telosWitness.public_state.product, "Sovereign Standard customer acquisition");
assert.equal(telosWitness.public_state.current_version, "0.5.0");
assert.equal(telosWitness.public_state.deployed_release_version, "0.5.0");
assert.equal(telosWitness.public_state.deployed_decision, "OPERATING");
assert.equal(telosWitness.public_state.maximum_active_campaigns, 1);
assert.equal(validated.publicWitnesses.length, 2);
assert.equal(telosWitness.public_state.root_logos_has_customer_data, false);
assert.equal(telosWitness.public_state.root_logos_has_publication_authority, false);
assert.equal(validated.publicWitnesses.find(({ source_id }) => source_id === "sovereign-standard").public_state.published_vessel_records, 136);
assert.equal(validated.sovereignStandardSnapshot.measures.witness_works, 53);
assert.equal(validated.sovereignStandardSnapshot.measures.vessel_work_relations, 13);
assert.equal(validated.sovereignStandardSnapshot.works.some(({ artifact_id }) => artifact_id === "witness-genesis-test"), false);
assert.equal(validated.sovereignStandardSnapshot.authority.root_logos_has_custody, false);
assert.equal(validated.sovereignStandardSnapshot.authority.root_logos_has_minting_authority, false);
assert.equal(validated.foldPortraitSnapshot.measures.renders, 52);
assert.equal(validated.foldPortraitSnapshot.measures.material_matches, 52);
assert.equal(validated.foldPortraitSnapshot.measures.embodied_renders, 12);
assert.ok(validated.foldPortraitSnapshot.renders.every(({ material_witness }) => material_witness.file_sha256));
assert.ok(validated.publicWitnesses.every(({ witness }) => /^sha256:[a-f0-9]{64}$/.test(witness)));
assert.match(first.compositions[0].witness, /^[a-f0-9]{64}$/);

await writeFile(foldForgeSnapshotPath, originalFoldForgeSnapshot);
await writeFile(sovereignStandardSnapshotPath, originalSovereignStandardSnapshot);

console.log("Source integration tests passed.");
