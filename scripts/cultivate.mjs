#!/usr/bin/env node

import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const stateUrl = new URL("cultivation/state.json", root);
const policyUrl = new URL("cultivation/policy.json", root);
const graphUrl = new URL("content/constitutional-graph.json", root);
const exportsUrl = new URL("content/export-packets.json", root);
const cyclesUrl = new URL("cultivation/cycles/", root);
const policiesUrl = new URL("cultivation/policies/", root);
const command = process.argv[2] || "status";
const requestedLens = process.argv.includes("--lens") ? process.argv[process.argv.indexOf("--lens") + 1] : null;
const flagValue = (flag) => process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null;

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const cycleUrl = (id) => new URL(`${id}.json`, cyclesUrl);
const save = (url, value) => writeFile(url, `${JSON.stringify(value, null, 2)}\n`);

const sourceSnapshot = async () => {
  const graphText = await readFile(graphUrl, "utf8");
  const exportsText = await readFile(exportsUrl, "utf8");
  const contentDir = new URL("content/", root);
  const markdown = (await readdir(contentDir)).filter((name) => name.endsWith(".md")).sort();
  const documents = [];
  for (const name of markdown) documents.push([name, await readFile(new URL(name, contentDir), "utf8")]);
  return {
    graph: digest(graphText),
    exports: digest(exportsText),
    preserved_documents: digest(documents),
    combined: digest([graphText, exportsText, documents])
  };
};

const appendEvent = (cycle, type, detail = {}) => {
  cycle.events.push({ sequence: cycle.events.length + 1, type, at: new Date().toISOString(), ...detail });
};

const chooseLens = (policy, state) => {
  const completed = state.history.length;
  return policy.lenses[completed % policy.lenses.length];
};

const normalizedKeywords = (node) => new Set((node.keywords || []).map((word) => word.toLowerCase()));
const hasEdge = (edges, left, right) => edges.some((edge) =>
  (edge.from === left && edge.to === right) || (edge.from === right && edge.to === left));

const shortestPath = (edges, start, destination) => {
  const queue = [[start]];
  const visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    const current = path.at(-1);
    if (current === destination) return path;
    for (const edge of edges) {
      const neighbor = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (neighbor && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return null;
};

const searchRelationalGaps = (graph, minimum) => {
  const candidates = [];
  for (let i = 0; i < graph.nodes.length; i += 1) {
    for (let j = i + 1; j < graph.nodes.length; j += 1) {
      const left = graph.nodes[i];
      const right = graph.nodes[j];
      if (left.type === "revision" || right.type === "revision" || hasEdge(graph.edges, left.id, right.id)) continue;
      const rightWords = normalizedKeywords(right);
      const shared = [...normalizedKeywords(left)].filter((word) => rightWords.has(word)).sort();
      if (shared.length < minimum) continue;
      const existingPath = shortestPath(graph.edges, left.id, right.id);
      candidates.push({
        kind: "relational-gap",
        nodes: [left.id, right.id],
        titles: [left.title, right.title],
        shared_keywords: shared,
        existing_path: existingPath,
        graph_distance: existingPath ? existingPath.length - 1 : null,
        evidence: [left.summary || left.definition, right.summary || right.definition],
        claim: `${left.title} and ${right.title} share ${shared.join(", ")} but have no explicit constitutional relation.`,
        proposed_test: `Compare a direct relation between ${left.id} and ${right.id} with the existing path ${existingPath?.join(" → ") || "(none)"}. Accept only if the direct relation adds a distinct generative claim rather than abbreviating that path.`
      });
    }
  }
  return candidates.sort((a, b) =>
    (b.graph_distance ?? 99) - (a.graph_distance ?? 99) ||
    b.shared_keywords.length - a.shared_keywords.length ||
    a.nodes.join().localeCompare(b.nodes.join()));
};

const searchQuestionPressure = (graph) => {
  const questions = graph.nodes.filter((node) => node.type === "open-question");
  return questions.map((question) => {
    const edges = graph.edges.filter((edge) => edge.from === question.id || edge.to === question.id);
    const neighbors = edges.map((edge) => edge.from === question.id ? edge.to : edge.from);
    const questionWords = normalizedKeywords(question);
    const affinities = graph.nodes
      .filter((node) => node.id !== question.id && node.type !== "revision" && !neighbors.includes(node.id))
      .map((node) => ({
        id: node.id,
        title: node.title,
        shared: [...normalizedKeywords(node)].filter((word) => questionWords.has(word)).sort()
      }))
      .filter((candidate) => candidate.shared.length)
      .sort((a, b) => b.shared.length - a.shared.length || a.id.localeCompare(b.id))
      .slice(0, 3);
    return {
      kind: "question-pressure",
      nodes: [question.id, ...affinities.map(({ id }) => id)],
      titles: [question.title, ...affinities.map(({ title }) => title)],
      shared_keywords: question.keywords || [],
      evidence: [
        question.definition || question.summary,
        `Current relations: ${edges.length}`,
        ...affinities.map(({ title, shared }) => `${title} shares ${shared.join(", ")}.`)
      ],
      claim: `${question.title} has ${edges.length} explicit relation${edges.length === 1 ? "" : "s"}; ${affinities.map(({ title }) => title).join(", ")} provide the strongest existing constitutional pressure for investigation.`,
      proposed_test: `Test whether relations from ${question.id} to at least two of ${affinities.map(({ id }) => id).join(", ")} constrain the question from distinct directions without converting it into a settled statement.`,
      proposed_operations: affinities.slice(0, 2).map(({ id }) => ({
        operation: "add-edge",
        from: question.id,
        to: id,
        type: "questions"
      })),
      relation_count: edges.length
    };
  }).sort((a, b) => a.relation_count - b.relation_count || a.nodes[0].localeCompare(b.nodes[0]));
};

const search = (graph, lens) => {
  if (lens.id === "question-pressure") return searchQuestionPressure(graph);
  // Compression and reflexive lenses begin from the same measurable gaps, but
  // their prompt changes the interpretation and evaluation of the evidence.
  return searchRelationalGaps(graph, lens.minimum_shared_keywords || 4);
};

const score = (candidate, graph) => {
  const shared = candidate.shared_keywords?.length || 0;
  const isQuestion = candidate.kind === "question-pressure";
  const source_fidelity = candidate.evidence?.length >= 2 ? 4 : 2;
  const distance = candidate.graph_distance ?? 5;
  const relational_gain = isQuestion ? Math.max(1, 4 - (candidate.relation_count || 0)) : Math.min(4, Math.max(1, distance));
  const compression = isQuestion ? 2 : Math.min(4, Math.max(1, shared - 1));
  const testability = candidate.proposed_test ? 4 : 1;
  const corrigibility = 4;
  const novelty_without_drift = candidate.nodes.every((id) => graph.nodes.some((node) => node.id === id))
    ? (isQuestion || distance > 2 ? 3 : 1)
    : 0;
  const dimensions = { source_fidelity, relational_gain, compression, testability, corrigibility, novelty_without_drift };
  return { dimensions, total: Object.values(dimensions).reduce((sum, value) => sum + value, 0) };
};

const validateOperations = (operations, graph) => {
  const nodeIds = new Set(graph.nodes.map(({ id }) => id));
  return (operations || []).map((operation) => {
    const errors = [];
    if (operation.operation !== "add-edge") errors.push("unsupported operation");
    if (!nodeIds.has(operation.from)) errors.push(`unknown source node ${operation.from}`);
    if (!nodeIds.has(operation.to)) errors.push(`unknown target node ${operation.to}`);
    if (!operation.type) errors.push("missing relation type");
    if (graph.edges.some((edge) => edge.from === operation.from && edge.to === operation.to && edge.type === operation.type)) {
      errors.push("relation already exists");
    }
    const source = graph.nodes.find(({ id }) => id === operation.from);
    if (source?.type === "open-question" && operation.type !== "questions") {
      errors.push("open-question operations must preserve interrogative relation type");
    }
    return { ...operation, validation: errors.length ? "failed" : "passed", errors };
  });
};

const classifyRisk = (operation, graph) => {
  const source = graph.nodes.find(({ id }) => id === operation.from);
  if (operation.operation === "add-edge" && source?.type === "open-question" && operation.type === "questions") return "low";
  return "high";
};

const judgeProposal = (cycle, graph, policy) => {
  const operations = validateOperations(cycle.proposal.operations, graph).map((operation) => ({
    ...operation,
    risk: classifyRisk(operation, graph)
  }));
  const counterargument = cycle.selected_finding?.kind === "question-pressure"
    ? "Keyword affinity can create decorative relations that add no constraint; an open question should not be connected merely to make the graph denser."
    : "A missing direct edge may be intentional because the existing relational path already carries the distinction without redundancy.";
  const rebuttal = cycle.selected_finding?.kind === "question-pressure"
    ? "The proposed edges preserve interrogative direction, target the two strongest distinct canonical affinities, and make the question inspectable without asserting an answer."
    : "No autonomous rebuttal is available for a relation whose semantic direction has not been articulated.";
  const checks = {
    score_threshold: cycle.proposal.evaluation.total >= policy.judgment.minimum_total_for_autonomous_acceptance,
    source_fidelity: cycle.proposal.evaluation.dimensions.source_fidelity >= policy.evaluation.minimum_source_fidelity,
    corrigibility: cycle.proposal.evaluation.dimensions.corrigibility >= policy.evaluation.minimum_corrigibility,
    operations_valid: operations.length > 0 && operations.every(({ validation }) => validation === "passed"),
    risk_authorized: operations.length > 0 && operations.every(({ risk }) => policy.judgment.autonomous_risk_classes.includes(risk)),
    uncertainty_preserved: cycle.proposal.epistemic_status === "unresolved" && operations.every(({ type }) => type === "questions"),
    counterargument_answered: cycle.selected_finding?.kind === "question-pressure"
  };
  const accepted = Object.values(checks).every(Boolean);
  return {
    decision: accepted ? "accept" : "reject",
    authority: "cultivation-policy-v2",
    risk: operations.some(({ risk }) => risk === "high") ? "high" : "low",
    checks,
    counterargument,
    rebuttal,
    operations,
    reason: accepted
      ? "The proposal increases inspectable structure while preserving uncertainty, remains reversible, and satisfies every autonomous gate."
      : `The proposal failed autonomous gates: ${Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name).join(", ")}.`
  };
};

const start = async (state, policy) => {
  if (state.active_cycle) throw new Error("A cultivation cycle is already active. Pause, resume, or complete it before starting another.");
  const id = `RL-CULT-${String(state.next_cycle).padStart(4, "0")}`;
  const snapshot = await sourceSnapshot();
  const lens = requestedLens ? policy.lenses.find(({ id: lensId }) => lensId === requestedLens) : chooseLens(policy, state);
  if (!lens) throw new Error(`Unknown cultivation lens: ${requestedLens}`);
  const cycle = {
    cultivation_id: id,
    status: "running",
    phase: "orientation",
    source_snapshot: snapshot,
    policy_snapshot: policy,
    policy_hash: digest(policy),
    lens,
    self_prompt: null,
    findings: [],
    selected_finding: null,
    proposal: null,
    events: []
  };
  appendEvent(cycle, "cycle-started", { lens: lens.id, source_snapshot: snapshot.combined });
  state.active_cycle = id;
  state.status = "running";
  state.next_cycle += 1;
  await Promise.all([save(cycleUrl(id), cycle), save(stateUrl, state)]);
  process.stdout.write(`${id} started with lens ${lens.id}.\n`);
};

const loadActive = async (state) => {
  if (!state.active_cycle) throw new Error("No active cultivation cycle.");
  return readJson(cycleUrl(state.active_cycle));
};

const step = async (state, policy) => {
  if (state.status === "paused") throw new Error("Cultivation is paused. Run resume before stepping.");
  const cycle = await loadActive(state);
  const graph = await readJson(graphUrl);
  if (cycle.phase === "orientation") {
    cycle.self_prompt = `${cycle.lens.question}\n\nUse only the snapshotted Root Logos constitution as evidence. Preserve differences, expose uncertainty, and return a testable proposal rather than a canonical claim.`;
    cycle.phase = "prompted";
    appendEvent(cycle, "self-prompt-generated", { prompt_hash: digest(cycle.self_prompt) });
  } else if (cycle.phase === "prompted") {
    cycle.findings = search(graph, cycle.lens).slice(0, 12).map((finding, index) => ({ rank: index + 1, ...finding }));
    cycle.phase = "searched";
    appendEvent(cycle, "constitutional-search-completed", { findings: cycle.findings.length });
  } else if (cycle.phase === "searched") {
    cycle.findings = cycle.findings.map((finding) => ({ ...finding, evaluation: score(finding, graph) }))
      .sort((a, b) => b.evaluation.total - a.evaluation.total || a.rank - b.rank);
    cycle.selected_finding = cycle.findings.find((finding) =>
      finding.evaluation.total >= policy.evaluation.minimum_total_for_proposal &&
      finding.evaluation.dimensions.source_fidelity >= policy.evaluation.minimum_source_fidelity &&
      finding.evaluation.dimensions.corrigibility >= policy.evaluation.minimum_corrigibility) || null;
    cycle.phase = "evaluated";
    appendEvent(cycle, "findings-evaluated", { selected: cycle.selected_finding?.nodes || null });
  } else if (cycle.phase === "evaluated") {
    if (!cycle.selected_finding) {
      cycle.status = "completed-no-proposal";
    } else {
      const finding = cycle.selected_finding;
      const operations = validateOperations(finding.proposed_operations, graph);
      cycle.proposal = {
        status: "proposed",
        epistemic_status: "unresolved",
        source: "Root Logos Cultivation Chamber",
        cultivation_id: cycle.cultivation_id,
        summary: finding.claim,
        evidence: finding.evidence,
        affected_nodes: finding.nodes,
        test: finding.proposed_test,
        operations,
        operations_valid: operations.length > 0 && operations.every(({ validation }) => validation === "passed"),
        evaluation: finding.evaluation,
        human_decision_required: true,
        canonical_mutation_performed: false
      };
      cycle.status = "awaiting-human-review";
    }
    cycle.phase = "proposed";
    appendEvent(cycle, "proposal-written", { status: cycle.status });
    state.history.push({ cultivation_id: cycle.cultivation_id, status: cycle.status, proposal: Boolean(cycle.proposal) });
    state.active_cycle = null;
    state.status = "idle";
  } else throw new Error(`Cycle cannot step from phase ${cycle.phase}.`);
  await Promise.all([save(cycleUrl(cycle.cultivation_id), cycle), save(stateUrl, state)]);
  process.stdout.write(`${cycle.cultivation_id}: ${cycle.phase} (${cycle.status}).\n`);
  if (cycle.proposal) process.stdout.write(`${cycle.proposal.summary}\n`);
};

const pause = async (state) => {
  const cycle = await loadActive(state);
  if (state.status === "paused") throw new Error("Cultivation is already paused.");
  cycle.status = "paused";
  state.status = "paused";
  appendEvent(cycle, "cycle-paused", { phase: cycle.phase });
  await Promise.all([save(cycleUrl(cycle.cultivation_id), cycle), save(stateUrl, state)]);
  process.stdout.write(`${cycle.cultivation_id} paused at ${cycle.phase}.\n`);
};

const resume = async (state) => {
  const cycle = await loadActive(state);
  if (state.status !== "paused") throw new Error("Active cultivation cycle is not paused.");
  const current = await sourceSnapshot();
  const changed = current.combined !== cycle.source_snapshot.combined;
  if (changed) {
    cycle.source_drift = { detected: true, original: cycle.source_snapshot, current };
    appendEvent(cycle, "resume-blocked-by-source-drift", { phase: cycle.phase, current_snapshot: current.combined });
    await save(cycleUrl(cycle.cultivation_id), cycle);
    throw new Error(`${cycle.cultivation_id} remains paused because canonical sources changed. Start a new cycle against the new constitution.`);
  }
  cycle.status = "running";
  state.status = "running";
  appendEvent(cycle, "cycle-resumed", { phase: cycle.phase, source_changed: false, current_snapshot: current.combined });
  await Promise.all([save(cycleUrl(cycle.cultivation_id), cycle), save(stateUrl, state)]);
  process.stdout.write(`${cycle.cultivation_id} resumed at ${cycle.phase}${changed ? " with recorded source drift" : ""}.\n`);
};

const review = async (state) => {
  const id = process.argv[3];
  const decision = process.argv[4];
  const reviewer = flagValue("--by");
  const note = flagValue("--note");
  if (!id || !["accept", "reject"].includes(decision)) throw new Error("Usage: review <cultivation-id> <accept|reject> --by <human> --note <reason>");
  if (!reviewer || !note) throw new Error("Human review requires both --by attribution and --note reasoning.");
  const cycle = await readJson(cycleUrl(id));
  if (!cycle.proposal || cycle.status !== "awaiting-human-review") throw new Error(`${id} is not awaiting human review.`);
  cycle.human_review = { decision, reviewer, note, at: new Date().toISOString() };
  cycle.status = decision === "accept" ? "accepted-for-revision" : "rejected";
  cycle.proposal.status = cycle.status;
  appendEvent(cycle, "human-review-recorded", { decision, reviewer });
  const history = state.history.find((entry) => entry.cultivation_id === id);
  if (history) history.status = cycle.status;
  await Promise.all([save(cycleUrl(id), cycle), save(stateUrl, state)]);
  process.stdout.write(`${id} ${cycle.status}; canonical sources unchanged.\n`);
};

const autonomousJudge = async (state, policy) => {
  const id = process.argv[3];
  if (!id) throw new Error("Usage: judge <cultivation-id>");
  const cycle = await readJson(cycleUrl(id));
  if (!cycle.proposal || cycle.status !== "awaiting-human-review") throw new Error(`${id} is not awaiting judgment.`);
  const current = await sourceSnapshot();
  if (current.combined !== cycle.source_snapshot.combined) throw new Error(`${id} cannot be judged because its constitutional source has drifted.`);
  const graph = await readJson(graphUrl);
  cycle.autonomous_judgment = judgeProposal(cycle, graph, policy);
  cycle.autonomous_judgment.policy_hash = digest(policy);
  cycle.autonomous_judgment.policy_snapshot = policy;
  cycle.autonomous_judgment.at = new Date().toISOString();
  cycle.proposal.operations = cycle.autonomous_judgment.operations;
  cycle.status = cycle.autonomous_judgment.decision === "accept" ? "autonomously-accepted" : "autonomously-rejected";
  cycle.proposal.status = cycle.status;
  appendEvent(cycle, "autonomous-judgment-recorded", {
    decision: cycle.autonomous_judgment.decision,
    risk: cycle.autonomous_judgment.risk,
    checks: cycle.autonomous_judgment.checks
  });
  const history = state.history.find((entry) => entry.cultivation_id === id);
  if (history) history.status = cycle.status;
  await Promise.all([save(cycleUrl(id), cycle), save(stateUrl, state)]);
  process.stdout.write(`${id} ${cycle.status}: ${cycle.autonomous_judgment.reason}\n`);
};

const applyAccepted = async (state) => {
  const id = process.argv[3];
  if (!id) throw new Error("Usage: apply <cultivation-id>");
  const cycle = await readJson(cycleUrl(id));
  const humanAccepted = cycle.status === "accepted-for-revision" && cycle.human_review?.decision === "accept";
  const autonomouslyAccepted = cycle.status === "autonomously-accepted" && cycle.autonomous_judgment?.decision === "accept" && cycle.autonomous_judgment?.risk === "low";
  if (!humanAccepted && !autonomouslyAccepted) throw new Error(`${id} has not earned application authority.`);
  const before = await sourceSnapshot();
  if (before.combined !== cycle.source_snapshot.combined) {
    throw new Error(`${id} cannot be applied because canonical sources changed after investigation.`);
  }
  const graph = await readJson(graphUrl);
  const operations = validateOperations(cycle.proposal.operations, graph);
  if (!operations.length || operations.some(({ validation }) => validation !== "passed")) {
    throw new Error(`Accepted operations are no longer valid: ${JSON.stringify(operations)}`);
  }
  for (const { from, to, type } of operations) graph.edges.push({ from, to, type });
  await save(graphUrl, graph);
  const after = await sourceSnapshot();
  cycle.application = {
    status: "applied",
    authority: autonomouslyAccepted ? "autonomous-low-risk" : "human-accepted",
    at: new Date().toISOString(),
    operations: operations.map(({ operation, from, to, type }) => ({ operation, from, to, type })),
    source_before: before,
    source_after: after
  };
  cycle.status = "implemented";
  cycle.proposal.status = "implemented";
  appendEvent(cycle, "accepted-proposal-applied", { before: before.combined, after: after.combined });
  const history = state.history.find((entry) => entry.cultivation_id === id);
  if (history) history.status = cycle.status;
  await Promise.all([save(cycleUrl(id), cycle), save(stateUrl, state)]);
  process.stdout.write(`${id} applied ${operations.length} canonical operation${operations.length === 1 ? "" : "s"}; lineage archived.\n`);
};

const validate = async (state, policy) => {
  const errors = [];
  if (state.version !== 1) errors.push("unsupported state version");
  const files = (await readdir(cyclesUrl)).filter((name) => name.endsWith(".json")).sort();
  for (const file of files) {
    const cycle = await readJson(new URL(file, cyclesUrl));
    if (cycle.policy_snapshot && cycle.policy_hash !== digest(cycle.policy_snapshot)) {
      errors.push(`${file}: embedded policy snapshot does not match its hash`);
    }
    if (!cycle.policy_snapshot && cycle.policy_hash !== digest(policy)) {
      try {
        const archivedPolicy = await readJson(new URL(`${cycle.policy_hash}.json`, policiesUrl));
        if (digest(archivedPolicy) !== cycle.policy_hash) errors.push(`${file}: archived policy does not match its hash`);
      } catch {
        errors.push(`${file}: legacy cycle policy hash has no verifiable archive`);
      }
    }
    cycle.events.forEach((event, index) => {
      if (event.sequence !== index + 1) errors.push(`${file}: non-contiguous event sequence`);
    });
    if (cycle.proposal?.canonical_mutation_performed !== false) errors.push(`${file}: proposal lacks non-mutation boundary`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  process.stdout.write(`PASS cultivation state; ${files.length} cycle archive${files.length === 1 ? "" : "s"} verified.\n`);
};

const main = async () => {
  const [state, policy] = await Promise.all([readJson(stateUrl), readJson(policyUrl)]);
  if (command === "start") return start(state, policy);
  if (command === "step") return step(state, policy);
  if (command === "pause") return pause(state);
  if (command === "resume") return resume(state);
  if (command === "validate") return validate(state, policy);
  if (command === "review") return review(state);
  if (command === "judge") return autonomousJudge(state, policy);
  if (command === "apply") return applyAccepted(state);
  if (command === "status") {
    process.stdout.write(`${state.status}; active=${state.active_cycle || "none"}; completed=${state.history.length}; next=${state.next_cycle}\n`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
