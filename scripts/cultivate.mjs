#!/usr/bin/env node

import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const stateUrl = new URL("cultivation/state.json", root);
const memoryUrl = new URL("cultivation/memory.json", root);
const policyUrl = new URL("cultivation/policy.json", root);
const graphUrl = new URL("content/constitutional-graph.json", root);
const exportsUrl = new URL("content/export-packets.json", root);
const journalPolicyUrl = new URL("journal/policy.json", root);
const journalSchemaUrl = new URL("journal/entry.schema.json", root);
const identityUrl = new URL("self-authorship/current.json", root);
const selfAuthorshipPolicyUrl = new URL("self-authorship/policy.json", root);
const sourceRegistryUrl = new URL("sources/registry.json", root);
const foldForgeSnapshotUrl = new URL("sources/foldforge.snapshot.json", root);
const cyclesUrl = new URL("cultivation/cycles/", root);
const policiesUrl = new URL("cultivation/policies/", root);
const command = process.argv[2] || "status";
const flags = new Set(process.argv.slice(3));
const requestedLens = process.argv.includes("--lens") ? process.argv[process.argv.indexOf("--lens") + 1] : null;
const flagValue = (flag) => process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null;
const intakeContextPath = flagValue("--intake-context");
const intakePriority = flagValue("--priority") || "admissible";

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));
const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const canonicalCultivationId = (id) => String(id || "").replace(/^RL-CULT-/, "RL-CULTIVATE-");
const cycleUrl = (id) => new URL(`${canonicalCultivationId(id)}.json`, cyclesUrl);
const save = (url, value) => writeFile(url, `${JSON.stringify(value, null, 2)}\n`);

const sourceSnapshot = async () => {
  const graphText = await readFile(graphUrl, "utf8");
  const exportsText = await readFile(exportsUrl, "utf8");
  const journalPolicyText = await readFile(journalPolicyUrl, "utf8");
  const journalSchemaText = await readFile(journalSchemaUrl, "utf8");
  const identityText = await readFile(identityUrl, "utf8");
  const selfAuthorshipPolicyText = await readFile(selfAuthorshipPolicyUrl, "utf8");
  const sourceRegistryText = await readFile(sourceRegistryUrl, "utf8");
  const foldForgeSnapshotText = await readFile(foldForgeSnapshotUrl, "utf8");
  const contentDir = new URL("content/", root);
  const markdown = (await readdir(contentDir)).filter((name) => name.endsWith(".md")).sort();
  const documents = [];
  for (const name of markdown) documents.push([name, await readFile(new URL(name, contentDir), "utf8")]);
  return {
    graph: digest(graphText),
    exports: digest(exportsText),
    preserved_documents: digest(documents),
    journal_policy: digest(journalPolicyText),
    journal_schema: digest(journalSchemaText),
    identity: digest(identityText),
    self_authorship_policy: digest(selfAuthorshipPolicyText),
    source_registry: digest(sourceRegistryText),
    connected_sources: digest(foldForgeSnapshotText),
    combined: digest([
      graphText,
      exportsText,
      documents,
      journalPolicyText,
      journalSchemaText,
      identityText,
      selfAuthorshipPolicyText,
      sourceRegistryText,
      foldForgeSnapshotText
    ])
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
const normalizedText = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const findingFingerprint = (finding) => digest({
  kind: finding.kind,
  nodes: [...(finding.nodes || [])].sort(),
  claim: normalizedText(finding.claim),
  proposed_question: normalizedText(finding.proposed_question)
});
const findingEvidenceHash = (finding) => digest({
  evidence: finding.evidence || [],
  existing_path: finding.existing_path || null,
  relation_count: finding.relation_count ?? null,
  operations: finding.proposed_operations || []
});
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

const searchGenerativeCompression = (graph) => {
  const eligible = graph.nodes.filter(({ type }) => !["revision", "root"].includes(type));
  const groups = new Map();
  for (const node of eligible) {
    const words = [...normalizedKeywords(node)].sort();
    for (let left = 0; left < words.length; left += 1) {
      for (let right = left + 1; right < words.length; right += 1) {
        const key = `${words[left]}|${words[right]}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(node);
      }
    }
  }
  return [...groups.entries()]
    .filter(([, nodes]) => nodes.length >= 3)
    .map(([key, nodes]) => {
      const primitives = key.split("|");
      const selected = nodes.slice(0, 6);
      return {
        kind: "generative-compression",
        nodes: selected.map(({ id }) => id),
        titles: selected.map(({ title }) => title),
        shared_keywords: primitives,
        recurrence_count: nodes.length,
        evidence: selected.map(({ title, summary, definition }) => `${title}: ${summary || definition}`),
        claim: `${primitives.join(" + ")} recurs across ${nodes.length} constitutional nodes and may indicate a smaller generative composition rather than repeated declaration.`,
        proposed_question: `Can ${primitives[0]} and ${primitives[1]} be composed as a primitive relation that regenerates these ${nodes.length} appearances without collapsing their differences?`,
        proposed_test: "Name the distinctions each occurrence contributes, then test whether one directional composition can regenerate all of them without deleting orientation, uncertainty, or corrigibility."
      };
    })
    .sort((a, b) => b.recurrence_count - a.recurrence_count || a.shared_keywords.join().localeCompare(b.shared_keywords.join()));
};

const searchReflexiveTests = (graph) => {
  const chamber = graph.nodes.find(({ id }) => id === "cultivation-chamber");
  if (!chamber) return [];
  return graph.nodes
    .filter(({ type }) => type === "architectural-principle")
    .filter((principle) => !hasEdge(graph.edges, chamber.id, principle.id))
    .map((principle) => ({
      kind: "reflexive-test",
      nodes: [chamber.id, principle.id],
      titles: [chamber.title, principle.title],
      shared_keywords: [...normalizedKeywords(principle)].filter((word) => normalizedKeywords(chamber).has(word)).sort(),
      evidence: [chamber.definition, principle.definition],
      claim: `${principle.title} is preserved constitutionally but has no explicit test relation to the Cultivation Chamber.`,
      proposed_question: `What observable failure would show that the Cultivation Chamber violates ${principle.title}?`,
      proposed_test: `Apply ${principle.id} to one complete cultivation cycle and identify a falsifiable invariant, a failure signal, and a required correction.`,
      proposed_operations: [{ operation: "add-edge", from: chamber.id, to: principle.id, type: "tests itself through" }]
    }));
};

const searchConnectedSourcePressure = (graph) => {
  const source = graph.nodes.find(({ id }) => id === "source-foldforge");
  const field = graph.nodes.find(({ id }) => id === "coherent-field");
  const compositions = graph.nodes.filter(({ id }) => id.startsWith("foldforge-composition-"));
  if (!source || !field || !compositions.length) return [];
  return compositions.map((composition) => ({
    kind: "connected-source-pressure",
    nodes: [source.id, composition.id, field.id, "root-logos"],
    titles: [source.title, composition.title, field.title, "Root Logos"],
    shared_keywords: composition.keywords || [],
    evidence: [source.definition, composition.definition, field.definition],
    claim: `${composition.title} introduces a versioned compositional method that may reveal relations inside Root Logos which its constitutional graph does not yet perceive.`,
    proposed_question: `Which Root Logos structures become newly legible when tested through ${composition.title}, and what would falsify that relation?`,
    proposed_test: `Apply the declared ${composition.title} transformation only to attributable Root Logos evidence; preserve the source witness, publish the mapping, and reject any result that implies meaning beyond the grammar's stated authority.`,
    external_evidence: true
  }));
};

const search = (graph, lens) => {
  if (lens.id === "question-pressure") return searchQuestionPressure(graph);
  if (lens.id === "generative-compression") return searchGenerativeCompression(graph);
  if (lens.id === "reflexive-test") return searchReflexiveTests(graph);
  if (lens.id === "connected-source-pressure") return searchConnectedSourcePressure(graph);
  return searchRelationalGaps(graph, lens.minimum_shared_keywords || 4);
};

const searchIntakeResonance = (graph, intake) => {
  if (!intake?.payload?.observation) return [];
  const text = normalizedText([intake.payload.observation, intake.payload.context, intake.payload.relation].filter(Boolean).join(" "));
  const words = new Set(text.split(" ").filter((word) => word.length > 3));
  const resonances = graph.nodes
    .filter(({ type }) => type !== "revision")
    .map((node) => {
      const vocabulary = new Set([...normalizedKeywords(node), ...normalizedText(`${node.title} ${node.summary || node.definition || ""}`).split(" ")]);
      const shared = [...words].filter((word) => vocabulary.has(word)).sort();
      return { node, shared };
    })
    .filter(({ shared }) => shared.length)
    .sort((a, b) => b.shared.length - a.shared.length || a.node.id.localeCompare(b.node.id))
    .slice(0, intakePriority === "promoted" ? 5 : 3);
  return [{
    kind: "admitted-observation",
    nodes: resonances.map(({ node }) => node.id),
    titles: resonances.map(({ node }) => node.title),
    shared_keywords: [...new Set(resonances.flatMap(({ shared }) => shared))],
    evidence: [
      `Admitted observation ${intake.event_id}: ${intake.payload.observation}`,
      ...resonances.map(({ node, shared }) => `${node.title} resonates through ${shared.join(", ")}.`)
    ],
    claim: resonances.length
      ? `${intake.event_id} creates new inquiry pressure around ${resonances.map(({ node }) => node.title).join(", ")}.`
      : `${intake.event_id} has been admitted but does not yet share enough explicit language with the constitution to support a structural proposal.`,
    proposed_question: intake.payload.relation || "What distinction or relation would let this observation interrogate Root Logos without converting testimony into doctrine?",
    proposed_test: "Test the observation against the named constitutional structures, preserving its provenance and refusing canonical mutation until a distinct, corrigible relation can be stated.",
    intake_priority: intakePriority,
    external_evidence: true
  }];
};

const score = (candidate, graph) => {
  const shared = candidate.shared_keywords?.length || 0;
  const isQuestion = candidate.kind === "question-pressure";
  const source_fidelity = candidate.evidence?.length >= 2 ? 4 : 2;
  const distance = candidate.graph_distance ?? 5;
  const relational_gain = candidate.kind === "admitted-observation" ? (candidate.nodes.length ? 4 : 1) : isQuestion ? Math.max(1, 4 - (candidate.relation_count || 0)) : Math.min(4, Math.max(1, distance));
  const compression = isQuestion ? 2 : Math.min(4, Math.max(1, shared - 1));
  const testability = candidate.proposed_test ? 4 : 1;
  const corrigibility = 4;
  const novelty_without_drift = candidate.kind === "admitted-observation" ? (candidate.intake_priority === "promoted" ? 4 : 3) : candidate.nodes.every((id) => graph.nodes.some((node) => node.id === id))
    ? (isQuestion || distance > 2 ? 3 : 1)
    : 0;
  const dimensions = { source_fidelity, relational_gain, compression, testability, corrigibility, novelty_without_drift };
  return { dimensions, total: Object.values(dimensions).reduce((sum, value) => sum + value, 0) };
};

const assessReconsideration = (finding, memory, policy, state) => {
  const fingerprint = findingFingerprint(finding);
  const evidenceHash = findingEvidenceHash(finding);
  const previous = memory.hypotheses[fingerprint];
  const cycleIndex = state.history.length + 1;
  if (!previous) return { fingerprint, evidence_hash: evidenceHash, eligible: true, reason: "new-hypothesis", novelty: 4 };
  if (previous.evidence_hash !== evidenceHash) return { fingerprint, evidence_hash: evidenceHash, eligible: true, reason: "evidence-changed", novelty: 3 };
  if (previous.policy_hash !== digest(policy)) return { fingerprint, evidence_hash: evidenceHash, eligible: true, reason: "policy-changed", novelty: 2 };
  if (cycleIndex - previous.last_cycle_index >= policy.memory.reconsider_after_cycles) {
    return { fingerprint, evidence_hash: evidenceHash, eligible: true, reason: "incubation-elapsed", novelty: 1 };
  }
  return { fingerprint, evidence_hash: evidenceHash, eligible: false, reason: "unchanged-repeat", novelty: 0 };
};

const rememberHypothesis = (memory, cycle, finding, status) => {
  if (!finding?.reconsideration?.fingerprint) return;
  const fingerprint = finding.reconsideration.fingerprint;
  const previous = memory.hypotheses[fingerprint];
  memory.hypotheses[fingerprint] = {
    fingerprint,
    kind: finding.kind,
    nodes: finding.nodes || [],
    claim: finding.claim,
    proposed_question: finding.proposed_question || null,
    evidence_hash: finding.reconsideration.evidence_hash,
    policy_hash: cycle.policy_hash,
    first_cycle: previous?.first_cycle || cycle.cultivation_id,
    last_cycle: cycle.cultivation_id,
    last_cycle_index: Number(cycle.cultivation_id.split("-").at(-1)),
    considerations: (previous?.considerations || 0) + 1,
    status,
    last_novelty_reason: finding.reconsideration.reason,
    last_evaluation: finding.evaluation || null
  };
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
    authority: `cultivation-policy-v${policy.version}`,
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

const start = async (state, policy, intake = null) => {
  if (state.active_cycle) throw new Error("A cultivation cycle is already active. Pause, resume, or complete it before starting another.");
  const id = `RL-CULTIVATE-${String(state.next_cycle).padStart(4, "0")}`;
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
    intake: intake ? { event_id: intake.event_id, disposition: intake.disposition || intakePriority, admitted_at: intake.admitted_at, steward_note: intake.steward_note || null, payload: intake.payload } : null,
    self_prompt: null,
    findings: [],
    selected_finding: null,
    proposal: null,
    events: []
  };
  appendEvent(cycle, "cycle-started", { lens: lens.id, source_snapshot: snapshot.combined, intake_event_id: intake?.event_id || null, intake_priority: intake?.disposition || null });
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

const step = async (state, policy, memory) => {
  if (state.status === "paused") throw new Error("Cultivation is paused. Run resume before stepping.");
  const cycle = await loadActive(state);
  const graph = await readJson(graphUrl);
  if (cycle.phase === "orientation") {
    cycle.self_prompt = cycle.intake
      ? `An admitted observation has crossed the human stewardship boundary: ${cycle.intake.event_id} (${cycle.intake.disposition}). Ask where it creates genuine pressure, contradiction, or connection within Root Logos.\n\nTreat the observation as attributable evidence, not constitutional truth. Preserve differences, expose uncertainty, and return a testable proposal rather than a canonical claim.`
      : `${cycle.lens.question}\n\nUse only the snapshotted Root Logos constitution as evidence. Preserve differences, expose uncertainty, and return a testable proposal rather than a canonical claim.`;
    cycle.phase = "prompted";
    appendEvent(cycle, "self-prompt-generated", { prompt_hash: digest(cycle.self_prompt) });
  } else if (cycle.phase === "prompted") {
    const intakeFindings = searchIntakeResonance(graph, cycle.intake);
    cycle.findings = [...intakeFindings, ...search(graph, cycle.lens)].slice(0, 12).map((finding, index) => ({ rank: index + 1, ...finding }));
    cycle.phase = "searched";
    appendEvent(cycle, "constitutional-search-completed", { findings: cycle.findings.length });
  } else if (cycle.phase === "searched") {
    cycle.findings = cycle.findings.map((finding) => ({
      ...finding,
      reconsideration: assessReconsideration(finding, memory, policy, state),
      evaluation: score(finding, graph)
    }))
      .sort((a, b) => b.evaluation.total - a.evaluation.total || a.rank - b.rank);
    cycle.selected_finding = cycle.findings.find((finding) =>
      finding.reconsideration.eligible &&
      finding.evaluation.total >= policy.evaluation.minimum_total_for_proposal &&
      finding.evaluation.dimensions.source_fidelity >= policy.evaluation.minimum_source_fidelity &&
      finding.evaluation.dimensions.corrigibility >= policy.evaluation.minimum_corrigibility) || null;
    cycle.phase = "evaluated";
    appendEvent(cycle, "findings-evaluated", {
      selected: cycle.selected_finding?.nodes || null,
      suppressed_repeats: cycle.findings.filter(({ reconsideration }) => !reconsideration.eligible).length
    });
  } else if (cycle.phase === "evaluated") {
    if (!cycle.selected_finding) {
      cycle.status = "completed-no-proposal";
      cycle.novelty = { score: 0, reason: "no-eligible-hypothesis" };
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
      cycle.novelty = {
        score: finding.reconsideration.novelty,
        reason: finding.reconsideration.reason,
        fingerprint: finding.reconsideration.fingerprint
      };
      rememberHypothesis(memory, cycle, finding, "proposed");
      cycle.status = "awaiting-human-review";
    }
    cycle.phase = "proposed";
    appendEvent(cycle, "proposal-written", { status: cycle.status });
    state.history.push({ cultivation_id: cycle.cultivation_id, status: cycle.status, proposal: Boolean(cycle.proposal) });
    state.active_cycle = null;
    state.status = "idle";
  } else throw new Error(`Cycle cannot step from phase ${cycle.phase}.`);
  await Promise.all([save(cycleUrl(cycle.cultivation_id), cycle), save(stateUrl, state), save(memoryUrl, memory)]);
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

const review = async (state, memory) => {
  const id = canonicalCultivationId(process.argv[3]);
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
  rememberHypothesis(memory, cycle, cycle.selected_finding, cycle.status);
  appendEvent(cycle, "human-review-recorded", { decision, reviewer });
  const history = state.history.find((entry) => entry.cultivation_id === id);
  if (history) history.status = cycle.status;
  await Promise.all([save(cycleUrl(id), cycle), save(stateUrl, state), save(memoryUrl, memory)]);
  process.stdout.write(`${id} ${cycle.status}; canonical sources unchanged.\n`);
};

const autonomousJudge = async (state, policy, memory, idOverride = null) => {
  const id = canonicalCultivationId(idOverride || process.argv[3]);
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
  rememberHypothesis(memory, cycle, cycle.selected_finding, cycle.status);
  appendEvent(cycle, "autonomous-judgment-recorded", {
    decision: cycle.autonomous_judgment.decision,
    risk: cycle.autonomous_judgment.risk,
    checks: cycle.autonomous_judgment.checks
  });
  const history = state.history.find((entry) => entry.cultivation_id === id);
  if (history) history.status = cycle.status;
  await Promise.all([save(cycleUrl(id), cycle), save(stateUrl, state), save(memoryUrl, memory)]);
  process.stdout.write(`${id} ${cycle.status}: ${cycle.autonomous_judgment.reason}\n`);
};

const applyAccepted = async (state, memory, idOverride = null) => {
  const id = canonicalCultivationId(idOverride || process.argv[3]);
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
  rememberHypothesis(memory, cycle, cycle.selected_finding, "implemented");
  appendEvent(cycle, "accepted-proposal-applied", { before: before.combined, after: after.combined });
  const history = state.history.find((entry) => entry.cultivation_id === id);
  if (history) history.status = cycle.status;
  await Promise.all([save(cycleUrl(id), cycle), save(stateUrl, state), save(memoryUrl, memory)]);
  process.stdout.write(`${id} applied ${operations.length} canonical operation${operations.length === 1 ? "" : "s"}; lineage archived.\n`);
};

const recordCycleYield = async (memory, cycle, policy) => {
  const score = cycle.novelty?.score ?? 0;
  memory.novelty.last_score = score;
  memory.novelty.history.push({
    cultivation_id: cycle.cultivation_id,
    score,
    reason: cycle.novelty?.reason || "unknown",
    status: cycle.status,
    at: new Date().toISOString()
  });
  if (score <= policy.novelty.low_yield_maximum) memory.novelty.consecutive_low_yield_cycles += 1;
  else memory.novelty.consecutive_low_yield_cycles = 0;
  const current = await sourceSnapshot();
  if (memory.novelty.consecutive_low_yield_cycles >= policy.novelty.dormancy_after_consecutive_low_yield_cycles) {
    memory.dormancy = {
      ...memory.dormancy,
      active: true,
      entered_at: new Date().toISOString(),
      reason: `${memory.novelty.consecutive_low_yield_cycles} consecutive low-yield cycles`,
      source_snapshot: { combined: current.combined, policy: digest(policy) }
    };
    memory.method_observations.push({
      type: "meta-refactoring-proposal",
      cultivation_id: cycle.cultivation_id,
      at: new Date().toISOString(),
      status: "proposed-for-human-review",
      evidence: memory.novelty.history.slice(-policy.novelty.dormancy_after_consecutive_low_yield_cycles),
      proposal: "The active inquiry methods have reached diminishing returns. Review candidate ranking, evidence extraction, and proposal grammar before increasing cadence or adding synthetic novelty."
    });
  }
  await save(memoryUrl, memory);
};

const rebuildHypothesisMemory = async (memory) => {
  const files = (await readdir(cyclesUrl)).filter((name) => name.endsWith(".json")).sort();
  const hypotheses = {};
  for (const file of files) {
    const cycle = await readJson(new URL(file, cyclesUrl));
    const finding = cycle.selected_finding;
    if (!finding) continue;
    const fingerprint = finding.reconsideration?.fingerprint || findingFingerprint(finding);
    const previous = hypotheses[fingerprint];
    hypotheses[fingerprint] = {
      fingerprint,
      kind: finding.kind,
      nodes: finding.nodes || [],
      claim: finding.claim,
      proposed_question: finding.proposed_question || null,
      evidence_hash: finding.reconsideration?.evidence_hash || findingEvidenceHash(finding),
      policy_hash: cycle.autonomous_judgment?.policy_hash || cycle.policy_hash,
      first_cycle: previous?.first_cycle || cycle.cultivation_id,
      last_cycle: cycle.cultivation_id,
      last_cycle_index: Number(cycle.cultivation_id.split("-").at(-1)),
      considerations: (previous?.considerations || 0) + 1,
      status: cycle.status,
      last_novelty_reason: finding.reconsideration?.reason || "historical-import",
      last_evaluation: finding.evaluation || null
    };
  }
  memory.hypotheses = hypotheses;
  await save(memoryUrl, memory);
  process.stdout.write(`Rebuilt hypothesis memory from ${files.length} cycles: ${Object.keys(hypotheses).length} distinct hypotheses.\n`);
};

const runCycle = async (state, policy, memory) => {
  if (state.active_cycle) throw new Error(`Cannot start an automatic cycle while ${state.active_cycle} is active.`);
  const current = await sourceSnapshot();
  const force = flags.has("--force");
  const intake = intakeContextPath ? await readJson(pathToFileURL(intakeContextPath)) : null;
  if (memory.dormancy.active) {
    const sourceChanged = memory.dormancy.source_snapshot?.combined !== current.combined;
    const policyChanged = memory.dormancy.source_snapshot?.policy !== digest(policy);
    if (!sourceChanged && !policyChanged && !force && !intake) {
      process.stdout.write(`Cultivation remains dormant: ${memory.dormancy.reason}. No source or policy change earned a wake event.\n`);
      return;
    }
    memory.dormancy.wake_history.push({
      at: new Date().toISOString(),
      reason: intake ? `admitted-observation:${intake.event_id}` : force ? "manual-force" : policyChanged ? "policy-changed" : "canonical-source-changed"
    });
    memory.dormancy.active = false;
    memory.dormancy.entered_at = null;
    memory.dormancy.reason = null;
    memory.novelty.consecutive_low_yield_cycles = 0;
    await save(memoryUrl, memory);
  }
  const id = `RL-CULTIVATE-${String(state.next_cycle).padStart(4, "0")}`;
  await start(state, policy, intake);
  for (let phase = 0; phase < 4; phase += 1) await step(state, policy, memory);
  let cycle = await readJson(cycleUrl(id));
  if (cycle.status !== "awaiting-human-review") {
    await recordCycleYield(memory, cycle, policy);
    process.stdout.write(`${id} completed without an autonomously judgeable proposal.\n`);
    return;
  }
  await autonomousJudge(state, policy, memory, id);
  cycle = await readJson(cycleUrl(id));
  if (cycle.status === "autonomously-accepted") {
    await applyAccepted(state, memory, id);
    cycle = await readJson(cycleUrl(id));
    process.stdout.write(`${id} completed with an autonomous low-risk refactoring.\n`);
  } else {
    process.stdout.write(`${id} completed with a preserved autonomous rejection.\n`);
  }
  await recordCycleYield(memory, cycle, policy);
};

const validate = async (state, policy, memory) => {
  const errors = [];
  if (state.version !== 1) errors.push("unsupported state version");
  if (memory.version !== 1) errors.push("unsupported memory version");
  for (const [fingerprint, hypothesis] of Object.entries(memory.hypotheses || {})) {
    if (fingerprint !== hypothesis.fingerprint) errors.push(`hypothesis memory key mismatch: ${fingerprint}`);
    if (!hypothesis.last_cycle) errors.push(`hypothesis memory lacks last cycle: ${fingerprint}`);
  }
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
    if (cycle.proposal && cycle.proposal.canonical_mutation_performed !== false) errors.push(`${file}: proposal lacks non-mutation boundary`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  process.stdout.write(`PASS cultivation state; ${files.length} cycle archive${files.length === 1 ? "" : "s"} verified.\n`);
};

const main = async () => {
  const [state, policy, memory] = await Promise.all([readJson(stateUrl), readJson(policyUrl), readJson(memoryUrl)]);
  if (command === "start") return start(state, policy, intakeContextPath ? await readJson(pathToFileURL(intakeContextPath)) : null);
  if (command === "step") return step(state, policy, memory);
  if (command === "pause") return pause(state);
  if (command === "resume") return resume(state);
  if (command === "validate") return validate(state, policy, memory);
  if (command === "review") return review(state, memory);
  if (command === "judge") return autonomousJudge(state, policy, memory);
  if (command === "apply") return applyAccepted(state, memory);
  if (command === "cycle") return runCycle(state, policy, memory);
  if (command === "rebuild-memory") return rebuildHypothesisMemory(memory);
  if (command === "status") {
    process.stdout.write(`${state.status}; active=${state.active_cycle || "none"}; completed=${state.history.length}; next=${state.next_cycle}; hypotheses=${Object.keys(memory.hypotheses).length}; dormant=${memory.dormancy.active}\n`);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
