#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const valueAfter = (flag) => process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null;
const cycleId = valueAfter("--cycle");
const eventId = valueAfter("--event");
const iso = () => new Date().toISOString();
const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const atomicJson = async (path, value) => {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, json(value), { mode: 0o600 });
  await rename(temporary, path);
};

const nextRevision = (revision) => {
  const match = String(revision || "v1.0").match(/^v(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return "v1.0.1";
  return `v${match[1]}.${match[2]}.${Number(match[3] || 0) + 1}`;
};

export const considerSelfAuthorship = async ({ projectRoot = root, cultivationId = cycleId, sourceEventId = eventId } = {}) => {
  if (!cultivationId) throw new Error("Usage: self-author.mjs consider --cycle <RL-CULTIVATE-id> [--event <event-id>]");
  const currentPath = join(projectRoot, "self-authorship", "current.json");
  const policyPath = join(projectRoot, "self-authorship", "policy.json");
  const graphPath = join(projectRoot, "content", "constitutional-graph.json");
  const cyclePath = join(projectRoot, "cultivation", "cycles", `${cultivationId}.json`);
  const lineageDir = join(projectRoot, "self-authorship", "lineage");
  const [current, policy, graph, cycle] = await Promise.all([
    readJson(currentPath), readJson(policyPath), readJson(graphPath), readJson(cyclePath)
  ]);
  if (policy.status !== "authorized-boundary-active" || policy.identity_model?.canonical_instances !== 1) {
    throw new Error("Constitutional self-authorship authority is not active or singular.");
  }
  const operationCount = cycle.application?.operations?.length || 0;
  const material = cycle.status === "implemented" && operationCount > 0;
  const privacyPassed = !JSON.stringify(cycle).match(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|secret|password|token)\s*[:=]\s*\S{8,}/i);
  const judgment = {
    identity_necessity: material ? "A canonical topology change requires the current identity to acknowledge its new relational condition." : "No implemented topology change requires an identity rewrite.",
    source_fidelity: Boolean(cycle.source_snapshot?.combined),
    cross_surface_coherence: "The public interface reads the single current manifest and canonical graph at runtime.",
    narrative_compression: material ? "One present-tense sentence records the changed topology without reproducing source prose." : "Current narrative remains the smaller adequate account.",
    counterargument: material ? "A graph change may be too local to warrant identity revision; metadata-only continuity would be less disruptive." : "Preserving the current identity may understate a meaningful but rejected inquiry.",
    drift_analysis: cycle.source_drift?.detected ? "failed" : "passed",
    privacy_audit: privacyPassed ? "passed" : "failed",
    reversibility: "Prior manifest is archived before atomic replacement.",
    verification: material && privacyPassed ? "passed" : "preserve-current",
    decision: material && privacyPassed ? "rewrite" : "preserve",
    at: iso()
  };
  const record = {
    schema: "root-logos-identity-lineage/v1",
    cultivation_id: cultivationId,
    source_event_id: sourceEventId || null,
    previous_revision: current.revision,
    judgment,
    previous_identity: current,
    candidate_identity: null
  };
  if (judgment.decision === "rewrite") {
    const titles = cycle.selected_finding?.titles?.slice(0, 3) || cycle.proposal?.affected_nodes?.slice(0, 3) || [];
    const revision = nextRevision(current.revision);
    const candidate = {
      ...current,
      revision,
      effective_at: iso(),
      narrative: {
        ...current.narrative,
        present: `Root Logos currently holds ${graph.nodes.length} constitutional structures across ${graph.edges.length} explicit relations${titles.length ? `; its latest accepted change joined ${titles.join(", ")}` : ""}.`
      },
      source_lineage: [...new Set([...(current.source_lineage || []), cultivationId, ...(sourceEventId ? [sourceEventId] : [])])],
      supersedes: current.revision,
      signature: `self-authored:${cultivationId}:${digest({ cultivationId, sourceEventId, graph: graph.meta, operations: cycle.application.operations }).slice(0, 24)}`
    };
    record.candidate_identity = candidate;
    await mkdir(lineageDir, { recursive: true });
    await atomicJson(join(lineageDir, `${cultivationId}.json`), record);
    await atomicJson(currentPath, candidate);
    return { decision: "rewrite", revision, lineage: `self-authorship/lineage/${cultivationId}.json` };
  }
  await mkdir(lineageDir, { recursive: true });
  await atomicJson(join(lineageDir, `${cultivationId}.json`), record);
  return { decision: "preserve", revision: current.revision, lineage: `self-authorship/lineage/${cultivationId}.json` };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  considerSelfAuthorship().then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
