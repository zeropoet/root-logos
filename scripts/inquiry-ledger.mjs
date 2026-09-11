import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, "inquiry");
const check = process.argv.includes("--check");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const slug = (id) => id.replace(/^question-/, "").replace("ai-citizenship", "machine-citizenship");

const writeOrCheck = async (path, value) => {
  const content = canonical(value);
  if (check) {
    const existing = await readFile(path, "utf8").catch(() => "");
    if (existing !== content) throw new Error(`${path} is not synchronized`);
    return content;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return content;
};

const graph = JSON.parse(await readFile(join(root, "content", "constitutional-graph.json"), "utf8"));
const memory = JSON.parse(await readFile(join(root, "cultivation", "memory.json"), "utf8"));
const questions = graph.nodes.filter(({ type }) => type === "open-question");
const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
const hypotheses = Object.values(memory.hypotheses || {});
const records = [];

for (const question of questions) {
  const directory = slug(question.id);
  const directRelations = graph.edges.filter(({ from, to }) => from === question.id || to === question.id);
  const findings = hypotheses
    .filter(({ nodes }) => nodes?.includes(question.id))
    .sort((left, right) => left.last_cycle_index - right.last_cycle_index || left.fingerprint.localeCompare(right.fingerprint));
  const fruitIds = [...new Set(findings.flatMap(({ nodes }) => nodes || []).filter((id) => id !== question.id))].sort();
  const history = {
    schema: "root-logos-inquiry-history/v1",
    inquiry_id: question.id,
    events: [
      {
        kind: "constitutional-question-preserved",
        source: "content/constitutional-graph.json",
        status: question.status.toLowerCase(),
        statement: question.title
      },
      ...findings.map((finding) => ({
        kind: finding.kind,
        first_cycle: finding.first_cycle,
        last_cycle: finding.last_cycle,
        considerations: finding.considerations,
        disposition: finding.status,
        claim: finding.claim,
        proposed_question: finding.proposed_question,
        related_nodes: finding.nodes.filter((id) => id !== question.id),
        evidence_hash: finding.evidence_hash,
        policy_hash: finding.policy_hash
      }))
    ]
  };
  const historyContent = canonical(history);
  const current = {
    schema: "root-logos-inquiry-current/v1",
    inquiry_id: question.id,
    title: question.title,
    original_formulation: question.summary,
    status: question.status.toLowerCase(),
    answer_state: "not-settled",
    present_position: "The inquiry has gained structure and testable relations, but Root Logos does not claim a final answer.",
    progress: {
      direct_relation_count: directRelations.length,
      cultivation_finding_count: findings.length,
      latest_cultivation_cycle: findings.at(-1)?.last_cycle || null,
      structurally_integrated: directRelations.length > 0
    },
    direct_relations: directRelations,
    fruits: fruitIds.map((id) => ({ id, title: nodeById.get(id)?.title || nodeById.get(id)?.label || id, type: nodeById.get(id)?.type || "unresolved-reference" })),
    contributions: {
      readings: [],
      writings: [],
      operational_proofs: [],
      policy: "A contribution enters only when its canonical source explicitly declares that it materially changes this inquiry. Similarity alone is insufficient."
    },
    history: `inquiry/${directory}/history.json`,
    history_witness: `sha256:${sha256(historyContent)}`,
    visibility: "system-ledger; no public-interface obligation"
  };
  await writeOrCheck(join(outputRoot, directory, "history.json"), history);
  const currentContent = await writeOrCheck(join(outputRoot, directory, "current.json"), current);
  records.push({
    inquiry_id: question.id,
    title: question.title,
    status: current.status,
    answer_state: current.answer_state,
    direct_relation_count: current.progress.direct_relation_count,
    cultivation_finding_count: current.progress.cultivation_finding_count,
    current: `inquiry/${directory}/current.json`,
    witness: `sha256:${sha256(currentContent)}`
  });
}

await writeOrCheck(join(outputRoot, "index.json"), {
  schema: "root-logos-inquiry-index/v1",
  purpose: "Preserve the progress of Root Logos' foundational inquiries as later fruits exceed their original scope without competing with the public reading and writing surface.",
  public_interface: false,
  synchronization: {
    sources: ["content/constitutional-graph.json", "cultivation/memory.json"],
    command: "npm run inquiry:sync",
    enforcement: "npm test fails when the ledger is stale; the cultivation workflow regenerates it whenever canonical inquiry state changes."
  },
  inquiries: records
});

console.log(`${check ? "Verified" : "Synchronized"} ${records.length} foundational inquiries.`);
