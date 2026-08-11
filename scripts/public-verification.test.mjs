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
assert.equal(graph.meta.interfaceVersion, "1.4.4");
assert.ok(graph.nodes.some(({ id }) => id === "public-verification-observatory"));
assert.ok(graph.edges.some(({ from, to }) => from === "root-logos" && to === "public-verification-observatory"));
assert.equal(exports.at(-1).export_id, "RL-EXPORT-0014");
assert.equal(exports.at(-1).revision_entry.version, "1.4.4");
assert.match(styles, /h1, h2, h3, h4,[\s\S]*?text-transform:\s*uppercase;/);
assert.doesNotMatch(index, /Latest autonomous inquiry|id="latest-cycle"|id="cycle-drawer"/);
assert.match(index, /A constitution <em>held in relation\.<\/em>/);
assert.match(index, /Many works, one field\./);
assert.match(index, /What Root Logos reads; what it returns\./);
assert.match(index, /The conversation remains open\./);
assert.ok(index.indexOf('class="library-guide"') < index.indexOf('class="library-shell"'), "03.00 must stand outside and above the Living Library instrument.");
assert.match(renderer, /card\.addEventListener\("pointerenter", select\)/);
assert.match(renderer, /card\.addEventListener\("click", select\)/);
assert.match(renderer, /card\.setAttribute\("aria-pressed", String\(selected\)\)/);
assert.match(styles, /one object, one typographic axis/i);
assert.match(styles, /body\.archive-open \.field-header h1 em,[\s\S]*?margin-left:0;/);
assert.match(index, /data-module="04\.01">Witnessed Relations/);
assert.match(index, /data-module="04\.02">Design Flow Ledger/);
for (const [id, order] of [["field", 1], ["coordinate", 2], ["verify", 3], ["works", 4], ["state", 5], ["intake", 6]]) {
  assert.match(styles, new RegExp(`body\\.archive-open #${id} \\{ order: ${order}; \\}`), `${id} does not preserve the public encounter order.`);
}

for (const source of registry.sources) {
  assert.match(renderer, new RegExp(`${source.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${source.id} has no public verification mapping.`);
}

console.log("PASS public input inspection, propagation lineage, in-browser integrity checks, relational observatory, semantic memory, and adversarial review are published without requiring repository navigation.");
