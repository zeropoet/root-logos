import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
const [module, archive, registry, graph] = await Promise.all([
  readJson("content/design-flow-ledger.json"),
  readJson("content/attractor-packets.json"),
  readJson("sources/registry.json"),
  readJson("content/constitutional-graph.json")
]);

assert.equal(module.schema, "root-logos-design-flow-ledger/v1");
assert.equal(module.module_id, "design-flow-ledger");
assert.equal(module.status, "active");
assert.deepEqual(module.flow.map(({ sequence }) => sequence), [1, 2, 3, 4, 5]);
assert.deepEqual(module.flow.map(({ id }) => id), ["orient", "relate", "form", "witness", "return"]);

const mappings = module.founding_fragments;
assert.equal(mappings.length, 24, "The design flow must map all 24 founding fragments.");
assert.equal(new Set(mappings.map(({ attractor_id }) => attractor_id)).size, 24, "Founding fragment mappings must be unique.");
assert.deepEqual(mappings.map(({ sequence }) => sequence), Array.from({ length: 24 }, (_, index) => index + 1));
assert.deepEqual(
  mappings.map(({ attractor_id }) => attractor_id),
  Array.from({ length: 24 }, (_, index) => `RL-ATTRACTOR-${String(index + 1).padStart(4, "0")}`)
);

const packetById = new Map(archive.packets.map((packet) => [packet.attractor_id, packet]));
for (const { attractor_id } of mappings) {
  const packet = packetById.get(attractor_id);
  assert.ok(packet, `${attractor_id} is missing from the Attractor archive.`);
  assert.ok(packet.node, `${attractor_id} lacks a canonical source node.`);
  assert.ok(packet.relations?.length, `${attractor_id} lacks supporting relations.`);
  assert.equal(packet.fragment?.length, 4, `${attractor_id} must preserve the four-part design movement.`);
  const publication = { ...(archive.defaults?.publication || {}), ...(packet.publication || {}) };
  if (publication.status === "published") {
    assert.match(publication.external_url, /^https:\/\/x\.com\/rootlogos\/status\/\d+$/);
  }
}

const x = registry.sources.find(({ id }) => id === module.x_witness_relation.source_id);
assert.ok(x, "The X witness source is absent from the registry.");
assert.equal(x.adapter, module.x_witness_relation.adapter);
assert.equal(x.status, "active");
assert.equal(module.tracking_contract.platform_metrics_are_design_authority, false);
assert.equal(module.tracking_contract.personal_data_collected, false);

assert.ok(graph.nodes.some(({ id, type }) => id === module.constitutional_node_id && type === "tracked-module"));
assert.ok(graph.nodes.some(({ id, type }) => id === "principle-relational-propagation" && type === "architectural-principle"));
assert.ok(graph.edges.some((edge) => edge.from === "principle-relational-propagation" && edge.to === "coherent-field"));
for (const [to, type] of [
  ["attractor-fragment", "tracks founding forms through"],
  ["channel-adapter", "maps X witness through"],
  ["return-path", "returns authority through"]
]) {
  assert.ok(graph.edges.some((edge) => edge.from === module.constitutional_node_id && edge.to === to && edge.type === type));
}

console.log("Root Logos design flow maps all 24 founding fragments through the bounded X witness relation.");
