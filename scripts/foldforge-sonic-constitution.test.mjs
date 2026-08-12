import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const local = JSON.parse(await readFile(resolve(root, "resonance/foldforge-sonic-constitution-map.json"), "utf8"));
assert.equal(local.consumer.system, "FoldForge");
assert.equal(local.consumer.instrument, "sonic-forge/steel-voice/v1");
assert.equal(local.limits.expandsRootLogosAuthority, false);

try {
  const foldforge = JSON.parse(await readFile(resolve(root, "../FoldForge/public/root-logos-founding-constitution-sonic-map.json"), "utf8"));
  assert.equal(local.schema, foldforge.schema);
  assert.deepEqual(local.source, foldforge.source);
  assert.deepEqual(local.mapping, foldforge.mapping);
  assert.deepEqual(local.limits, foldforge.limits);
  console.log("Root Logos and FoldForge share one witnessed Founding Constitution atmosphere map.");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  console.log("Root Logos preserves the bounded map; no active FoldForge counterpart is present.");
}
