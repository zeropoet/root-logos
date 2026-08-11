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
  "observatory-canvas", "memory-ledger", "proposal-stack"
]) assert.match(index, new RegExp(`id="${id}"`), `${id} is not exposed on the public surface.`);

assert.doesNotMatch(index, /github\.com\/zeropoet\/root-logos\/blob\/main\/PARTICIPATION\.md/);
assert.match(renderer, /const renderVerification/);
assert.match(renderer, /const propagationEvents/);
assert.doesNotMatch(index, /data-module="02\.03">Browser-verifiable integrity|id="run-public-verification"|id="public-verification-results"/);
assert.doesNotMatch(renderer, /const publicIntegrityChecks|const runPublicVerification/);
assert.match(renderer, /publishedSourceRecords/);
assert.match(styles, /\.verification-ledger-layout/);
assert.match(styles, /\.propagation-column-head/);
assert.equal(graph.meta.interfaceVersion, "1.4.7");
assert.ok(graph.nodes.some(({ id }) => id === "public-verification-observatory"));
assert.ok(graph.edges.some(({ from, to }) => from === "root-logos" && to === "public-verification-observatory"));
assert.equal(exports.at(-1).export_id, "RL-EXPORT-0017");
assert.equal(exports.at(-1).revision_entry.version, "1.4.7");
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
assert.match(index, /<nav class="primary-nav"[\s\S]*?<div class="system-presence"[\s\S]*?<\/nav>/);
assert.doesNotMatch(index, /id="header-detail"|id="archive-runtime"|id="archive-works"/);
assert.match(styles, /body\.archive-open \.library-shell \{[\s\S]*?inset:390px/);
assert.match(styles, /body\.archive-open \.observation-instrument \{[\s\S]*?width:min\(1500px,100%\)/);
assert.match(styles, /body\.archive-open \.observation-instrument > header \{[\s\S]*?padding-right:0;[\s\S]*?padding-left:0;/);
assert.match(styles, /\.observation-instrument > header h3 \{[^}]*overflow-wrap: normal;[^}]*word-break: normal;/);
assert.match(styles, /body\.archive-open \.observation-instrument > header > p:last-child \{[\s\S]*?padding-right:clamp/);
assert.match(styles, /body\.archive-open \.work-reading \{ padding:26px 0 42px 26px; \}/);
assert.match(index, /data-module="02\.03">Relational observatory/);
assert.match(index, /data-module="02\.04">Semantic memory/);
assert.match(index, /data-module="02\.05">Adversarial review/);
assert.match(index, /data-module="04\.01">Witnessed Relations/);
assert.match(index, /data-module="04\.02">Design Flow Ledger/);
for (const [id, order] of [["field", 1], ["coordinate", 2], ["verify", 3], ["works", 4], ["state", 5], ["intake", 6]]) {
  assert.match(styles, new RegExp(`body\\.archive-open #${id} \\{ order: ${order}; \\}`), `${id} does not preserve the public encounter order.`);
}

for (const source of registry.sources) {
  assert.match(renderer, new RegExp(`${source.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), `${source.id} has no public verification mapping.`);
}

console.log("PASS public input inspection, propagation lineage, relational observatory, semantic memory, and adversarial review are published without requiring repository navigation.");
