#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const target = join(root, "works", "structural-depth-migration.json");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const WORK_GRAMMAR = "deterministic-structural-reading/v4-structural-depth";
const CORPUS_GRAMMAR = "deterministic-corpus-reading/v2-structural-depth";
const COMPILED_COLLECTIONS = new Set([
  "Original Douay-Rheims Catholic Canon",
  "King James Bible (1769) Protestant Canon"
]);

const recoveryClass = (manifest) => {
  const identity = String(manifest.source_witness?.identity || "").toLowerCase();
  if (identity.startsWith("root-logos:") || identity.startsWith("library-addition:")) {
    return "canonical-source-reconstruction";
  }
  if (identity.includes("owned-epub")) {
    return "owner-source";
  }
  if (manifest.source || /(gutenberg|standardebooks|github:|git(enberg)?|arxiv|author-hosted|wik(source|imedia)|internet-archive|midvash|douay-rheims|bps-pariyatti|british-academy|doi:|samoburja|educ\.ar|ndl:|oll:|bell-system|proceedings-|monatshefte|google books|gallica|wellcome)/.test(identity)) {
    return "public-or-authorized-witness";
  }
  return "exact-witness-reconstruction";
};

const workRecord = async (entry, frame) => {
  const manifest = JSON.parse(await readFile(join(root, entry.manifest), "utf8"));
  const edition = JSON.parse(await readFile(join(root, entry.edition), "utf8"));
  const grammarChain = String(edition.transformation || "").split("+");
  const migrated = grammarChain.includes(WORK_GRAMMAR) || grammarChain.includes(CORPUS_GRAMMAR);
  return {
    order: entry.library_order,
    work_id: entry.work_id,
    title: entry.title,
    genre: entry.kind,
    status: migrated ? "migrated" : "exact-source-required",
    recovery: migrated ? "complete" : recoveryClass(manifest),
    source_witness: manifest.source_witness?.identity || "unwitnessed",
    source_sha256: manifest.source_hash,
    current_edition: entry.current_edition,
    current_transformation: edition.transformation,
    structural_depth: migrated ? edition.reading?.structural_depth || null : null,
    successor_portrait: migrated && frame ? {
      png: frame.file,
      png_sha256: frame.sha256,
      svg: frame.svg_file,
      svg_sha256: frame.svg_sha256
    } : null
  };
};

export const buildStructuralDepthMigration = async () => {
  const [index, corpus, frames] = await Promise.all([
    readFile(join(root, "works", "index.json"), "utf8").then(JSON.parse),
    readFile(join(root, "works", "corpora", "original-douay-rheims.json"), "utf8").then(JSON.parse),
    readFile(join(root, "assets", "library-first-frames", "manifest.json"), "utf8").then(JSON.parse)
  ]);
  const frameByWork = new Map(frames.frames.map((frame) => [frame.work_id, frame]));
  const entries = index.works
    .filter(({ collection }) => !COMPILED_COLLECTIONS.has(collection))
    .sort((left, right) => Number(left.library_order) - Number(right.library_order));
  const works = await Promise.all(entries.map((entry) => workRecord(entry, frameByWork.get(entry.work_id))));
  works.splice(1, 0, {
    order: 2,
    work_id: corpus.corpus_id,
    title: corpus.title,
    genre: "scriptural corpus",
    status: corpus.structural_depth ? "migrated" : "exact-source-required",
    recovery: corpus.structural_depth ? "complete" : "public-or-authorized-witness",
    source_witness: corpus.source_witness,
    source_sha256: null,
    current_edition: corpus.current_sound_edition,
    current_transformation: corpus.structural_depth ? CORPUS_GRAMMAR : "deterministic-corpus-reading/v1",
    structural_depth: corpus.structural_depth || null,
    successor_portrait: corpus.structural_depth && frameByWork.has(corpus.corpus_id) ? {
      png: frameByWork.get(corpus.corpus_id).file,
      png_sha256: frameByWork.get(corpus.corpus_id).sha256,
      svg: frameByWork.get(corpus.corpus_id).svg_file,
      svg_sha256: frameByWork.get(corpus.corpus_id).svg_sha256
    } : null
  });
  works.sort((left, right) => left.order - right.order);
  const migrated = works.filter(({ status }) => status === "migrated").length;
  return {
    schema: "root-logos-structural-depth-migration/v1",
    generated_at: index.updated_at,
    target_work_grammar: WORK_GRAMMAR,
    target_corpus_grammar: CORPUS_GRAMMAR,
    policy: "Exact witnessed sources only. Historical editions and admission portraits remain immutable; every new structural reading receives a distinct PNG and SVG successor portrait.",
    measures: {
      coherent_works: works.length,
      migrated,
      exact_source_required: works.length - migrated,
      completion: Number((migrated / Math.max(1, works.length)).toFixed(4))
    },
    works
  };
};

const generated = await buildStructuralDepthMigration();
if (process.argv.includes("--check")) {
  const existing = await readFile(target, "utf8");
  if (existing !== json(generated)) {
    process.stderr.write("Structural-depth migration ledger is stale. Run npm run works:depth-ledger.\n");
    process.exitCode = 1;
  } else process.stdout.write(`Structural-depth migration ledger verified: ${generated.measures.migrated}/${generated.measures.coherent_works} complete.\n`);
} else {
  await writeFile(target, json(generated));
  process.stdout.write(`Structural-depth migration ledger written: ${generated.measures.migrated}/${generated.measures.coherent_works} complete.\n`);
}
