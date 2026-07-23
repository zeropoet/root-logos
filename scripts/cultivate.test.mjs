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
  mkdir(join(sandbox, "cultivation", "cycles"), { recursive: true }),
  mkdir(join(sandbox, "journal"), { recursive: true }),
  mkdir(join(sandbox, "self-authorship"), { recursive: true })
]);

await Promise.all([
  cp(new URL("scripts/cultivate.mjs", sourceRoot), join(sandbox, "scripts", "cultivate.mjs")),
  cp(new URL("content/", sourceRoot), join(sandbox, "content"), { recursive: true }),
  cp(new URL("cultivation/policy.json", sourceRoot), join(sandbox, "cultivation", "policy.json")),
  cp(new URL("journal/policy.json", sourceRoot), join(sandbox, "journal", "policy.json")),
  cp(new URL("journal/entry.schema.json", sourceRoot), join(sandbox, "journal", "entry.schema.json")),
  cp(new URL("self-authorship/current.json", sourceRoot), join(sandbox, "self-authorship", "current.json")),
  cp(new URL("self-authorship/policy.json", sourceRoot), join(sandbox, "self-authorship", "policy.json"))
]);

const activePolicy = JSON.parse(await readFile(new URL("cultivation/policy.json", sourceRoot), "utf8"));
assert.equal(activePolicy.version, 3);
assert.equal(activePolicy.authority.authorization.constitutional_revision, "v0.9");
assert.equal(activePolicy.authority.self_authorship.publication, "immediate-atomic-after-all-gates-pass");
assert.ok(activePolicy.authority.protected_exclusions.includes("expand autonomous authority or modify the policy and thresholds that delimit it"));
const workflow = await readFile(new URL(".github/workflows/cultivation-cycle.yml", sourceRoot), "utf8");
for (const path of ["journal/policy.json", "journal/*.schema.json", "self-authorship/current.json", "self-authorship/policy.json"]) {
  assert.match(workflow, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

await writeFile(join(sandbox, "cultivation", "state.json"), `${JSON.stringify({
  version: 1,
  status: "idle",
  active_cycle: null,
  next_cycle: 1,
  history: []
}, null, 2)}\n`);
await writeFile(join(sandbox, "cultivation", "memory.json"), `${JSON.stringify({
  version: 1,
  hypotheses: {},
  novelty: { consecutive_low_yield_cycles: 0, last_score: null, history: [] },
  dormancy: { active: false, entered_at: null, reason: null, source_snapshot: null, wake_history: [] },
  method_observations: []
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
const identityPath = join(sandbox, "self-authorship", "current.json");
const originalIdentityText = await readFile(identityPath, "utf8");
const changedIdentity = JSON.parse(originalIdentityText);
changedIdentity.revision = "v0.9-test-drift";
await writeFile(identityPath, `${JSON.stringify(changedIdentity, null, 2)}\n`);
const identityDriftResume = run("resume");
assert.notEqual(identityDriftResume.status, 0);
assert.match(identityDriftResume.stderr, /remains paused because canonical sources changed/);
await writeFile(identityPath, originalIdentityText);
succeeds("resume");
succeeds("step");
succeeds("step");

const cyclePath = join(sandbox, "cultivation", "cycles", "RL-CULTIVATE-0001.json");
const cycle = JSON.parse(await readFile(cyclePath, "utf8"));
assert.equal(cycle.status, "awaiting-human-review");
assert.equal(cycle.proposal.canonical_mutation_performed, false);
assert.ok(cycle.proposal.affected_nodes.length >= 3);
assert.equal(cycle.proposal.operations_valid, true);
assert.equal(cycle.proposal.operations.length, 2);
assert.ok(cycle.proposal.operations.every(({ validation }) => validation === "passed"));
assert.equal(cycle.policy_hash.length, 64);
assert.deepEqual(cycle.policy_snapshot, JSON.parse(await readFile(join(sandbox, "cultivation", "policy.json"), "utf8")));

const anonymousReview = run("review", "RL-CULTIVATE-0001", "accept");
assert.notEqual(anonymousReview.status, 0);
assert.match(anonymousReview.stderr, /requires both --by attribution and --note reasoning/);
succeeds("review", "RL-CULT-0001", "accept", "--by", "Test Human", "--note", "Evidence and relational test reviewed.");
const reviewed = JSON.parse(await readFile(cyclePath, "utf8"));
assert.equal(reviewed.status, "accepted-for-revision");
assert.equal(reviewed.human_review.reviewer, "Test Human");
assert.equal(reviewed.proposal.canonical_mutation_performed, false);

succeeds("apply", "RL-CULTIVATE-0001");
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
succeeds("judge", "RL-CULTIVATE-0002");
const autonomousPath = join(sandbox, "cultivation", "cycles", "RL-CULTIVATE-0002.json");
const judged = JSON.parse(await readFile(autonomousPath, "utf8"));
assert.equal(judged.status, "autonomously-accepted");
assert.equal(judged.autonomous_judgment.risk, "low");
assert.equal(judged.autonomous_judgment.authority, "cultivation-policy-v3");
assert.ok(Object.values(judged.autonomous_judgment.checks).every(Boolean));
assert.match(judged.autonomous_judgment.counterargument, /decorative relations/);
succeeds("apply", "RL-CULTIVATE-0002");
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
const cultivationMemory = JSON.parse(await readFile(join(sandbox, "cultivation", "memory.json"), "utf8"));
assert.ok(Object.keys(cultivationMemory.hypotheses).length >= 3);
assert.equal(cultivationMemory.novelty.history.length, 1);
assert.ok(automaticCycle.selected_finding.reconsideration.fingerprint);

succeeds("cycle", "--lens", "generative-compression");
const repeatedState = JSON.parse(await readFile(join(sandbox, "cultivation", "state.json"), "utf8"));
const repeatedId = repeatedState.history.at(-1).cultivation_id;
const repeatedCycle = JSON.parse(await readFile(join(sandbox, "cultivation", "cycles", `${repeatedId}.json`), "utf8"));
assert.notEqual(repeatedCycle.selected_finding.reconsideration.fingerprint, automaticCycle.selected_finding.reconsideration.fingerprint);
const suppressedOriginal = repeatedCycle.findings.find(({ reconsideration }) => reconsideration.fingerprint === automaticCycle.selected_finding.reconsideration.fingerprint);
assert.equal(suppressedOriginal.reconsideration.eligible, false);
assert.equal(suppressedOriginal.reconsideration.reason, "unchanged-repeat");

const exhaustionMemory = JSON.parse(await readFile(join(sandbox, "cultivation", "memory.json"), "utf8"));
for (const finding of repeatedCycle.findings) {
  exhaustionMemory.hypotheses[finding.reconsideration.fingerprint] = {
    fingerprint: finding.reconsideration.fingerprint,
    kind: finding.kind,
    nodes: finding.nodes,
    claim: finding.claim,
    evidence_hash: finding.reconsideration.evidence_hash,
    policy_hash: repeatedCycle.policy_hash,
    first_cycle: repeatedId,
    last_cycle: repeatedId,
    last_cycle_index: Number(repeatedId.split("-").at(-1)),
    considerations: 1,
    status: "autonomously-rejected"
  };
}
exhaustionMemory.novelty.consecutive_low_yield_cycles = 2;
await writeFile(join(sandbox, "cultivation", "memory.json"), `${JSON.stringify(exhaustionMemory, null, 2)}\n`);
succeeds("cycle", "--lens", "generative-compression");
const dormantState = JSON.parse(await readFile(join(sandbox, "cultivation", "state.json"), "utf8"));
const dormantCycleId = dormantState.history.at(-1).cultivation_id;
const dormantCycle = JSON.parse(await readFile(join(sandbox, "cultivation", "cycles", `${dormantCycleId}.json`), "utf8"));
assert.equal(dormantCycle.status, "completed-no-proposal");
const earnedDormancy = JSON.parse(await readFile(join(sandbox, "cultivation", "memory.json"), "utf8"));
assert.equal(earnedDormancy.dormancy.active, true);
assert.equal(earnedDormancy.method_observations.at(-1).type, "meta-refactoring-proposal");
const historyBeforeDormantCycle = dormantState.history.length;
assert.match(succeeds("cycle"), /remains dormant/);
const skippedState = JSON.parse(await readFile(join(sandbox, "cultivation", "state.json"), "utf8"));
assert.equal(skippedState.history.length, historyBeforeDormantCycle);
succeeds("cycle", "--force");
const forcedState = JSON.parse(await readFile(join(sandbox, "cultivation", "state.json"), "utf8"));
assert.equal(forcedState.history.length, historyBeforeDormantCycle + 1);
const awakenedMemory = JSON.parse(await readFile(join(sandbox, "cultivation", "memory.json"), "utf8"));
assert.equal(awakenedMemory.dormancy.wake_history.at(-1).reason, "manual-force");

awakenedMemory.dormancy.active = true;
awakenedMemory.dormancy.reason = "test dormancy before admitted evidence";
awakenedMemory.dormancy.source_snapshot = { combined: (await import("node:crypto")).createHash("sha256").update("test").digest("hex"), policy: null };
await writeFile(join(sandbox, "cultivation", "memory.json"), `${JSON.stringify(awakenedMemory, null, 2)}\n`);
const intakeContextPath = join(sandbox, "admitted-observation.json");
await writeFile(intakeContextPath, `${JSON.stringify({
  event_id: "RL-OBS-TEST-FIRST",
  disposition: "promoted",
  admitted_at: new Date().toISOString(),
  steward_note: "Priority inquiry pressure.",
  payload: {
    observation: "A living membrane needs explicit relation to stewardship, uncertainty, and cultivation.",
    context: "First intake integration test.",
    relation: "How does stewardship preserve uncertainty while permitting growth?",
    source_type: "dialogue",
    attribution: "Test Steward"
  }
}, null, 2)}\n`);
succeeds("cycle", "--intake-context", intakeContextPath, "--priority", "promoted");
const intakeState = JSON.parse(await readFile(join(sandbox, "cultivation", "state.json"), "utf8"));
const intakeCycleId = intakeState.history.at(-1).cultivation_id;
const intakeCycle = JSON.parse(await readFile(join(sandbox, "cultivation", "cycles", `${intakeCycleId}.json`), "utf8"));
assert.equal(intakeCycle.intake.event_id, "RL-OBS-TEST-FIRST");
assert.equal(intakeCycle.intake.disposition, "promoted");
assert.equal(intakeCycle.findings[0].kind, "admitted-observation");
assert.equal(intakeCycle.findings[0].intake_priority, "promoted");
assert.match(intakeCycle.self_prompt, /crossed the human stewardship boundary/);
assert.ok(intakeCycle.events.some(({ type, intake_event_id }) => type === "cycle-started" && intake_event_id === "RL-OBS-TEST-FIRST"));
const postIntakeMemory = JSON.parse(await readFile(join(sandbox, "cultivation", "memory.json"), "utf8"));
assert.equal(postIntakeMemory.dormancy.wake_history.at(-1).reason, "admitted-observation:RL-OBS-TEST-FIRST");

succeeds("rebuild-memory");
const rebuiltMemory = JSON.parse(await readFile(join(sandbox, "cultivation", "memory.json"), "utf8"));
assert.ok(Object.keys(rebuiltMemory.hypotheses).length >= 4);

succeeds("validate");
process.stdout.write("PASS cultivation lifecycle, drift boundary, admitted-observation inquiry, promotion priority, adversarial self-judgment, autonomous refactoring, scheduled-cycle entry point, lineage, and human escalation.\n");
