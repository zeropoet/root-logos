#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ingestLibraryWork, parseMidvashBible } from "./works.mjs";

const args = process.argv.slice(2);
const sourceRoot = args[0];
const witnessIndex = args.indexOf("--source-witness");
const revisionIndex = args.indexOf("--revision");

if (!sourceRoot || witnessIndex === -1 || !args[witnessIndex + 1]) {
  process.stderr.write("Usage: node scripts/works-protestant-corpus.mjs <private-source-root> --source-witness <pinned-git-witness> [--revision <revision>]\n");
  process.exitCode = 1;
} else {
  const root = resolve(sourceRoot);
  const metadataPath = join(root, "versions", "en", "kjv", "metadata.json");
  const sourcePath = join(root, "versions", "en", "kjv", "kjv.json");
  Promise.all([
    readFile(metadataPath, "utf8").then(JSON.parse),
    readFile(sourcePath, "utf8")
  ]).then(async ([metadata, source]) => {
    if (metadata.slug !== "kjv" || metadata.year !== 1769 || metadata.license !== "public-domain") {
      throw new Error("The source witness is not the public-domain 1769 KJV dataset.");
    }
    const parsed = parseMidvashBible(source);
    if (parsed.measures.books !== 66 || parsed.measures.chapters !== 1189 || parsed.measures.verses !== 31102) {
      throw new Error(`KJV integrity mismatch: ${parsed.measures.books} books / ${parsed.measures.chapters} chapters / ${parsed.measures.verses} verses.`);
    }
    return ingestLibraryWork({
      input: sourcePath,
      title: "King James Bible (1769)",
      author: "Translation commissioned by King James VI and I",
      kind: "scriptural corpus",
      format: "midvash-bible-json",
      sourceVisibility: "private",
      sourceWitness: args[witnessIndex + 1],
      translation: "King James Version / Oxford 1769 standard text",
      language: "en",
      rights: "Public domain in the United States; source dataset declares worldwide public-domain status.",
      rootRevision: revisionIndex === -1 ? "v1.2" : args[revisionIndex + 1],
      collection: "Protestant Scripture",
      division: "Sixty-six-book canon"
    });
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
