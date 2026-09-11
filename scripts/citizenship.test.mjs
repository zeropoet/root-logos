import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const readJson = async (path) => JSON.parse(await read(path));

const [graph, identity, protocol, cultivation, index, renderer, participation, principle, readme] = await Promise.all([
  readJson("content/constitutional-graph.json"),
  readJson("self-authorship/current.json"),
  readJson("content/citizenship.json"),
  readJson("cultivation/policy.json"),
  read("index.html"),
  read("weave.js"),
  read("PARTICIPATION.md"),
  read("content/principle-constitutional-citizenship.md"),
  read("README.md")
]);

assert.equal(graph.meta.revision, "v1.4");
assert.equal(graph.meta.revisionLabel, "The Living Coordinate");
assert.equal(identity.revision, "v1.4");
assert.equal(identity.supersedes, "v1.3");
assert.match(identity.signature, /^identity-inflection:living-coordinate:[a-f0-9]{12}$/);
assert.equal(protocol.revision, "v1.4");
assert.equal(protocol.authority.arrival_is_evidence, false);
assert.equal(protocol.authority.arrival_grants_governance, false);
assert.equal(protocol.authority.participant_type_changes_epistemic_weight, false);
assert.deepEqual(protocol.participants, ["human", "machine", "human-machine collaboration", "undeclared"]);

for (const [id, type] of [
  ["principle-constitutional-citizenship", "architectural-principle"],
  ["living-coordinate", "export-system"],
  ["revision-1.4", "revision"]
]) {
  assert.ok(graph.nodes.some((node) => node.id === id && node.type === type), `${id} is absent from the canonical graph.`);
}
for (const [from, to, type] of [
  ["root-logos", "living-coordinate", "inhabits publicly as"],
  ["living-coordinate", "journal-membrane", "welcomes bounded arrival through"],
  ["principle-constitutional-citizenship", "participation", "defines belonging through"],
  ["revision-1.4", "revision-1.3", "supersedes"]
]) {
  assert.ok(graph.edges.some((edge) => edge.from === from && edge.to === to && edge.type === type), `${from} -> ${to} is absent.`);
}

assert.equal(cultivation.constitutional_revision, "v1.4");
assert.ok(cultivation.lenses.some(({ id }) => id === "constitutional-citizenship-pressure"));
assert.match(index, /id="writing-stream"/);
assert.match(index, /href="agent\.json"/);
assert.match(index, /https:\/\/folio\.rootlogos\.com/);
assert.doesNotMatch(index, /Human and machine participants may bring questions and evidence through the same declared entrance/);
assert.match(renderer, /writing\/objects\/index\.json/);
assert.match(renderer, /aria-expanded/);
assert.match(participation, /constitutional citizenship, not legal citizenship/i);
assert.match(principle, /Citizenship is therefore enacted rather than owned/);
assert.match(readme, /Revision 1\.4 — The Living Coordinate/);

console.log("Root Logos preserves constitutional citizenship while its lean public stream delegates machine entry and archival reading.");
