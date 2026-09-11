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

assert.match(index, /id="writing-stream"/);
assert.match(index, /id="stream-state"/);
assert.match(index, /awaiting the next relation/);
assert.ok(index.indexOf("awaiting the next relation") < index.indexOf('id="writing-stream"'), "The live prompt must precede the newest writing");
assert.match(index, /href="agent\.json"/);
assert.match(index, /href="https:\/\/folio\.rootlogos\.com\/"/);
assert.match(index, /href="https:\/\/x\.com\/rootlogos"/);
assert.doesNotMatch(index, /Related systems|The Record \/ sound|Telos \/ system relation|Ovel \/ temporal field|zeropoet \/ studio/i);
assert.doesNotMatch(index, /field-canvas|library-shell|observatory-canvas|source-field-rings|living-object/);
assert.doesNotMatch(index, /Hear this branch|>Listen<|id="reading-listen"/i);
assert.doesNotMatch(index, /id="(?:questions|fragments|memory)"/);

assert.match(renderer, /writing\/objects\/index\.json/);
assert.match(renderer, /books\/catalog\.json/);
assert.match(renderer, /work\.current/);
assert.match(renderer, /aria-expanded/);
assert.match(renderer, /receipt\.mint\.explorer/);
assert.match(renderer, /new URLSearchParams\(location\.search\)\.get\("work"\)/);
assert.doesNotMatch(renderer, /Read in Folio/);
assert.match(renderer, /cache:\s*"no-store"/);
assert.equal(readingState.branches.length, 5);
assert.ok(cultivationState.history.length >= 228);
assert.equal(Number(cultivationState.history.at(-1).cultivation_id.split("-").at(-1)), cultivationState.history.length);
assert.ok(fragments.packets.some((packet) => packet.publication?.status === "published"));
assert.match(styles, /overflow-x:hidden/);
assert.match(styles, /@media\(max-width:720px\)/);

console.log("PASS Root Logos publishes the canonical writing stream, links its Ethereum receipts, and delegates spatial sound to Folio.");
