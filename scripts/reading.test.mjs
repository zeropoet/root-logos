import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const [policy, state, corpus, html, script, sequence] = await Promise.all([
  readJson("reading/policy.json"),
  readJson("reading/state.json"),
  readJson("works/corpora/original-douay-rheims.json"),
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("weave.js", root), "utf8"),
  readFile(new URL("reading/sequence-52-55.md", root), "utf8")
]);

assert.equal(policy.status, "active");
assert.deepEqual(policy.sequence, ["question", "selected-reading", "structural-listening", "derived-grammar", "textual-and-tonal-experiments"]);
assert.ok(policy.admission.full_ingestion_allowed_when.includes("public-domain"));
assert.ok(policy.admission.metadata_only_when.includes("copyrighted-without-ingestion-authority"));
assert.ok(policy.admission.prohibited.some((rule) => rule.includes("living author")));

assert.equal(state.next_branch_sequence, state.branches.length + 1);
assert.equal(new Set(state.branches.map(({ branch_id }) => branch_id)).size, state.branches.length);
for (const branch of state.branches) {
  assert.match(branch.branch_id, /^RL-READING-\d{4}$/);
  assert.ok(branch.question.text && branch.question.origin);
  assert.ok(branch.reading.selection_reason && branch.reading.rights_basis && branch.reading.available_material);
  assert.ok(branch.structural_listening.length >= 1);
  assert.ok(branch.derived_grammar.rules.length >= 1);
  assert.ok(branch.experiments.textual.utterance.length >= 1);
  assert.ok(branch.experiments.tonal.duration_seconds <= 12, "A tonal utterance must remain brief.");
  assert.ok(branch.experiments.tonal.events.every(({ source, at, duration }) => source && at >= 0 && duration > 0));
  assert.ok(branch.provenance.expression_origin && branch.provenance.source_witness);
}

const first = state.branches[0];
assert.equal(first.reading.identity, corpus.corpus_id);
assert.equal(first.provenance.source_witness, corpus.source_witness);
assert.match(html, /id="current-reading"/);
assert.match(html, /id="reading-prose"/);
assert.match(html, /The questions<br>doing the work\./);
assert.doesNotMatch(html, /id="reading-listen"/);
assert.match(script, /const parseReadings/);
assert.match(script, /const renderReading/);
for (const [number, title] of [
  [52, "The Boundary of the Executable"],
  [53, "The System Cannot Close Itself"],
  [54, "What Exists Is Becoming"],
  [55, "A Structure That Can Be Inhabited"]
]) {
  assert.match(sequence, new RegExp("## " + number + " — " + title));
}

console.log("Root Logos reading policy, five branches, rights boundaries, writings, and tonal provenance are coherent.");
