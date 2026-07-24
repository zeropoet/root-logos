import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sealPublicWitnesses, syncFoldForge, validateSources } from "./sources.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const foldForge = resolve(root, "../FoldForge");

const first = await syncFoldForge(foldForge);
const firstBytes = await readFile(resolve(root, "sources/foldforge.snapshot.json"), "utf8");
const second = await syncFoldForge(foldForge);
const secondBytes = await readFile(resolve(root, "sources/foldforge.snapshot.json"), "utf8");
await sealPublicWitnesses();
const validated = await validateSources();

assert.equal(first.witness, second.witness, "Unchanged evidence must produce an unchanged witness.");
assert.equal(firstBytes, secondBytes, "Source synchronization must be deterministic.");
assert.equal(first.status, "witnessed");
assert.equal(first.compositions.length, 3);
assert.equal(validated.registry.sources.find(({ id }) => id === "foldforge").status, "active");
assert.equal(validated.registry.sources.find(({ id }) => id === "foldforge").public_url, "https://foldforge.xyz");
assert.equal(validated.registry.sources.find(({ id }) => id === "x").public_url, "https://x.com/rootlogos");
assert.equal(validated.registry.sources.find(({ id }) => id === "telos").public_url, null);
assert.equal(validated.registry.sources.find(({ id }) => id === "sovereign-standard").public_url, "https://sovereignstandard.co");
assert.equal(validated.publicWitnesses.length, 2);
assert.equal(validated.publicWitnesses.find(({ source_id }) => source_id === "telos").public_state.live_execution_available, false);
assert.equal(validated.publicWitnesses.find(({ source_id }) => source_id === "telos").public_state.root_logos_has_custody, false);
assert.equal(validated.publicWitnesses.find(({ source_id }) => source_id === "sovereign-standard").public_state.published_vessel_records, 136);
assert.ok(validated.publicWitnesses.every(({ witness }) => /^sha256:[a-f0-9]{64}$/.test(witness)));
assert.match(first.compositions[0].witness, /^[a-f0-9]{64}$/);

console.log("Source integration tests passed.");
