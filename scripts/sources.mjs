import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const registryPath = resolve(root, "sources/registry.json");
const snapshotPath = resolve(root, "sources/foldforge.snapshot.json");

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};

const digest = (value) => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const loadJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const validateRegistry = (registry) => {
  assert(registry.schema === "root-logos-source-registry/v1", "Unsupported source registry schema.");
  assert(Array.isArray(registry.sources) && registry.sources.length > 0, "The source registry must contain sources.");
  assert(new Set(registry.sources.map(({ id }) => id)).size === registry.sources.length, "Source ids must be unique.");
  for (const source of registry.sources) {
    assert(source.id && source.name && source.role, `Source ${source.id || "unknown"} is incomplete.`);
    assert(source.boundary, `Source ${source.id} requires an explicit boundary.`);
    assert(["active", "registered", "paused"].includes(source.status), `Source ${source.id} has an invalid status.`);
    if (source.visibility === "private") {
      assert(source.reads.length === 0, `Private source ${source.id} may not expose implicit read paths.`);
    }
  }
  return registry;
};

const deriveFoldForge = async (foldForgeRoot) => {
  const constitutionPath = resolve(foldForgeRoot, "constitution/foldforge-constitution.json");
  const grammarRoot = resolve(foldForgeRoot, "grammar");
  const constitution = await loadJson(constitutionPath);
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

  const evidence = { constitution, grammars };
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
  assert(snapshot.schema === "root-logos-source-snapshot/v1", "Unsupported source snapshot schema.");
  if (snapshot.status === "witnessed") {
    assert(snapshot.witness?.startsWith("sha256:"), "Witnessed source requires a SHA-256 witness.");
    assert(snapshot.compositions.length > 0, "Witnessed FoldForge source requires compositions.");
  }
  return { registry, snapshot };
};

export const syncFoldForge = async (foldForgeRoot = process.env.FOLDFORGE_PATH || resolve(root, "../FoldForge")) => {
  const snapshot = await deriveFoldForge(resolve(foldForgeRoot));
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2] || "validate";
  if (command === "sync") {
    const snapshot = await syncFoldForge(process.argv[3]);
    console.log(`Witnessed ${snapshot.compositions.length} FoldForge compositions at ${snapshot.witness}.`);
  } else if (command === "validate") {
    const { registry, snapshot } = await validateSources();
    console.log(`Validated ${registry.sources.length} sources; FoldForge is ${snapshot.status}.`);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}
