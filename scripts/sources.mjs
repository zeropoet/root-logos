import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const registryPath = resolve(root, "sources/registry.json");
const snapshotPath = resolve(root, "sources/foldforge.snapshot.json");
const sovereignStandardSnapshotPath = resolve(root, "sources/sovereign-standard.snapshot.json");
const foldPortraitSnapshotPath = resolve(root, "sources/foldportrait.snapshot.json");
const worksIndexPath = resolve(root, "works/index.json");
const publicWitnessPaths = [
  resolve(root, "sources/telos.public-witness.json"),
  resolve(root, "sources/sovereign-standard.public-witness.json")
];

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};

const digest = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const loadJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const loadEvidence = async (location) => {
  if (/^https:\/\//.test(location)) {
    const response = await fetch(location, { headers: { accept: "application/json" } });
    assert(response.ok, `${location} returned ${response.status}.`);
    return response.json();
  }
  return loadJson(resolve(location));
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const witnessedPayload = ({ witness, ...payload }) => payload;
const sealPublicWitness = (witness) => ({ ...witnessedPayload(witness), witness: `sha256:${digest(witnessedPayload(witness))}` });
const validateMaterialWitness = (snapshot) => {
  assert(snapshot.schema === "root-logos-material-witness-export/v1", "Unsupported material witness schema.");
  assert(snapshot.source_id === "sovereign-standard", "Material witness source must be Sovereign Standard.");
  assert(snapshot.witness === `sha256:${digest(witnessedPayload(snapshot))}`, "Sovereign Standard material witness digest is invalid.");
  assert(snapshot.measures?.witness_works === snapshot.works?.length, "Material witness work count is inconsistent.");
  assert(snapshot.measures?.vessel_work_relations === snapshot.works.reduce((sum, work) => sum + work.vessels.length, 0), "Material witness relation count is inconsistent.");
  assert(snapshot.authority?.root_logos_has_custody === false, "Root Logos may not receive custody through a material witness.");
  assert(snapshot.authority?.root_logos_has_minting_authority === false, "Root Logos may not receive minting authority.");
  for (const work of snapshot.works) {
    assert(work.artifact_id && work.title && /^[a-f0-9]{64}$/.test(work.file_sha256), "Material witness work lacks stable identity or hash.");
    assert(["prepared", "minted"].includes(work.mint_status), `${work.artifact_id} has an invalid mint status.`);
    assert(work.archive_status === "archived", `${work.artifact_id} is not archived.`);
    for (const vessel of work.vessels) {
      assert(/^\d{3}$/.test(vessel.vessel_number), `${work.artifact_id} has an invalid vessel number.`);
      assert(/^https:\/\/sovereignstandard\.co\//.test(vessel.public_url), `${work.artifact_id} has an invalid vessel URL.`);
    }
  }
  const serialized = JSON.stringify(snapshot).toLowerCase();
  for (const prohibited of ["holder_hash", "claimed_at", "customer", "collector", "payment", "private_receipt", "signing_key"]) {
    assert(!serialized.includes(`"${prohibited}"`), `Material witness contains prohibited field ${prohibited}.`);
  }
  return snapshot;
};
const validateFoldPortraitWitness = (snapshot, material) => {
  assert(snapshot.schema === "root-logos-foldportrait-witness/v1", "Unsupported FoldPortrait witness schema.");
  assert(snapshot.source_id === "foldportrait" && snapshot.status === "witnessed", "FoldPortrait witness is not active.");
  assert(snapshot.witness === `sha256:${digest(witnessedPayload(snapshot))}`, "FoldPortrait witness digest is invalid.");
  assert(snapshot.measures?.renders === snapshot.renders?.length, "FoldPortrait render count is inconsistent.");
  assert(snapshot.measures?.material_matches === snapshot.renders.length, "Every FoldPortrait render must resolve to material evidence.");
  const materialWorks = new Map(material.works.map((work) => [work.artifact_id, work]));
  for (const render of snapshot.renders) {
    const work = materialWorks.get(render.artifact_id);
    assert(work, `${render.artifact_id} lacks a material witness.`);
    assert(render.material_witness?.file_sha256 === work.file_sha256, `${render.artifact_id} material hash diverged.`);
    assert(render.material_witness?.manifest_url === work.manifest_url, `${render.artifact_id} manifest relation diverged.`);
    assert(render.material_witness?.vessels.length === work.vessels.length, `${render.artifact_id} vessel relation diverged.`);
    assert(/^[a-f0-9]{64}$/.test(render.render_hash), `${render.artifact_id} lacks a render hash.`);
    assert(/^[a-f0-9]{64}$/.test(render.convergence_hash), `${render.artifact_id} lacks a convergence hash.`);
    assert(/^https:\/\/zeropoet\.github\.io\/FoldPortrait\//.test(render.svg_url), `${render.artifact_id} has an invalid render URL.`);
  }
  return snapshot;
};

const validateRegistry = (registry) => {
  assert(registry.schema === "root-logos-source-registry/v1", "Unsupported source registry schema.");
  assert(Array.isArray(registry.sources) && registry.sources.length > 0, "The source registry must contain sources.");
  assert(new Set(registry.sources.map(({ id }) => id)).size === registry.sources.length, "Source ids must be unique.");
  for (const source of registry.sources) {
    assert(source.id && source.name && source.role, `Source ${source.id || "unknown"} is incomplete.`);
    assert(source.boundary, `Source ${source.id} requires an explicit boundary.`);
    assert(["active", "registered", "paused"].includes(source.status), `Source ${source.id} has an invalid status.`);
    if (source.public_url) assert(/^https:\/\//.test(source.public_url), `Source ${source.id} requires an HTTPS public URL.`);
    if (source.visibility === "private") {
      assert(source.reads.length === 0, `Private source ${source.id} may not expose implicit read paths.`);
      assert(source.public_url === null, `Private source ${source.id} may not expose a public destination.`);
    }
  }
  return registry;
};

const validateFoldForgeLanguageComposition = (composition) => {
  assert(composition.schema === "foldforge-language-composition-export/v1", "Unsupported FoldForge language composition schema.");
  assert(composition.source_id === "foldforge", "Language composition source must be FoldForge.");
  assert(composition.grammar?.id === "FF-COMP-0002", "Language composition must use FoldForge Lexical Field.");
  assert(composition.terms?.length === 12, "FoldForge language composition requires exactly twelve ranked terms.");
  assert(composition.witness === `sha256:${digest(witnessedPayload(composition))}`, "FoldForge language composition witness is invalid.");
  composition.terms.forEach((term, index) => {
    assert(term.rank === index + 1, "FoldForge language composition ranks must be sequential.");
    assert(/^[\p{L}\p{N}][\p{L}\p{N}'’\-]*$/u.test(term.term), `Invalid FoldForge lexical term ${term.term}.`);
    assert(Number.isInteger(term.works) && term.works > 0, `${term.term} lacks a positive work count.`);
    assert(Number.isInteger(term.traces) && term.traces >= term.works, `${term.term} has inconsistent trace evidence.`);
  });
  return composition;
};

const deriveFoldForge = async (foldForgeRoot, languageCompositionSource) => {
  const constitutionPath = resolve(foldForgeRoot, "constitution/foldforge-constitution.json");
  const grammarRoot = resolve(foldForgeRoot, "grammar");
  const constitution = await loadJson(constitutionPath);
  const languageComposition = validateFoldForgeLanguageComposition(await loadEvidence(
    languageCompositionSource || resolve(foldForgeRoot, "public/root-logos-language-composition.json")
  ));
  const grammarFiles = (await readdir(grammarRoot))
    .filter((name) => /^composition-\d+-.+\.json$/.test(name))
    .sort();
  const grammars = await Promise.all(grammarFiles.map((name) => loadJson(resolve(grammarRoot, name))));

  assert(constitution.schema === "foldforge-constitution/v1", "Unsupported FoldForge constitution schema.");
  assert(grammars.length > 0, "FoldForge exposed no composition grammars.");
  for (const grammar of grammars) {
    assert(grammar.id && grammar.version && grammar.title, "A FoldForge grammar is missing identity.");
    assert(grammar.authority?.claims && grammar.authority?.doesNotClaim, `${grammar.id} lacks an authority boundary.`);
  }

  const evidence = { constitution, grammars, languageComposition };
  const compositions = grammars.map((grammar) => ({
    id: grammar.id,
    title: grammar.title,
    version: grammar.version,
    status: grammar.status,
    discovery: grammar.discovery?.statement,
    operations: grammar.transformations.map(({ operation }) => operation),
    claim: grammar.authority.claims,
    limit: grammar.authority.doesNotClaim,
    witness: digest(grammar)
  }));
  const relationSet = new Set();
  for (const grammar of grammars) {
    for (const transformation of grammar.transformations) {
      relationSet.add(`${transformation.input} → ${transformation.operation} → ${transformation.output}`);
    }
  }

  return {
    schema: "root-logos-source-snapshot/v1",
    source_id: "foldforge",
    status: "witnessed",
    source_revision: constitution.revision,
    witness: `sha256:${digest(evidence)}`,
    identity: {
      name: constitution.identity.name,
      definition: constitution.identity.definition,
      maxim: constitution.identity.maxim,
      higher_reference: constitution.higherReference.name,
      higher_reference_boundary: constitution.higherReference.boundary
    },
    primitives: constitution.primitives,
    movement: constitution.movement,
    compositions,
    language_composition: languageComposition,
    relations: [...relationSet],
    questions: [
      "Which relations found in one evidence domain remain valid when tested against another?",
      "What changes in Root Logos when composition is treated as a method of knowing rather than a final representation?",
      "Can one coherent account preserve source difference while revealing structures no source contains alone?"
    ]
  };
};

export const validateSources = async () => {
  const registry = validateRegistry(await loadJson(registryPath));
  const snapshot = await loadJson(snapshotPath);
  const sovereignStandardSnapshot = validateMaterialWitness(await loadJson(sovereignStandardSnapshotPath));
  const foldPortraitSnapshot = validateFoldPortraitWitness(
    await loadJson(foldPortraitSnapshotPath),
    sovereignStandardSnapshot
  );
  const worksIndex = await loadJson(worksIndexPath);
  const publicWitnesses = await Promise.all(publicWitnessPaths.map(loadJson));
  assert(snapshot.schema === "root-logos-source-snapshot/v1", "Unsupported source snapshot schema.");
  if (snapshot.status === "witnessed") {
    assert(snapshot.witness?.startsWith("sha256:"), "Witnessed source requires a SHA-256 witness.");
    assert(snapshot.compositions.length > 0, "Witnessed FoldForge source requires compositions.");
    validateFoldForgeLanguageComposition(snapshot.language_composition);
  }
  for (const witness of publicWitnesses) {
    assert(witness.schema === "root-logos-public-source-witness/v1", `Unsupported ${witness.source_id} public witness schema.`);
    assert(witness.status === "witnessed", `${witness.source_id} public witness is not active.`);
    assert(witness.identity?.definition && witness.identity?.role_in_coherent_field, `${witness.source_id} public witness lacks identity context.`);
    assert(Array.isArray(witness.exclusions) && witness.exclusions.length > 0, `${witness.source_id} public witness lacks exclusions.`);
    for (const relation of witness.work_relations || []) {
      assert(relation.id && relation.work_id && relation.edition_id && relation.relation && relation.statement && relation.boundary, `${witness.source_id} has an incomplete work relation.`);
      const work = worksIndex.works.find(({ work_id }) => work_id === relation.work_id);
      assert(work, `${witness.source_id} references an unknown work ${relation.work_id}.`);
      assert(work.edition_history?.some(({ edition_id }) => edition_id === relation.edition_id), `${witness.source_id} references an unknown edition ${relation.edition_id}.`);
    }
    assert(witness.witness === `sha256:${digest(witnessedPayload(witness))}`, `${witness.source_id} public witness digest is invalid.`);
  }
  return { registry, snapshot, publicWitnesses, sovereignStandardSnapshot, foldPortraitSnapshot };
};

export const syncFoldForge = async (
  foldForgeRoot = process.env.FOLDFORGE_PATH || resolve(root, "../FoldForge"),
  languageCompositionSource = process.env.FOLDFORGE_LANGUAGE_SOURCE
) => {
  const snapshot = await deriveFoldForge(resolve(foldForgeRoot), languageCompositionSource);
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
};

export const syncSovereignStandard = async (
  source = process.env.SOVEREIGN_STANDARD_WITNESS_SOURCE
    || resolve(root, "../sovereign-standard/root-logos-witness-export.json")
) => {
  const snapshot = validateMaterialWitness(await loadEvidence(source));
  await writeFile(sovereignStandardSnapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
};

export const refreshMaterialLineage = async (
  source = process.env.SOVEREIGN_STANDARD_WITNESS_SOURCE
    || "https://raw.githubusercontent.com/zeropoet/sovereign-standard-site/main/root-logos-witness-export.json"
) => {
  const priorMaterial = await loadJson(sovereignStandardSnapshotPath);
  const priorPortrait = await loadJson(foldPortraitSnapshotPath);
  const material = validateMaterialWitness(await loadEvidence(source));
  const materialWorks = new Map(material.works.map((work) => [work.artifact_id, work]));
  const renders = priorPortrait.renders.map((render) => {
    const work = materialWorks.get(render.artifact_id);
    assert(work, `${render.artifact_id} disappeared from the Sovereign Standard material lineage.`);
    assert(work.file_sha256 === render.material_witness.file_sha256, `${render.artifact_id} archived render bytes changed.`);
    return {
      ...render,
      material_witness: {
        file_sha256: work.file_sha256,
        manifest_url: work.manifest_url,
        mint_status: work.mint_status,
        vessels: work.vessels.map(({ vessel_number, public_url, state, convergence_hash }) => ({
          vessel_number, public_url, state, convergence_hash
        }))
      }
    };
  });
  const portraitPayload = {
    ...witnessedPayload(priorPortrait),
    material_source_witness: material.witness,
    measures: {
      renders: renders.length,
      material_matches: renders.length,
      embodied_renders: renders.filter(({ material_witness }) => material_witness.vessels.length).length,
      prepared_renders: renders.filter(({ material_witness }) => !material_witness.vessels.length).length
    },
    renders
  };
  const portrait = {
    ...portraitPayload,
    witness: `sha256:${digest(portraitPayload)}`
  };
  validateFoldPortraitWitness(portrait, material);
  if (priorMaterial.witness !== material.witness) {
    await writeFile(sovereignStandardSnapshotPath, `${JSON.stringify(material, null, 2)}\n`);
  }
  if (priorPortrait.witness !== portrait.witness) {
    await writeFile(foldPortraitSnapshotPath, `${JSON.stringify(portrait, null, 2)}\n`);
  }
  return {
    changed: priorMaterial.witness !== material.witness || priorPortrait.witness !== portrait.witness,
    material,
    portrait
  };
};

export const sealPublicWitnesses = async () => {
  const sealed = [];
  for (const path of publicWitnessPaths) {
    const witness = sealPublicWitness(await loadJson(path));
    await writeFile(path, `${JSON.stringify(witness, null, 2)}\n`);
    sealed.push(witness);
  }
  return sealed;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] || "validate";
  if (command === "sync") {
    const snapshot = await syncFoldForge(process.argv[3], process.argv[4]);
    console.log(`Witnessed ${snapshot.compositions.length} FoldForge compositions at ${snapshot.witness}.`);
  } else if (command === "sync-sovereign-standard") {
    const snapshot = await syncSovereignStandard(process.argv[3]);
    console.log(`Witnessed ${snapshot.works.length} Sovereign Standard works at ${snapshot.witness}.`);
  } else if (command === "refresh-material-lineage") {
    const result = await refreshMaterialLineage(process.argv[3]);
    console.log(`${result.changed ? "Updated" : "Confirmed"} ${result.material.works.length} Sovereign Standard works and ${result.portrait.renders.length} FoldPortrait render relations.`);
  } else if (command === "validate") {
    const { registry, snapshot, publicWitnesses } = await validateSources();
    console.log(`Validated ${registry.sources.length} sources; FoldForge is ${snapshot.status}; ${publicWitnesses.length} public witnesses are sealed.`);
  } else if (command === "seal-public") {
    const witnesses = await sealPublicWitnesses();
    console.log(`Sealed ${witnesses.length} public source witnesses.`);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}
