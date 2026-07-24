import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { syncFoldForge, validateSources } from "./sources.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const foldForge = resolve(root, "../FoldForge");

const first = await syncFoldForge(foldForge);
const firstBytes = await readFile(resolve(root, "sources/foldforge.snapshot.json"), "utf8");
const second = await syncFoldForge(foldForge);
const secondBytes = await readFile(resolve(root, "sources/foldforge.snapshot.json"), "utf8");
const validated = await validateSources();

assert.equal(first.witness, second.witness, "Unchanged evidence must produce an unchanged witness.");
assert.equal(firstBytes, secondBytes, "Source synchronization must be deterministic.");
assert.equal(first.status, "witnessed");
assert.equal(first.compositions.length, 3);
assert.equal(validated.registry.sources.find(({ id }) => id === "foldforge").status, "active");
assert.match(first.compositions[0].witness, /^[a-f0-9]{64}$/);

console.log("Source integration tests passed.");
