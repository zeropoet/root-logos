import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
const [index, renderer, styles, readingState, cultivationState, fragments] = await Promise.all([
  read("index.html"),
  read("weave.js"),
  read("weave.css"),
  read("reading/state.json").then(JSON.parse),
  read("cultivation/state.json").then(JSON.parse),
  read("content/attractor-packets.json").then(JSON.parse)
]);

const publicOrder = ["current-reading", "questions", "fragments", "memory"].map((id) => index.indexOf('id="' + id + '"'));
assert.deepEqual([...publicOrder].sort((a, b) => a - b), publicOrder);
for (const id of ["reading-prose", "question-list", "fragment-list", "branch-count", "cycle-count", "thinking-state"]) {
  assert.match(index, new RegExp('id="' + id + '"'));
}

assert.match(index, /A living publication/);
assert.match(index, /It reads to deepen a question/);
assert.match(index, /Payment opens the boundary\. It does not purchase agreement, authorship, or authority\./);
assert.match(index, /href="agent\.json"/);
assert.match(index, /https:\/\/record\.zeropoet\.xyz\//);
assert.match(index, /The related systems remain independently governed/);
assert.doesNotMatch(index, /field-canvas|library-shell|observatory-canvas|source-field-rings|living-object/);
assert.doesNotMatch(index, /Hear this branch|>Listen<|id="reading-listen"/i);

assert.match(renderer, /reading\/sequence-52-55\.md/);
assert.match(renderer, /reading\/state\.json/);
assert.match(renderer, /content\/attractor-packets\.json/);
assert.match(renderer, /cultivation\/state\.json/);
assert.match(renderer, /cache:\s*"no-store"/);
assert.equal(readingState.branches.length, 5);
assert.equal(cultivationState.history.length, 226);
assert.ok(fragments.packets.some((packet) => packet.publication?.status === "published"));
assert.match(styles, /overflow-x:hidden/);
assert.match(styles, /@media\(max-width:780px\)/);

console.log("PASS Root Logos publishes reading, questions, fragments, memory, and a bounded agent entrance without restoring the retired visual surface.");
