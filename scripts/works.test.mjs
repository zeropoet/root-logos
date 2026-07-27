import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ingestWork } from "./works.mjs";

const fixture = await mkdtemp(join(tmpdir(), "root-logos-work-"));
const book = join(fixture, "book");
const indexPath = join(new URL("..", import.meta.url).pathname, "works", "index.json");
const originalIndex = await readFile(indexPath, "utf8");
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

await rm(join(new URL("..", import.meta.url).pathname, "works", first.work_id), { recursive: true, force: true });
await writeFile(indexPath, originalIndex);
await rm(fixture, { recursive: true, force: true });

process.stdout.write("Living works ingestion tests passed.\n");
