import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coherentLibraryIdentity, ingestWork, parseCalculatingEngineText, parseFederalistText, parseGilgameshText, parseGutenbergBookText, parseLawsOfThoughtTex, parseMachineStopsText, parseMidvashBible, parseMidvashBibleBook, parsePerseusTei, parseSiddharthaGermanText, parseTaoTeChingText, parseUnitedStatesConstitutionText, parseWisdomEpubXhtml } from "./works.mjs";
import { CATHOLIC_CANON, deriveCorpusStructuralDepth } from "./works-corpus.mjs";

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
const corpusDepth = deriveCorpusStructuralDepth({
  nodes: [
    { id: "one", current_edition: "one-v4" },
    { id: "two", current_edition: "two-v4" },
    { id: "three", current_edition: "three-v4" }
  ],
  edges: [
    { from: "one", to: "two", relation: "shared-derived-language", weight: 4 },
    { from: "two", to: "three", relation: "shared-derived-language", weight: 3 }
  ]
});
assert.match(corpusDepth.signature, /^[0-9a-f]{16}$/);
assert.deepEqual(corpusDepth.relation_profile, { contains: 3, "shared-derived-language": 2 });
assert.equal(corpusDepth.relation_density, 0.8333);
assert.ok(corpusDepth.relation_weight_entropy > 0);
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
const epubFixture = parseWisdomEpubXhtml(`<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body>
<h1>Chapter One</h1><h2><i>Luminous Ground</i></h2>
<p>Awareness enters relation &amp; remains attributable.</p>
<p><img alt="equation" data-tex="\\mathrm{V}_{2} = \\frac{A}{B}" src="equation.svg" /></p>
<h3>Second Movement</h3><p>Form does not erase emptiness.</p>
</body></html>`, "OEBPS/c01.html");
assert.equal(epubFixture.title, "Luminous Ground");
assert.deepEqual(epubFixture.sections.map(({ title }) => title), ["Luminous Ground", "Second Movement"]);
assert.equal(epubFixture.sections[0].text, "Awareness enters relation & remains attributable. V 2 = A B");
const calculatingEngineFixture = parseCalculatingEngineText(`*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
THE CALCULATING ENGINE
BY CHARLES BABBAGE
${"Calculation mechanism tables difference engine printing accuracy. ".repeat(1800)}
*** END OF THE PROJECT GUTENBERG EBOOK TEST ***`);
assert.equal(calculatingEngineFixture.documents.length, 1);
assert.equal(calculatingEngineFixture.documents[0].path, "article:1");
const lawsChapters = ["PREFACE.", "CONTENTS.", "NATURE AND DESIGN OF THIS WORK",
  ...Array.from({ length: 20 }, (_, index) => `CHAPTER ${index + 2}`), "CONSTITUTION OF THE INTELLECT"];
const lawsFixture = parseLawsOfThoughtTex(`*** START OF THIS PROJECT GUTENBERG EBOOK LAWS OF THOUGHT ***
${lawsChapters.map((title) => `\\chapter[${title}]{\\large ${title}}\nReasoning \\textsc{enters relation} through $x \\times y$.`).join("\n")}
*** END OF THE PROJECT GUTENBERG EBOOK AN INVESTIGATION OF THE LAWS OF THOUGHT ***`);
assert.equal(lawsFixture.documents.length, 23);
assert.equal(lawsFixture.documents[0].title, "PREFACE.");
assert.match(lawsFixture.documents[1].sections[0].text, /Reasoning enters relation through x multiplied by y/);
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
const gutenbergPartFixture = parseGutenbergBookText(`*** START OF THE PROJECT GUTENBERG EBOOK TEST ***

PART I

The first part descends.

PART II

The second part returns.

*** END OF THE PROJECT GUTENBERG EBOOK TEST ***`);
assert.deepEqual(gutenbergPartFixture.documents.map(({ path }) => path), ["part:1", "part:2"]);
assert.equal(gutenbergPartFixture.documents[0].sections[0].title, "Part I");
assert.equal(gutenbergPartFixture.documents[1].sections[0].text, "The second part returns.");
const gutenbergChapterFixture = parseGutenbergBookText(`*** START OF THE PROJECT GUTENBERG EBOOK TEST ***

CHAPTER I. A TABLE-OF-CONTENTS ENTRY.

CHAPTER I

The first chapter varies.

CHAPTER II

The second chapter is selected.

*** END OF THE PROJECT GUTENBERG EBOOK TEST ***`);
assert.deepEqual(gutenbergChapterFixture.documents.map(({ path }) => path), ["chapter:1", "chapter:2"]);
assert.equal(gutenbergChapterFixture.documents[0].sections[0].title, "Chapter I");
assert.equal(gutenbergChapterFixture.documents[1].sections[0].text, "The second chapter is selected.");
const gutenbergSectionFixture = parseGutenbergBookText(`*** START OF THE PROJECT GUTENBERG EBOOK TEST ***

Contents

 I. FIRST SECTION
 II. SECOND SECTION

I.
FIRST SECTION

The first position is declared.

II.
SECOND SECTION

The second position responds.

*** END OF THE PROJECT GUTENBERG EBOOK TEST ***`);
assert.deepEqual(gutenbergSectionFixture.documents.map(({ path }) => path), ["section:1", "section:2"]);
assert.equal(gutenbergSectionFixture.documents[0].title, "Section I: FIRST SECTION");
assert.equal(gutenbergSectionFixture.documents[1].sections[0].text, "The second position responds.");
const gutenbergTitledChapterFixture = parseGutenbergBookText(`*** START OF THE PROJECT GUTENBERG EBOOK TEST ***

Chapter I. LAYING PLANS

The first chapter.

Chapter II. WAGING WAR

The second chapter.

*** END OF THE PROJECT GUTENBERG EBOOK TEST ***`);
assert.deepEqual(gutenbergTitledChapterFixture.documents.map(({ title }) => title), ["Chapter I: LAYING PLANS", "Chapter II: WAGING WAR"]);
const machineStopsFixture = parseMachineStopsText(`THE MACHINE STOPS

_Part I_

THE AIR-SHIP

Mediated life.

_Part II_

THE MENDING APPARATUS

Institutional repair.

_Part III_

THE HOMELESS

The system breaks.`);
assert.deepEqual(machineStopsFixture.documents.map(({ title }) => title), [
  "Part I: THE AIR-SHIP", "Part II: THE MENDING APPARATUS", "Part III: THE HOMELESS"
]);
assert.equal(machineStopsFixture.documents.at(-1).sections[0].text, "The system breaks.");
const taoFixture = parseTaoTeChingText(`*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
Ch. 1. 1. First witness.
${Array.from({ length: 80 }, (_, index) => `${index + 2}. 1. Witness ${index + 2}.`).join("\n")}
*** END OF THE PROJECT GUTENBERG EBOOK TEST ***`);
assert.equal(taoFixture.documents.length, 81);
assert.equal(taoFixture.documents.at(-1).title, "Chapter 81");
const siddharthaFixture = parseSiddharthaGermanText(`*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
${["DER SOHN DES BRAHMANEN", "BEI DEN SAMANAS", "GOTAMA", "ERWACHEN", "KAMALA", "BEI DEN KINDERMENSCHEN", "SANSARA", "AM FLUSSE", "DER FÄHRMANN", "DER SOHN", "OM", "GOVINDA"].map((title) => `${title}\n\n${title} trägt die Begegnung.`).join("\n\n")}
*** END OF THE PROJECT GUTENBERG EBOOK TEST ***`);
assert.equal(siddharthaFixture.documents.length, 12);
assert.equal(siddharthaFixture.documents[0].title, "DER SOHN DES BRAHMANEN");
const constitutionFixture = parseUnitedStatesConstitutionText(`*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
We the People establish this Constitution.
Article 1
Section 1. Legislative witness.
Section 2. Representative witness.
ARTICLE 2
Section 1. Executive witness.
ARTICLE THREE
Section 1. Judicial witness.
ARTICLE FOUR
Section 1. Interstate witness.
ARTICLE FIVE
Amendment witness.
ARTICLE SIX
Supremacy witness.
ARTICLE SEVEN
Ratification witness.
*** END OF THE PROJECT GUTENBERG EBOOK TEST ***`);
assert.equal(constitutionFixture.documents.length, 8);
assert.equal(constitutionFixture.documents.flatMap(({ sections }) => sections).length, 9);
const federalistFixture = parseFederalistText(`*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
${[...Array.from({ length: 70 }, (_, index) => index + 1), 70, ...Array.from({ length: 15 }, (_, index) => index + 71)].map((number) => `FEDERALIST${number === 1 || number === 7 ? "." : ""} No. ${number}\n\nEssay ${number}.`).join("\n\n")}
*** END OF THE PROJECT GUTENBERG EBOOK TEST ***`);
assert.equal(federalistFixture.documents.length, 86);
assert.equal(federalistFixture.documents.filter(({ path }) => path.startsWith("federalist:70")).length, 2);
const gilgameshFixture = parseGilgameshText(`*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
PREFATORY NOTE
Preface.
INTRODUCTION.
Introduction.
PENNSYLVANIA TABLET.
Tablet.
TRANSLITERATION.
Signs.
TRANSLATION.
Language.
COMMENTARY ON THE PENNSYLVANIA TABLET.
Commentary.
YALE TABLET.
Tablet.
TRANSLITERATION.
Signs.
TRANSLATION.
Language.
CORRECTIONS TO THE TEXT OF LANGDON'S EDITION OF THE PENNSYLVANIA
TABLET. [157]
Corrections.
NOTES
Notes.
*** END OF THE PROJECT GUTENBERG EBOOK TEST ***`);
assert.equal(gilgameshFixture.documents.length, 11);
assert.equal(gilgameshFixture.documents.at(-1).title, "Notes");
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
assert.equal(edition.transformation, "deterministic-structural-reading/v4-structural-depth");
assert.ok(Number.isFinite(edition.measures.relation_density));
assert.ok(Number.isFinite(edition.measures.relation_weight_entropy));
assert.match(edition.reading.structural_depth.signature, /^[0-9a-f]{16}$/);
assert.deepEqual(Object.keys(edition.reading.structural_depth.relation_profile), ["contains", "expresses", "co-occurs"]);
assert.match(edition.reading.statement, /derived density\. Structural signature [0-9a-f]{16}\./);
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
