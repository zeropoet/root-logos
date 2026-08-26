import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  foldForgeMeaningWitness,
  sealPublicWitnesses,
  syncFoldForge,
  syncSovereignStandard,
  validateSources
} from "./sources.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const foldForge = resolve(root, "../FoldForge");
const sovereignStandard = resolve(root, "../sovereign-standard/root-logos-witness-export.json");
const foldForgeSnapshotPath = resolve(root, "sources/foldforge.snapshot.json");
const sovereignStandardSnapshotPath = resolve(root, "sources/sovereign-standard.snapshot.json");
const originalFoldForgeSnapshot = await readFile(foldForgeSnapshotPath, "utf8");
const originalSovereignStandardSnapshot = await readFile(sovereignStandardSnapshotPath, "utf8");
const publicIndex = await readFile(resolve(root, "index.html"), "utf8");
const livingObjectPage = await readFile(resolve(root, "living-object.html"), "utf8");

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
assert.equal(first.compositions.length, 5);
assert.equal(
  first.compositions.some(({ id }) => id === "FF-COMP-0006"),
  false,
  "A proposed FoldForge grammar must not enter the living source snapshot."
);
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
assert.equal(first.language_composition.semantic_witness, foldForgeMeaningWitness(first.language_composition));
assert.match(first.composition_witness, /^sha256:[a-f0-9]{64}$/);
const archiveOnlyVariation = {
  ...first.language_composition,
  archive: {
    ...first.language_composition.archive,
    source_works: first.language_composition.archive.source_works + 6,
    state_witness: `sha256:${"f".repeat(64)}`
  }
};
assert.equal(
  foldForgeMeaningWitness(archiveOnlyVariation),
  first.language_composition.semantic_witness,
  "Archive-only provider variation must not change the lexical meaning witness."
);
assert.equal(validated.registry.sources.find(({ id }) => id === "foldforge").status, "active");
assert.equal(validated.registry.sources.find(({ id }) => id === "foldforge").public_url, "https://foldforge.xyz");
assert.equal(validated.registry.sources.find(({ id }) => id === "x").public_url, "https://x.com/rootlogos");
assert.equal(validated.registry.sources.find(({ id }) => id === "telos").public_url, "https://sovereignstandard.co/guides/design-object-collectors-numbered-vessel-collection-v1.html");
assert.equal(validated.registry.sources.find(({ id }) => id === "sovereign-standard").public_url, "https://sovereignstandard.co");
assert.match(publicIndex, /class="footer-tea" href="https:\/\/sovereignstandard\.co"/);
assert.doesNotMatch(publicIndex, /class="footer-tea" href="https:\/\/sovereignstandard\.co\/purchase\.html/);
assert.match(publicIndex, /<body class="archive-open">/);
assert.ok(
  publicIndex.indexOf('id="field"') < publicIndex.indexOf('id="works"'),
  "Every homepage viewport must begin with the Constitutional Field."
);
assert.doesNotMatch(publicIndex, /id="living-object-canvas"/);
assert.doesNotMatch(publicIndex, /src="living-object\.js/);
assert.match(publicIndex, /class="footer-object-link" href="living-object\.html"/);
assert.match(livingObjectPage, /data-living-object-standalone/);
assert.match(livingObjectPage, /id="living-object-canvas"/);
assert.match(livingObjectPage, /src="living-object\.js/);
assert.match(livingObjectPage, /href="index\.html#field">Return to the field/);
assert.equal(validated.registry.sources.find(({ id }) => id === "foldportrait").public_url, "https://zeropoet.github.io/FoldPortrait/");
const telosWitness = validated.publicWitnesses.find(({ source_id }) => source_id === "telos");
assert.equal(telosWitness.work_relations.length, 0);
assert.equal(telosWitness.public_state.product, "Sovereign Standard customer acquisition");
assert.equal(telosWitness.public_state.current_version, "0.9.1");
assert.equal(telosWitness.public_state.source_successor_version, "0.9.1");
assert.equal(telosWitness.public_state.deployed_release_version, "0.9.1");
assert.equal(telosWitness.public_state.deployed_decision, "OPERATING");
assert.equal(telosWitness.public_state.maximum_active_campaigns, 1);
assert.equal(validated.publicWitnesses.length, 2);
assert.equal(telosWitness.public_state.root_logos_has_customer_data, false);
assert.equal(telosWitness.public_state.root_logos_has_publication_authority, false);
assert.equal(telosWitness.change_propagation_policy.status, "required");
assert.equal(telosWitness.change_propagation_policy.target_states.length, 4);
assert.ok(telosWitness.change_propagation_policy.requires.some((item) => item.includes("README")));
assert.deepEqual(telosWitness.system_mapping.success_ladder.map(({ target }) => target), [200, 600]);
assert.ok(telosWitness.system_mapping.success_ladder.every(({ metric }) => metric === "active_annual_collectors"));
assert.equal(telosWitness.system_mapping.repositories.length, 5);
assert.equal(telosWitness.system_mapping.operating_components.length, 8);
assert.ok(telosWitness.system_mapping.operating_components.some(({ id }) => id === "ledger-witness"));
assert.ok(telosWitness.system_mapping.operating_components.some(({ id }) => id === "xaman"));
assert.equal(telosWitness.system_mapping.measurement.current_value, null);
assert.equal(telosWitness.system_mapping.measurement.personal_data_available, false);
assert.equal(telosWitness.system_mapping.cultivation_authority, "inquiry and constitutional relation only");
assert.equal(telosWitness.system_mapping.source_commit, "860d81244182b0031dfd786acc21562ed5735f69");
assert.ok(telosWitness.system_mapping.relations.includes("FoldPortrait canonical catalog -> exclusively admits -> Ledger Witness works"));
assert.equal(validated.publicWitnesses.find(({ source_id }) => source_id === "sovereign-standard").public_state.published_vessel_records, 136);
assert.equal(validated.sovereignStandardSnapshot.measures.witness_works, 56);
assert.equal(validated.sovereignStandardSnapshot.measures.vessel_work_relations, 16);
assert.equal(validated.sovereignStandardSnapshot.works.some(({ artifact_id }) => artifact_id === "witness-genesis-test"), false);
assert.equal(validated.sovereignStandardSnapshot.authority.root_logos_has_custody, false);
assert.equal(validated.sovereignStandardSnapshot.authority.root_logos_has_minting_authority, false);
assert.equal(validated.foldPortraitSnapshot.measures.renders, 52);
assert.equal(validated.foldPortraitSnapshot.measures.material_matches, 52);
assert.equal(validated.foldPortraitSnapshot.measures.embodied_renders, 15);
assert.equal(validated.foldPortraitSnapshot.schema, "root-logos-foldportrait-witness/v2");
assert.equal(validated.foldPortraitSnapshot.measures.reflection_cycles, validated.foldPortraitSnapshot.reflections.length);
assert.equal(validated.foldPortraitSnapshot.measures.reflection_pngs, validated.foldPortraitSnapshot.reflections.length);
assert.equal(validated.foldPortraitSnapshot.measures.prepared_unsigned_reflections, validated.foldPortraitSnapshot.reflections.length);
const currentReflection = validated.foldPortraitSnapshot.reflections.at(-1);
assert.equal(validated.foldPortraitSnapshot.measures.current_correlations, currentReflection.correlations.length);
assert.equal(validated.foldPortraitSnapshot.measures.current_rules, currentReflection.chosen_rules.length);
assert.equal(validated.foldPortraitSnapshot.current_reflection, currentReflection.cycle_id);
assert.ok(validated.foldPortraitSnapshot.reflections[0].correlations.every(({ left, right }) => left.split(".")[0] !== right.split(".")[0]));
assert.equal(validated.registry.sources.find(({ id }) => id === "foldportrait").surface, "tracked-reflection");
assert.ok(validated.foldPortraitSnapshot.renders.every(({ material_witness }) => material_witness.file_sha256));
assert.ok(validated.publicWitnesses.every(({ witness }) => /^sha256:[a-f0-9]{64}$/.test(witness)));
assert.match(first.compositions[0].witness, /^[a-f0-9]{64}$/);

await writeFile(foldForgeSnapshotPath, originalFoldForgeSnapshot);
await writeFile(sovereignStandardSnapshotPath, originalSovereignStandardSnapshot);

console.log("Source integration tests passed.");
