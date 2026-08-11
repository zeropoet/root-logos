#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildCorpusTopology } from "./works-corpus.mjs";
import { ingestWork, parseMidvashBible, refreshFoundingConstitution } from "./works.mjs";
import { renderLibraryFirstFrames } from "./work-first-frame.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const archiveRoot = join(root, "works");
const COLLECTION = "King James Bible (1769) Protestant Canon";
const PUBLIC_WORK_ID = "king-james-bible-1769-78d562e1";
const iso = () => new Date().toISOString();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");

export const ingestKingJamesCorpus = async ({ sourceRoot, sourceWitness, rootRevision = "v1.2" }) => {
  const sourcePath = join(sourceRoot, "versions", "en", "kjv", "kjv.json");
  const metadataPath = join(sourceRoot, "versions", "en", "kjv", "metadata.json");
  const [metadata, source] = await Promise.all([
    readFile(metadataPath, "utf8").then(JSON.parse),
    readFile(sourcePath, "utf8")
  ]);
  if (metadata.slug !== "kjv" || metadata.year !== 1769 || metadata.license !== "public-domain") {
    throw new Error("The source witness is not the public-domain 1769 KJV dataset.");
  }
  const parsed = parseMidvashBible(source);
  if (parsed.measures.books !== 66 || parsed.measures.chapters !== 1189 || parsed.measures.verses !== 31102) {
    throw new Error(`KJV integrity mismatch: ${parsed.measures.books} books / ${parsed.measures.chapters} chapters / ${parsed.measures.verses} verses.`);
  }

  const fullBible = JSON.parse(source);
  const existingIndex = JSON.parse(await readFile(join(archiveRoot, "index.json"), "utf8"));
  const existingCorpusEntries = (existingIndex.works || []).filter(({ collection }) => collection === COLLECTION);
  const results = [];
  for (const [index, book] of fullBible.books.entries()) {
    const input = join(sourceRoot, "versions", "en", "kjv", "books", `${book.book}.json`);
    const entry = await ingestWork({
      input,
      title: book.englishName,
      author: "King James Version translators",
      kind: "scripture",
      format: "midvash-bible-book-json",
      sourceVisibility: "private",
      sourceWitness: `${sourceWitness}:book:${book.book}`,
      translation: "King James Version / Oxford 1769 standard text",
      language: "en",
      rights: "Public domain in the United States; source dataset declares worldwide public-domain status.",
      rootRevision,
      collection: COLLECTION,
      division: book.testament === "OT" ? "Old Testament" : "New Testament",
      canonicalOrder: index + 1
    });
    results.push(entry);
    process.stdout.write(`[${String(index + 1).padStart(2, "0")}/66] ${entry.title} / ${entry.current_edition}\n`);
  }

  const indexPath = join(archiveRoot, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const resultIds = new Set(results.map(({ work_id }) => work_id));
  const priorCorpusIds = new Set(existingCorpusEntries.map(({ work_id }) => work_id));
  const normalized = results.map((entry, indexPosition) => ({
    ...entry,
    library_order: null,
    collection: COLLECTION,
    division: fullBible.books[indexPosition].testament === "OT" ? "Old Testament" : "New Testament",
    canonical_order: indexPosition + 1
  }));
  index.works = [
    ...normalized,
    ...(index.works || []).filter(({ work_id, collection }) =>
      !resultIds.has(work_id) && !(collection === COLLECTION && priorCorpusIds.has(work_id)))
  ];
  index.updated_at = iso();
  await writeFile(indexPath, json(index));

  const corpus = await buildCorpusTopology(normalized, sourceWitness, {
    corpusId: PUBLIC_WORK_ID,
    title: "King James Bible (1769)",
    translation: "King James Version / Oxford 1769 standard text",
    rights: "Public domain in the United States; source dataset declares worldwide public-domain status.",
    supplements: []
  });
  const corpusPath = join(archiveRoot, "corpora", "king-james-bible-1769.json");
  await mkdir(join(archiveRoot, "corpora"), { recursive: true });
  await writeFile(corpusPath, json(corpus));

  const publicWorkDir = join(archiveRoot, PUBLIC_WORK_ID);
  const manifestPath = join(publicWorkDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const parentEdition = manifest.current_edition;
  const editionId = `${PUBLIC_WORK_ID}--${rootRevision.replace(/\W+/g, "")}-corpus-${corpus.sound.signature}`;
  const createdAt = iso();
  const concepts = new Map();
  for (const node of corpus.nodes) {
    for (const { concept, count } of node.concepts) concepts.set(concept, (concepts.get(concept) || 0) + count);
  }
  const dominantConcepts = [...concepts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([concept, count]) => ({ concept, count }));
  const edition = {
    schema: "root-logos-work-edition/v1",
    edition_id: editionId,
    work_id: PUBLIC_WORK_ID,
    created_at: createdAt,
    root_logos_revision: rootRevision,
    source_hash: manifest.source_hash,
    parent_edition: parentEdition,
    status: "archived",
    transformation: "deterministic-corpus-reading/v2-structural-depth",
    corpus_ref: "works/corpora/king-james-bible-1769.json",
    reading_context: {
      kind: "complete-corpus-compilation",
      canonical_books: 66,
      old_testament_books: 39,
      new_testament_books: 27,
      source_witness: sourceWitness,
      corpus_signature: digest(JSON.stringify(corpus.nodes.map(({ id, current_edition }) => [id, current_edition])))
    },
    measures: {
      documents: corpus.canonical_work_count,
      sections: corpus.measures.passages,
      words: corpus.measures.words,
      concepts: concepts.size,
      relations: corpus.visual.topology.edges.length,
      relation_density: corpus.structural_depth.relation_density,
      relation_weight_entropy: corpus.structural_depth.relation_weight_entropy
    },
    visual: corpus.visual,
    sound: corpus.sound,
    reading: {
      dominant_concepts: dominantConcepts,
      structural_depth: corpus.structural_depth,
      statement: `King James Bible (1769) resolves as ${corpus.canonical_work_count} independently read books, ${corpus.measures.passages.toLocaleString()} passage coordinates, and ${corpus.measures.cross_work_relations.toLocaleString()} cross-book relations. Structural signature ${corpus.structural_depth.signature}.`
    }
  };
  const editionDir = join(publicWorkDir, "editions", editionId);
  await mkdir(editionDir, { recursive: true });
  await writeFile(join(editionDir, "edition.json"), json(edition));

  const editionRecord = {
    edition_id: editionId,
    root_logos_revision: rootRevision,
    transformation: edition.transformation,
    created_at: createdAt,
    href: `works/${PUBLIC_WORK_ID}/editions/${editionId}/edition.json`
  };
  manifest.current_edition = editionId;
  manifest.editions = [...(manifest.editions || []).filter(({ edition_id: id }) => id !== editionId), editionRecord];
  manifest.collection = "Protestant Scripture";
  manifest.division = "Sixty-six-book canon";
  manifest.library_order = 14;
  manifest.constitutional_role = "A complete Protestant scriptural corpus whose independently read books exert attributable cross-work pressure within one coherent Library body.";
  await writeFile(manifestPath, json(manifest));

  const finalIndex = JSON.parse(await readFile(indexPath, "utf8"));
  const priorPublic = finalIndex.works.find(({ work_id }) => work_id === PUBLIC_WORK_ID)
    || existingIndex.works.find(({ work_id }) => work_id === PUBLIC_WORK_ID);
  const publicEntry = {
    ...priorPublic,
    work_id: PUBLIC_WORK_ID,
    title: "King James Bible (1769)",
    author: "Translation commissioned by King James VI and I",
    kind: "scriptural corpus",
    current_edition: editionId,
    editions: manifest.editions.length,
    updated_at: createdAt,
    library_order: 14,
    edition_history: manifest.editions,
    source_visibility: "private",
    translation: manifest.translation,
    rights: manifest.rights,
    collection: "Protestant Scripture",
    division: "Sixty-six-book canon",
    canonical_order: null,
    manifest: `works/${PUBLIC_WORK_ID}/manifest.json`,
    edition: `works/${PUBLIC_WORK_ID}/editions/${editionId}/edition.json`
  };
  finalIndex.works = [
    publicEntry,
    ...(finalIndex.works || []).filter(({ work_id }) => work_id !== PUBLIC_WORK_ID)
  ];
  finalIndex.updated_at = createdAt;
  await writeFile(indexPath, json(finalIndex));

  const foundingConstitution = await refreshFoundingConstitution(publicEntry);
  const frames = await renderLibraryFirstFrames();
  return {
    entry: publicEntry,
    corpus,
    founding_constitution: foundingConstitution,
    first_frame: frames.frames.find(({ work_id }) => work_id === PUBLIC_WORK_ID) || null
  };
};

const args = process.argv.slice(2);
const sourceRoot = args[0];
const witnessIndex = args.indexOf("--source-witness");
const revisionIndex = args.indexOf("--revision");

if (!sourceRoot || witnessIndex === -1 || !args[witnessIndex + 1]) {
  process.stderr.write("Usage: node scripts/works-protestant-corpus.mjs <private-source-root> --source-witness <pinned-git-witness> [--revision <revision>]\n");
  process.exitCode = 1;
} else {
  ingestKingJamesCorpus({
    sourceRoot: resolve(sourceRoot),
    sourceWitness: args[witnessIndex + 1],
    rootRevision: revisionIndex === -1 ? "v1.2" : args[revisionIndex + 1]
  }).then((result) => {
    process.stdout.write(`Corpus complete: ${result.corpus.canonical_work_count} books / ${result.corpus.measures.passages} passages / ${result.corpus.measures.cross_work_relations} cross-book relations\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
