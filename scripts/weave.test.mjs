import { readFile } from "node:fs/promises";

const constitution = JSON.parse(await readFile("weave/constitution.json", "utf8"));
const system = JSON.parse(await readFile("weave/system.json", "utf8"));
const telosWitness = JSON.parse(await readFile("sources/telos.public-witness.json", "utf8"));
const fieldNotation = JSON.parse(await readFile("weave/sources/field-notation.json", "utf8"));
const drift = JSON.parse(await readFile("weave/drift.json", "utf8"));
const agentEntry = JSON.parse(await readFile("agent.json", "utf8"));
const runtimeSource = await readFile("runtime/server.mjs", "utf8");
const runtimeUnit = await readFile("deploy/root-logos-runtime.service", "utf8");
const deployWorkflow = await readFile(".github/workflows/deploy-runtime.yml", "utf8");

if (constitution.schema !== "root-logos-weaving-constitution/v1") throw new Error("Unsupported Weaving constitution");
if (constitution.invariants.length !== 10) throw new Error("The Weaving constitution must expose ten founding invariants");
if (new Set(constitution.invariants.map(item => item.id)).size !== constitution.invariants.length) throw new Error("Duplicate constitutional invariant");
if (fieldNotation.sourceId !== constitution.source.id) throw new Error("Constitutional source does not resolve to Field Notation");

const nodeIds = new Set(system.nodes.map(node => node.id));
if (nodeIds.size !== system.nodes.length) throw new Error("Duplicate system node");
for (const relation of system.relations) {
  if (!nodeIds.has(relation.from) || !nodeIds.has(relation.to)) throw new Error(`Unresolved relation ${relation.id}`);
  if (!relation.evidence || !relation.boundary) throw new Error(`Relation ${relation.id} lacks evidence or boundary`);
}
if (!system.nodes.some(node => node.id === "field-notation" && node.status === "preserved")) throw new Error("Field Notation must remain a preserved source");
if (!system.nodes.some(node => node.id === "telos" && node.kind === "keeper")) throw new Error("Telos keeper boundary is missing");
const projectionKinds = new Set(system.relations.filter(relation => relation.from === "living-object").map(relation => relation.kind));
for (const required of ["participates-through", "perceives-through", "remembers-through", "is-heard-through"]) {
  if (!projectionKinds.has(required)) throw new Error(`Living Object projection missing: ${required}`);
}
if (agentEntry.identity !== "root-logos" || agentEntry.read.system !== "weave/system.json") throw new Error("Agent entry does not resolve the Weave");
const mappedNodeIds = new Set(system.nodes.map(({ id }) => id));
for (const repository of telosWitness.system_mapping.repositories) {
  if (!mappedNodeIds.has(repository.id)) throw new Error(`Public field is missing mapped Telos repository: ${repository.id}`);
}
if (!runtimeSource.includes('run("bash", ["scripts/publish-site-lightsail.sh"]')) throw new Error("Runtime deployment must publish the public site");
if (!runtimeUnit.includes("/var/www/root-logos")) throw new Error("Runtime unit cannot write the bounded Caddy document root");
if (!deployWorkflow.includes("deployment.status") || !deployWorkflow.includes("deployed_status")) throw new Error("Deployment workflow must verify completed runtime convergence");
for (const item of drift.items) {
  for (const field of constitution.revisionProtocol.required) {
    if (!item[field]) throw new Error(`Drift ${item.id} lacks constitutional field ${field}`);
  }
}

console.log(`Root Logos Weave verified: ${constitution.invariants.length} invariants, ${system.nodes.length} nodes, ${system.relations.length} relations, ${drift.items.length} open drift item.`);
