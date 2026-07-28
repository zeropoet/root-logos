#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { applyFoldForgeComposition, foldForgeCompositionIdentity } from "./foldforge-score.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const worksRoot = join(root, "works");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
const now = () => new Date().toISOString();
const COMPILED_CORPORA = new Map([
  ["Original Douay-Rheims Catholic Canon", {
    filename: "original-douay-rheims.json",
    workId: "original-douay-rheims-catholic-canon"
  }],
  ["King James Bible (1769) Protestant Canon", {
    filename: "king-james-bible-1769.json",
    workId: "king-james-bible-1769-78d562e1"
  }]
]);

const snapshot = JSON.parse(await readFile(join(root, "sources", "foldforge.snapshot.json"), "utf8"));
const inheritance = foldForgeCompositionIdentity(snapshot);
const checkOnly = process.argv.includes("--check");

const assertCurrentInheritance = (score, label) => {
  if (score?.composition_inheritance?.source_witness !== snapshot.witness) {
    throw new Error(`${label} does not inherit the current FoldForge witness ${snapshot.witness}.`);
  }
  const inheritedEvents = (score.events || []).filter(({ composition_source }) => composition_source === "foldforge");
  const expectedEvents = snapshot.language_composition?.terms?.length || 0;
  if (inheritedEvents.length !== expectedEvents) {
    throw new Error(`${label} carries ${inheritedEvents.length} FoldForge events; expected ${expectedEvents}.`);
  }
};

const recomposeWork = async (entry) => {
  const workDir = join(worksRoot, entry.work_id);
  const manifestPath = join(workDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const prior = JSON.parse(await readFile(join(root, entry.edition), "utf8"));
  if (prior.sound?.composition_inheritance?.source_witness === snapshot.witness) return { entry, changed: false };

  const editionId = `${entry.work_id}--${String(prior.root_logos_revision).replace(/[^\w.-]+/g, "-")}-foldforge-${digest(`${prior.edition_id}:${snapshot.witness}`).slice(0, 10)}`;
  const createdAt = now();
  const edition = {
    ...prior,
    edition_id: editionId,
    created_at: createdAt,
    parent_edition: prior.edition_id,
    transformation: `${prior.transformation}+foldforge-composition-inheritance/v1`,
    reading_context: {
      kind: "foldforge-composition-inheritance",
      prior_reading_context: prior.reading_context || null,
      source_edition: prior.edition_id,
      inheritance
    },
    sound: applyFoldForgeComposition({ score: prior.sound, workId: entry.work_id, snapshot })
  };
  const editionDir = join(workDir, "editions", editionId);
  const href = `works/${entry.work_id}/editions/${editionId}/edition.json`;
  await mkdir(editionDir, { recursive: true });
  await writeFile(join(editionDir, "edition.json"), json(edition));

  const editionRecord = {
    edition_id: editionId,
    root_logos_revision: prior.root_logos_revision,
    transformation: edition.transformation,
    created_at: createdAt,
    href
  };
  manifest.current_edition = editionId;
  manifest.editions = [...(manifest.editions || []), editionRecord];
  await writeFile(manifestPath, json(manifest));
  return { changed: true, entry: {
    ...entry,
    current_edition: editionId,
    editions: Number(entry.editions || 0) + 1,
    updated_at: createdAt,
    edition_history: manifest.editions,
    edition: href
  } };
};

const recomposeCorpus = async ({ filename, workId }) => {
  const corpusPath = join(worksRoot, "corpora", filename);
  const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
  if (corpus.sound?.composition_inheritance?.source_witness === snapshot.witness) return { corpus, changed: false };
  const priorId = corpus.current_sound_edition || `corpus-score-${corpus.sound.signature}`;
  const editionId = `corpus-score-foldforge-${digest(`${priorId}:${snapshot.witness}`).slice(0, 10)}`;
  const createdAt = now();
  const sound = applyFoldForgeComposition({
    score: corpus.sound,
    workId,
    snapshot
  });
  const edition = {
    schema: "root-logos-corpus-sound-edition/v1",
    edition_id: editionId,
    parent_edition: priorId,
    created_at: createdAt,
    composition_inheritance: inheritance,
    sound
  };
  const editionDir = join(worksRoot, "corpora", "editions");
  await mkdir(editionDir, { recursive: true });
  await writeFile(join(editionDir, `${editionId}.json`), json(edition));
  corpus.sound = sound;
  corpus.current_sound_edition = editionId;
  corpus.sound_editions = [
    ...(corpus.sound_editions || []),
    { edition_id: editionId, parent_edition: priorId, created_at: createdAt, href: `works/corpora/editions/${editionId}.json` }
  ];
  await writeFile(corpusPath, json(corpus));
  return { corpus, changed: true };
};

const indexPath = join(worksRoot, "index.json");
const index = JSON.parse(await readFile(indexPath, "utf8"));
if (checkOnly) {
  for (const entry of index.works || []) {
    if (COMPILED_CORPORA.has(entry.collection)) continue;
    const edition = JSON.parse(await readFile(join(root, entry.edition), "utf8"));
    assertCurrentInheritance(edition.sound, entry.title || entry.work_id);
  }
  for (const [label, { filename }] of COMPILED_CORPORA) {
    const corpus = JSON.parse(await readFile(join(worksRoot, "corpora", filename), "utf8"));
    assertCurrentInheritance(corpus.sound, label);
  }
  process.stdout.write(`FoldForge composition inheritance is current for every public Library voice (${snapshot.witness}).\n`);
  process.exit(0);
}

const recomposed = [];
let indexChanged = false;
for (const entry of index.works || []) {
  if (COMPILED_CORPORA.has(entry.collection)) {
    recomposed.push(entry);
    continue;
  }
  const result = await recomposeWork(entry);
  recomposed.push(result.entry);
  indexChanged ||= result.changed;
}
if (indexChanged) {
  index.works = recomposed;
  index.updated_at = now();
  await writeFile(indexPath, json(index));
}
const corpora = [];
for (const [label, config] of COMPILED_CORPORA) {
  const result = await recomposeCorpus(config);
  corpora.push({ label, corpus: result.corpus });
}

process.stdout.write(`${JSON.stringify({
  source_witness: snapshot.witness,
  grammars: inheritance.grammars,
  recomposed_works: recomposed.filter(({ collection }) => !COMPILED_CORPORA.has(collection)).map(({ work_id, current_edition }) => ({ work_id, current_edition })),
  corpus_sound_editions: Object.fromEntries(corpora.map(({ label, corpus }) => [label, corpus.current_sound_edition]))
}, null, 2)}\n`);
