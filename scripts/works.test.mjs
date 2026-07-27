import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestWork } from "./works.mjs";
import { CATHOLIC_CANON } from "./works-corpus.mjs";

const fixture = await mkdtemp(join(tmpdir(), "root-logos-work-"));
const book = join(fixture, "book");
const indexPath = join(new URL("..", import.meta.url).pathname, "works", "index.json");
const originalIndex = await readFile(indexPath, "utf8");
assert.equal(CATHOLIC_CANON.length, 73);
assert.equal(new Set(CATHOLIC_CANON.map(({ id }) => id)).size, 73);
assert.equal(CATHOLIC_CANON.filter(({ division }) => division === "Old Testament").length, 46);
assert.equal(CATHOLIC_CANON.filter(({ division }) => division === "New Testament").length, 27);
assert.deepEqual(CATHOLIC_CANON.map(({ order }) => order), Array.from({ length: 73 }, (_, index) => index + 1));
await mkdir(book);
await writeFile(join(book, "01.md"), "# Part One\n\nLight enters the chamber. Memory answers light.\n\n## Scene\n\nA witness returns through time.\n");
await writeFile(join(book, "02.md"), "# Part Two\n\nThe chamber holds silence. Light and witness become relation.\n");

const first = await ingestWork({
  input: book, title: "Test Work", author: "Root Logos Test", kind: "novel",
  source: "fixture:test-work", rootRevision: "test-v1"
});
const edition = JSON.parse(await readFile(join(
  new URL("..", import.meta.url).pathname, "works", first.work_id, "editions", first.current_edition, "edition.json"
), "utf8"));

assert.equal(edition.schema, "root-logos-work-edition/v1");
assert.equal(edition.measures.documents, 2);
assert.ok(edition.measures.sections >= 3);
assert.ok(edition.visual.topology.nodes.length > 3);
assert.ok(edition.visual.topology.edges.length > 1);
assert.equal(edition.sound.events.length, 72);
assert.match(edition.sound.signature, /^[0-9a-f]{12}$/);

const scripturePath = join(fixture, "genesis.json");
await writeFile(scripturePath, JSON.stringify({
  book: "genesis",
  short_title: "Genesis Test",
  intros: [{ title: "Argument", text: "A private introduction." }],
  chapters: [
    { chapter: 1, summary: "The first chapter.", verses: [
      { verse: 1, text: "Private source language creates the beginning." },
      { verse: 2, text: "Private source language witnesses the deep." }
    ] },
    { chapter: 2, verses: [{ verse: 1, text: "The private work enters rest." }] }
  ]
}));
const privateWork = await ingestWork({
  input: scripturePath, title: "Genesis Test", author: "Traditional",
  kind: "scripture", format: "douay-rheims-json", sourceVisibility: "private",
  sourceWitness: "fixture@abc123", translation: "Test translation",
  rights: "CC0 1.0", rootRevision: "test-v1"
});
const privateManifestPath = join(new URL("..", import.meta.url).pathname, "works", privateWork.work_id, "manifest.json");
const privateManifest = JSON.parse(await readFile(privateManifestPath, "utf8"));
const privateEditionText = await readFile(join(
  new URL("..", import.meta.url).pathname, "works", privateWork.work_id, "editions", privateWork.current_edition, "edition.json"
), "utf8");
assert.equal(privateManifest.source, null);
assert.equal(privateManifest.source_visibility, "private");
assert.equal(privateManifest.source_retained, false);
assert.equal(privateManifest.source_witness.identity, "fixture@abc123");
assert.ok(!privateEditionText.includes("Private source language"));

await rm(join(new URL("..", import.meta.url).pathname, "works", first.work_id), { recursive: true, force: true });
await rm(join(new URL("..", import.meta.url).pathname, "works", privateWork.work_id), { recursive: true, force: true });
await writeFile(indexPath, originalIndex);
await rm(fixture, { recursive: true, force: true });

process.stdout.write("Living works ingestion tests passed.\n");
