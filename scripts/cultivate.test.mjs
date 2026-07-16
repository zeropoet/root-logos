#!/usr/bin/env node

import { mkdtemp, mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const sourceRoot = new URL("../", import.meta.url);
const sandbox = await mkdtemp(join(tmpdir(), "root-logos-cultivation-"));

await Promise.all([
  mkdir(join(sandbox, "scripts"), { recursive: true }),
  mkdir(join(sandbox, "content"), { recursive: true }),
  mkdir(join(sandbox, "cultivation", "cycles"), { recursive: true })
]);

await Promise.all([
  cp(new URL("scripts/cultivate.mjs", sourceRoot), join(sandbox, "scripts", "cultivate.mjs")),
  cp(new URL("content/", sourceRoot), join(sandbox, "content"), { recursive: true }),
  cp(new URL("cultivation/policy.json", sourceRoot), join(sandbox, "cultivation", "policy.json"))
]);

await writeFile(join(sandbox, "cultivation", "state.json"), `${JSON.stringify({
  version: 1,
  status: "idle",
  active_cycle: null,
  next_cycle: 1,
  history: []
}, null, 2)}\n`);

// Give the lifecycle test a stable question-pressure baseline even after the
// real constitution has autonomously integrated earlier questions.
const baselineGraphPath = join(sandbox, "content", "constitutional-graph.json");
const baselineGraph = JSON.parse(await readFile(baselineGraphPath, "utf8"));
const openQuestions = new Set(baselineGraph.nodes.filter(({ type }) => type === "open-question").map(({ id }) => id));
baselineGraph.edges = baselineGraph.edges.filter(({ from }) => !openQuestions.has(from));
await writeFile(baselineGraphPath, `${JSON.stringify(baselineGraph, null, 2)}\n`);

const run = (...args) => spawnSync(process.execPath, [join(sandbox, "scripts", "cultivate.mjs"), ...args], {
  cwd: sandbox,
  encoding: "utf8"
});
const succeeds = (...args) => {
  const result = run(...args);
  assert.equal(result.status, 0, `${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout;
};

succeeds("start", "--lens", "question-pressure");
succeeds("step");
succeeds("pause");
assert.match(succeeds("status"), /^paused;/);
succeeds("resume");
succeeds("step");
succeeds("pause");

const graphPath = join(sandbox, "content", "constitutional-graph.json");
const originalGraphText = await readFile(graphPath, "utf8");
const graph = JSON.parse(originalGraphText);
graph.meta.test_probe = true;
await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);
const driftResume = run("resume");
assert.notEqual(driftResume.status, 0);
assert.match(driftResume.stderr, /remains paused because canonical sources changed/);
assert.match(succeeds("status"), /^paused;/);

await writeFile(graphPath, originalGraphText);
succeeds("resume");
succeeds("step");
succeeds("step");

const cyclePath = join(sandbox, "cultivation", "cycles", "RL-CULT-0001.json");
const cycle = JSON.parse(await readFile(cyclePath, "utf8"));
assert.equal(cycle.status, "awaiting-human-review");
assert.equal(cycle.proposal.canonical_mutation_performed, false);
assert.ok(cycle.proposal.affected_nodes.length >= 3);
assert.equal(cycle.proposal.operations_valid, true);
assert.equal(cycle.proposal.operations.length, 2);
assert.ok(cycle.proposal.operations.every(({ validation }) => validation === "passed"));
assert.equal(cycle.policy_hash.length, 64);
assert.deepEqual(cycle.policy_snapshot, JSON.parse(await readFile(join(sandbox, "cultivation", "policy.json"), "utf8")));

const anonymousReview = run("review", "RL-CULT-0001", "accept");
assert.notEqual(anonymousReview.status, 0);
assert.match(anonymousReview.stderr, /requires both --by attribution and --note reasoning/);
succeeds("review", "RL-CULT-0001", "accept", "--by", "Test Human", "--note", "Evidence and relational test reviewed.");
const reviewed = JSON.parse(await readFile(cyclePath, "utf8"));
assert.equal(reviewed.status, "accepted-for-revision");
assert.equal(reviewed.human_review.reviewer, "Test Human");
assert.equal(reviewed.proposal.canonical_mutation_performed, false);

succeeds("apply", "RL-CULT-0001");
const implemented = JSON.parse(await readFile(cyclePath, "utf8"));
assert.equal(implemented.status, "implemented");
assert.equal(implemented.application.operations.length, 2);
assert.notEqual(implemented.application.source_before.combined, implemented.application.source_after.combined);
const amendedGraph = JSON.parse(await readFile(graphPath, "utf8"));
for (const operation of implemented.application.operations) {
  assert.ok(amendedGraph.edges.some(({ from, to, type }) => from === operation.from && to === operation.to && type === operation.type));
}

succeeds("start", "--lens", "question-pressure");
succeeds("step");
succeeds("step");
succeeds("step");
succeeds("step");
succeeds("judge", "RL-CULT-0002");
const autonomousPath = join(sandbox, "cultivation", "cycles", "RL-CULT-0002.json");
const judged = JSON.parse(await readFile(autonomousPath, "utf8"));
assert.equal(judged.status, "autonomously-accepted");
assert.equal(judged.autonomous_judgment.risk, "low");
assert.ok(Object.values(judged.autonomous_judgment.checks).every(Boolean));
assert.match(judged.autonomous_judgment.counterargument, /decorative relations/);
succeeds("apply", "RL-CULT-0002");
const autonomouslyImplemented = JSON.parse(await readFile(autonomousPath, "utf8"));
assert.equal(autonomouslyImplemented.status, "implemented");
assert.equal(autonomouslyImplemented.application.authority, "autonomous-low-risk");

succeeds("cycle");
const automaticState = JSON.parse(await readFile(join(sandbox, "cultivation", "state.json"), "utf8"));
assert.equal(automaticState.history.length, 3);
assert.equal(automaticState.active_cycle, null);
const automaticId = automaticState.history.at(-1).cultivation_id;
const automaticCycle = JSON.parse(await readFile(join(sandbox, "cultivation", "cycles", `${automaticId}.json`), "utf8"));
assert.ok(["implemented", "autonomously-rejected", "completed-no-proposal"].includes(automaticCycle.status));
assert.ok(automaticCycle.events.some(({ type }) => type === "proposal-written"));

succeeds("validate");
process.stdout.write("PASS cultivation lifecycle, drift boundary, adversarial self-judgment, autonomous refactoring, scheduled-cycle entry point, lineage, and human escalation.\n");
