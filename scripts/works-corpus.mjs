#!/usr/bin/env node

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { ingestWork } from "./works.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const archiveRoot = join(root, "works");
const iso = () => new Date().toISOString();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");

const OLD_TESTAMENT = [
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy",
  "josue", "judges", "ruth", "1-kings", "2-kings", "3-kings", "4-kings",
  "1-paralipomenon", "2-paralipomenon", "1-esdras", "2-esdras",
  "tobias", "judith", "esther", "job", "psalms", "proverbs",
  "ecclesiastes", "canticle-of-canticles", "wisdom", "ecclesiasticus",
  "isaie", "jeremie", "lamentations", "baruch", "ezechiel", "daniel",
  "osee", "joel", "amos", "abdias", "jonas", "micheas", "nahum",
  "habacuc", "sophonias", "aggeus", "zacharias", "malachie",
  "1-machabees", "2-machabees"
];

const NEW_TESTAMENT = [
  "matthew", "mark", "luke", "john", "acts", "romans",
  "1-corinthians", "2-corinthians", "galatians", "ephesians",
  "philippians", "colossians", "1-thessalonians", "2-thessalonians",
  "1-timothy", "2-timothy", "titus", "philemon", "hebrews",
  "james", "1-peter", "2-peter", "1-john", "2-john", "3-john",
  "jude", "apocalypse"
];

export const CATHOLIC_CANON = [
  ...OLD_TESTAMENT.map((id, index) => ({ id, division: "Old Testament", order: index + 1 })),
  ...NEW_TESTAMENT.map((id, index) => ({ id, division: "New Testament", order: OLD_TESTAMENT.length + index + 1 }))
];

export const buildCorpusTopology = async (entries, sourceWitness) => {
  const readings = await Promise.all(entries.map(async (entry) => ({
    entry,
    edition: JSON.parse(await readFile(join(root, entry.edition), "utf8"))
  })));
  const nodes = readings.map(({ entry, edition }) => ({
    id: entry.work_id,
    title: entry.title,
    division: entry.division,
    canonical_order: entry.canonical_order,
    current_edition: entry.current_edition,
    measures: edition.measures,
    concepts: edition.reading.dominant_concepts
  }));
  const edges = [];
  for (let left = 0; left < nodes.length; left += 1) {
    const leftConcepts = new Set(nodes[left].concepts.map(({ concept }) => concept));
    for (let right = left + 1; right < nodes.length; right += 1) {
      const shared = nodes[right].concepts.map(({ concept }) => concept).filter((concept) => leftConcepts.has(concept));
      if (shared.length >= 3) edges.push({
        from: nodes[left].id,
        to: nodes[right].id,
        relation: "shared-derived-language",
        weight: shared.length,
        concepts: shared
      });
    }
  }
  const corpusSignature = digest(JSON.stringify(nodes.map(({ id, current_edition }) => [id, current_edition])));
  const seed = Number.parseInt(corpusSignature.slice(0, 8), 16) >>> 0;
  const scale = [1, 1.125, 1.25, 1.333333, 1.5, 1.666667, 1.875, 2];
  const sortedEdges = edges.sort((a, b) => b.weight - a.weight || a.from.localeCompare(b.from));
  const conceptFrequency = new Map();
  for (const node of nodes) {
    for (const { concept } of node.concepts) conceptFrequency.set(concept, (conceptFrequency.get(concept) || 0) + 1);
  }
  for (const node of nodes) {
    const related = sortedEdges.filter(({ from, to }) => from === node.id || to === node.id);
    const lexicalDistinctiveness = node.concepts.reduce((sum, { concept }) =>
      sum + (1 - ((conceptFrequency.get(concept) || 1) - 1) / Math.max(1, nodes.length - 1)), 0
    ) / Math.max(1, node.concepts.length);
    const relationalSimilarity = related.reduce((sum, { weight }) => sum + Math.min(1, weight / 12), 0) / Math.max(1, related.length);
    node.distinctiveness = Number((lexicalDistinctiveness * .68 + (1 - relationalSimilarity) * .32).toFixed(4));
    node.outward_pressure = Number((.38 + node.distinctiveness * .56).toFixed(4));
    node.relational_tension = Number((related.reduce((sum, { weight }) => sum + weight, 0) / Math.max(1, related.length)).toFixed(4));
  }
  const visualNodes = [
    { id: "corpus", type: "work", label: "Root Logos", weight: 73, coordinate: "coherence:gravity", band: 0, color: "#e9e5d8" },
    ...nodes.map((node) => ({
      id: node.id,
      type: "book",
      label: node.title,
      weight: node.measures.passages,
      coordinate: `${node.division}:${node.canonical_order}`,
      canonical_order: node.canonical_order,
      division: node.division,
      distinctiveness: node.distinctiveness,
      outward_pressure: node.outward_pressure,
      relational_tension: node.relational_tension,
      band: node.outward_pressure,
      angle: ((node.canonical_order - 1) / nodes.length) * Math.PI * 2,
      color: node.division === "Old Testament" ? "#cbb77a" : "#93b9bb"
    }))
  ];
  const visualEdges = [
    ...nodes.map((node) => ({ from: "corpus", to: node.id, relation: "contains", weight: 1 })),
    ...sortedEdges.slice(0, 360)
  ];
  const scoreEvents = Array.from({ length: 96 }, (_, index) => {
    const node = nodes[(seed + index * 11) % nodes.length];
    const concept = node.concepts[(seed + index * 3) % node.concepts.length] || { concept: "silence", count: 1 };
    return {
      index,
      voice: index % 8 === 0 ? "coherence" : "antigravity",
      provenance: `${node.title} / lexicon:${concept.concept}`,
      frequency: 55 * scale[(seed + index + concept.count) % scale.length] * (2 ** (1 + index % 3)) * (.82 + node.outward_pressure * .24),
      beats: index % 13 === 0 ? 2 : index % 4 === 0 ? 1 : .5,
      rest: index % 17 === 0,
      amplitude: Number((.022 + node.outward_pressure * .022).toFixed(4)),
      pressure: node.outward_pressure
    };
  });
  return {
    schema: "root-logos-corpus-topology/v1",
    corpus_id: "original-douay-rheims-catholic-canon",
    title: "Original Douay-Rheims Catholic Canon",
    translation: "Original Douay-Rheims (1609 / 1582)",
    source_visibility: "private",
    source_witness: sourceWitness,
    rights: "CC0 1.0 Universal / public-domain dataset witness",
    generated_at: iso(),
    canonical_work_count: nodes.length,
    supplementary_sources_not_classified_as_canonical_books: [
      "3-esdras", "4-esdras", "prayer-of-manasseh", "prayer-of-manasses"
    ],
    measures: {
      documents: nodes.reduce((sum, node) => sum + node.measures.documents, 0),
      passages: nodes.reduce((sum, node) => sum + node.measures.sections, 0),
      words: nodes.reduce((sum, node) => sum + node.measures.words, 0),
      derived_relations: nodes.reduce((sum, node) => sum + node.measures.relations, 0),
      cross_work_relations: edges.length,
      mean_outward_pressure: Number((nodes.reduce((sum, node) => sum + node.outward_pressure, 0) / nodes.length).toFixed(4))
    },
    nodes,
    nodes,
    edges: sortedEdges,
    visual: {
      schema: "root-logos-corpus-visual/v1",
      seed,
      palette: ["#cbb77a", "#e9e5d8", "#93b9bb", "#9a8cb6", "#ad7159", "#8aa681"],
      topology: { nodes: visualNodes, edges: visualEdges },
      motion: { drift: .11, pulse: 11, fold: 7 }
    },
    sound: {
      schema: "root-logos-corpus-score/v1",
      signature: corpusSignature.slice(0, 12),
      tempo: 47 + (seed % 12),
      root_hz: 55,
      events: scoreEvents
    }
  };
};

export const rebuildDouayRheimsTopology = async () => {
  const indexPath = join(archiveRoot, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const entries = (index.works || [])
    .filter(({ collection }) => collection === "Original Douay-Rheims Catholic Canon")
    .sort((a, b) => a.canonical_order - b.canonical_order);
  if (entries.length !== 73) throw new Error(`The corpus topology requires 73 canonical works; found ${entries.length}.`);
  const existing = JSON.parse(await readFile(join(archiveRoot, "corpora", "original-douay-rheims.json"), "utf8"));
  const corpus = await buildCorpusTopology(entries, existing.source_witness);
  await writeFile(join(archiveRoot, "corpora", "original-douay-rheims.json"), json(corpus));
  return corpus;
};

export const ingestDouayRheimsCorpus = async ({ sourceRoot, sourceWitness, rootRevision = "v1.1" }) => {
  const existingIndex = JSON.parse(await readFile(join(archiveRoot, "index.json"), "utf8"));
  const existingByCollectionOrder = new Map((existingIndex.works || [])
    .filter(({ collection }) => collection === "Original Douay-Rheims Catholic Canon")
    .map((entry) => [entry.canonical_order, entry]));
  const results = [];
  for (const book of CATHOLIC_CANON) {
    const input = join(sourceRoot, "bible", "raw", `${book.id}.json`);
    const raw = JSON.parse(await readFile(input, "utf8"));
    const existingGenesis = book.id === "genesis"
      ? (existingIndex.works || []).find(({ title }) => title === "Genesis")
      : null;
    const entry = await ingestWork({
      input,
      title: existingGenesis?.title || raw.short_title,
      author: existingGenesis?.author || "Traditional attribution",
      kind: "scripture",
      format: "douay-rheims-json",
      sourceVisibility: "private",
      sourceWitness,
      translation: "Original Douay-Rheims (1609 / 1582)",
      language: "en",
      rights: "CC0 1.0 Universal / public-domain dataset witness",
      rootRevision,
      collection: "Original Douay-Rheims Catholic Canon",
      division: book.division,
      canonicalOrder: book.order
    });
    results.push(entry);
    process.stdout.write(`[${book.order}/73] ${entry.title} / ${entry.current_edition}\n`);
  }

  const indexPath = join(archiveRoot, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const resultIds = new Set(results.map(({ work_id }) => work_id));
  const normalized = results.map((entry, indexPosition) => ({
    ...entry,
    collection: "Original Douay-Rheims Catholic Canon",
    division: CATHOLIC_CANON[indexPosition].division,
    canonical_order: CATHOLIC_CANON[indexPosition].order
  }));
  index.works = [...normalized, ...(index.works || []).filter(({ work_id }) => !resultIds.has(work_id) && !existingByCollectionOrder.has(work_id))];
  index.updated_at = iso();
  await writeFile(indexPath, json(index));

  const corpus = await buildCorpusTopology(normalized, sourceWitness);
  await mkdir(join(archiveRoot, "corpora"), { recursive: true });
  await writeFile(join(archiveRoot, "corpora", "original-douay-rheims.json"), json(corpus));
  return corpus;
};

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const sourceRoot = args[0];
  const revisionIndex = args.indexOf("--revision");
  const witnessIndex = args.indexOf("--source-witness");
  if (sourceRoot === "rebuild") {
    rebuildDouayRheimsTopology().then((corpus) => {
      process.stdout.write(`Corpus topology rebuilt: ${corpus.canonical_work_count} works / mean outward pressure ${corpus.measures.mean_outward_pressure}\n`);
    }).catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
  } else if (!sourceRoot || witnessIndex === -1 || !args[witnessIndex + 1]) {
    process.stderr.write("Usage: node scripts/works-corpus.mjs <private-source-root> --source-witness <opaque-id> [--revision <revision>]\n");
    process.exitCode = 1;
  } else {
    ingestDouayRheimsCorpus({
      sourceRoot,
      sourceWitness: args[witnessIndex + 1],
      rootRevision: revisionIndex === -1 ? "v1.1" : args[revisionIndex + 1]
    }).then((corpus) => {
      process.stdout.write(`Corpus complete: ${corpus.canonical_work_count} works / ${corpus.measures.passages} passages / ${corpus.measures.cross_work_relations} cross-work relations\n`);
    }).catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
  }
}
