import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coherentLibraryIdentity, ingestWork, parseGutenbergBookText, parseMidvashBible, parseMidvashBibleBook, parsePerseusTei } from "./works.mjs";
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
const coherentIdentity = coherentLibraryIdentity({
  works: [
    { work_id: "root", current_edition: "root-v1", collection: null },
    { work_id: "genesis", current_edition: "genesis-v1", collection: "Original Douay-Rheims Catholic Canon" },
    { work_id: "exodus", current_edition: "exodus-v1", collection: "Original Douay-Rheims Catholic Canon" }
  ]
}, { corpus_id: "bible", current_sound_edition: "bible-v1" });
assert.equal(coherentIdentity.workCount, 2);
assert.match(coherentIdentity.signature, /^[0-9a-f]{64}$/);
const euclidFixture = parsePerseusTei(`<?xml version="1.0"?>
<TEI><teiHeader><fileDesc><titleStmt><title>Euclid Test</title></titleStmt></fileDesc></teiHeader>
<text><body><div type="translation">
<div type="textpart" subtype="book" n="1">
  <div type="textpart" subtype="type" n="def">
    <div type="textpart" subtype="number" n="1"><p>A point is that which has no part.</p></div>
  </div>
  <div type="textpart" subtype="type" n="prop">
    <div type="textpart" subtype="number" n="1"><p>On a given finite straight line to construct an equilateral triangle.</p></div>
  </div>
</div>
</div></body></text></TEI>`);
assert.equal(euclidFixture.title, "Euclid Test");
assert.equal(euclidFixture.documents.length, 1);
assert.equal(euclidFixture.documents[0].title, "Book I");
assert.deepEqual(euclidFixture.documents[0].sections.map(({ coordinate }) => coordinate), [
  "book:1:def:1", "book:1:prop:1"
]);
const gutenbergFixture = parseGutenbergBookText(`Project Gutenberg header
*** START OF THIS PROJECT GUTENBERG EBOOK TEST ***

BOOK I

The first book begins.

BOOK II

The second book answers.

*** END OF THIS PROJECT GUTENBERG EBOOK TEST ***`);
assert.deepEqual(gutenbergFixture.documents.map(({ path }) => path), ["book:1", "book:2"]);
assert.equal(gutenbergFixture.documents[0].sections[0].text, "The first book begins.");
assert.equal(gutenbergFixture.documents[1].sections[0].text, "The second book answers.");
const protestantFixture = parseMidvashBible(JSON.stringify({
  name: "Test Protestant Bible",
  books: [
    ...Array.from({ length: 39 }, (_, index) => ({
      book: `OT${index + 1}`, englishName: `Old Book ${index + 1}`, testament: "OT",
      chapters: [{ chapter: 1, verses: [{ number: 1, text: `Old witness ${index + 1}.` }] }]
    })),
    ...Array.from({ length: 27 }, (_, index) => ({
      book: `NT${index + 1}`, englishName: `New Book ${index + 1}`, testament: "NT",
      chapters: [{ chapter: 1, verses: [{ number: 1, text: `New witness ${index + 1}.` }] }]
    }))
  ]
}));
assert.equal(protestantFixture.documents.length, 66);
assert.equal(protestantFixture.measures.chapters, 66);
assert.equal(protestantFixture.measures.verses, 66);
assert.equal(protestantFixture.documents[0].path, "book:OT1");
assert.equal(protestantFixture.documents.at(-1).title, "New Book 27");
const protestantBookFixture = parseMidvashBibleBook(JSON.stringify({
  version: "kjv", book: "Gen", bookId: 1, englishName: "Genesis", testament: "OT",
  chapters: [
    { chapter: 1, verses: [{ number: 1, text: "The beginning is witnessed." }, { number: 2, text: "The deep answers." }] },
    { chapter: 2, verses: [{ number: 1, text: "The work enters rest." }] }
  ]
}));
assert.equal(protestantBookFixture.documents.length, 2);
assert.equal(protestantBookFixture.documents[0].sections.length, 2);
assert.equal(protestantBookFixture.documents[0].sections[0].coordinate, "Gen:1:1");
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
assert.equal(edition.coordinate_system.schema, "root-logos-canonical-work-coordinate-system/v1");
assert.ok(edition.coordinate_system.origin.endsWith("/work"));
assert.ok(edition.visual.topology.nodes.every(({ canonical_coordinate }) => canonical_coordinate?.startsWith("root://work/")));
assert.ok(edition.visual.topology.edges.every(({ canonical_coordinate, from_coordinate, to_coordinate }) =>
  canonical_coordinate?.includes("/relation/") && from_coordinate && to_coordinate
));
assert.equal(edition.measures.documents, 2);
assert.ok(edition.measures.sections >= 3);
assert.ok(edition.visual.topology.nodes.length > 3);
assert.ok(edition.visual.topology.edges.length > 1);
assert.equal(edition.sound.events.length, 84);
assert.match(edition.sound.signature, /^[0-9a-f]{12}$/);
assert.equal(edition.sound.composition_inheritance.source_id, "foldforge");
assert.equal(edition.sound.events.filter(({ composition_source }) => composition_source === "foldforge").length, 12);

const contextual = await ingestWork({
  input: book, title: "Test Work", author: "Root Logos Test", kind: "novel",
  source: "fixture:test-work", rootRevision: "test-v1",
  readingContext: {
    kind: "library-addition",
    trigger_work_id: "fixture-trigger",
    trigger_edition: "fixture-trigger--v1",
    library_signature: "fixture-library-signature",
    work_count: 2
  }
});
const contextualEdition = JSON.parse(await readFile(join(
  new URL("..", import.meta.url).pathname, "works", contextual.work_id, "editions", contextual.current_edition, "edition.json"
), "utf8"));
assert.notEqual(contextual.current_edition, first.current_edition);
assert.equal(contextualEdition.parent_edition, first.current_edition);
assert.equal(contextualEdition.reading_context.trigger_work_id, "fixture-trigger");
assert.notEqual(contextualEdition.sound.signature, edition.sound.signature);

const germanBook = join(fixture, "german-book");
await mkdir(germanBook);
await writeFile(join(germanBook, "01.md"), "# Prüfung\n\nSiddhartha hatte nicht seine Ruhe gefunden. Siddhartha suchte Erkenntnis und lauschte dem Fluss. 𝑎𝑛 ﬁnite ﬁnite.\n");
const german = await ingestWork({
  input: germanBook, title: "German Test Work", author: "Root Logos Test",
  kind: "novel", source: "fixture:german-work", language: "de",
  transformation: "deterministic-structural-reading/v3-de-stopwords",
  rootRevision: "test-v1"
});
const germanEdition = JSON.parse(await readFile(join(
  new URL("..", import.meta.url).pathname, "works", german.work_id, "editions", german.current_edition, "edition.json"
), "utf8"));
const germanConcepts = germanEdition.reading.dominant_concepts.map(({ concept }) => concept);
assert.ok(germanConcepts.includes("siddhartha"));
assert.ok(germanConcepts.includes("erkenntnis"));
assert.ok(germanConcepts.includes("finite"));
assert.ok(!germanConcepts.includes("hatte"));
assert.ok(!germanConcepts.includes("nicht"));
assert.ok(!germanConcepts.includes("seine"));
assert.ok(!germanConcepts.includes("𝑎𝑛"));

const spanishBook = join(fixture, "spanish-book");
await mkdir(spanishBook);
await writeFile(join(spanishBook, "01.md"), "# Prueba\n\nLa identidad fundamental de existir, soñar y representar inspiró formas. Todo estaba entre los sueños, pero la identidad persistía.\n");
const spanish = await ingestWork({
  input: spanishBook, title: "Spanish Test Work", author: "Root Logos Test",
  kind: "short prose", source: "fixture:spanish-work", language: "es",
  transformation: "deterministic-structural-reading/v3-es-stopwords",
  rootRevision: "test-v1"
});
const spanishEdition = JSON.parse(await readFile(join(
  new URL("..", import.meta.url).pathname, "works", spanish.work_id, "editions", spanish.current_edition, "edition.json"
), "utf8"));
const spanishConcepts = spanishEdition.reading.dominant_concepts.map(({ concept }) => concept);
assert.ok(spanishConcepts.includes("identidad"));
assert.ok(spanishConcepts.includes("sueños"));
assert.ok(!spanishConcepts.includes("todo"));
assert.ok(!spanishConcepts.includes("estaba"));
assert.ok(!spanishConcepts.includes("entre"));

const japaneseBook = join(fixture, "japanese-book");
await mkdir(japaneseBook);
await writeFile(join(japaneseBook, "01.md"), "# 兵法\n\n兵法の道を学ぶこと。武士は剣術を鍛錬し、兵法を実践する。\n");
const japanese = await ingestWork({
  input: japaneseBook, title: "Japanese Test Work", author: "Root Logos Test",
  kind: "strategy", source: "fixture:japanese-work", language: "ja",
  transformation: "deterministic-structural-reading/v5-ja-segmentation",
  rootRevision: "test-v1"
});
const japaneseEdition = JSON.parse(await readFile(join(
  new URL("..", import.meta.url).pathname, "works", japanese.work_id, "editions", japanese.current_edition, "edition.json"
), "utf8"));
const japaneseConcepts = japaneseEdition.reading.dominant_concepts.map(({ concept }) => concept);
assert.ok(japaneseConcepts.includes("兵法"));
assert.ok(japaneseConcepts.includes("武士"));
assert.ok(!japaneseConcepts.includes("の"));
assert.ok(!japaneseConcepts.includes("こと"));

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
await rm(join(new URL("..", import.meta.url).pathname, "works", german.work_id), { recursive: true, force: true });
await rm(join(new URL("..", import.meta.url).pathname, "works", spanish.work_id), { recursive: true, force: true });
await rm(join(new URL("..", import.meta.url).pathname, "works", japanese.work_id), { recursive: true, force: true });
await rm(join(new URL("..", import.meta.url).pathname, "works", privateWork.work_id), { recursive: true, force: true });
await writeFile(indexPath, originalIndex);
await rm(fixture, { recursive: true, force: true });

process.stdout.write("Living works ingestion tests passed.\n");
