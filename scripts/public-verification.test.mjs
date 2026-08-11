import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [index, renderer, styles, registry] = await Promise.all([
  read("index.html"),
  read("script.js"),
  read("styles.css"),
  read("sources/registry.json").then(JSON.parse)
]);
const graph = JSON.parse(await read("content/constitutional-graph.json"));
const exports = JSON.parse(await read("content/export-packets.json"));

assert.ok(index.indexOf('id="coordinate"') < index.indexOf('id="verify"'));
assert.ok(index.indexOf('id="verify"') < index.indexOf('id="works"'));
for (const id of [
  "verification-source-list", "verify-source-witness", "propagation-events",
  "run-public-verification", "observatory-canvas", "memory-ledger", "proposal-stack"
]) assert.match(index, new RegExp(`id="${id}"`), `${id} is not exposed on the public surface.`);

assert.doesNotMatch(index, /github\.com\/zeropoet\/root-logos\/blob\/main\/PARTICIPATION\.md/);
assert.match(renderer, /const renderVerification/);
assert.match(renderer, /const propagationEvents/);
assert.match(renderer, /const publicIntegrityChecks/);
assert.match(renderer, /publishedSourceRecords/);
assert.match(styles, /\.verification-ledger-layout/);
assert.match(styles, /\.propagation-column-head/);
assert.equal(graph.meta.interfaceVersion, "1.4.3");
assert.ok(graph.nodes.some(({ id }) => id === "public-verification-observatory"));
assert.ok(graph.edges.some(({ from, to }) => from === "root-logos" && to === "public-verification-observatory"));
assert.equal(exports.at(-1).export_id, "RL-EXPORT-0013");
assert.equal(exports.at(-1).revision_entry.version, "1.4.3");
assert.match(styles, /h1, h2, h3, h4,[\s\S]*?text-transform:\s*uppercase;/);
assert.doesNotMatch(index, /Latest autonomous inquiry|id="latest-cycle"|id="cycle-drawer"/);
assert.match(index, /Read the constitution <em>as a relation\.<\/em>/);
assert.match(index, /Read each work as a field\./);
assert.match(index, /See what Root Logos is reading—and what it returns\./);
assert.match(index, /Offer something to the field\./);
assert.match(index, /data-module="04\.01">Witnessed Relations/);
assert.match(index, /data-module="04\.02">Design Flow Ledger/);
for (const [id, order] of [["field", 1], ["coordinate", 2], ["verify", 3], ["works", 4], ["state", 5], ["intake", 6]]) {
  assert.match(styles, new RegExp(`body\\.archive-open #${id} \\{ order: ${order}; \\}`), `${id} does not preserve the public encounter order.`);
}

for (const source of registry.sources) {
  assert.match(renderer, new RegExp(`${source.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${source.id} has no public verification mapping.`);
}

console.log("PASS public input inspection, propagation lineage, in-browser integrity checks, relational observatory, semantic memory, and adversarial review are published without requiring repository navigation.");
