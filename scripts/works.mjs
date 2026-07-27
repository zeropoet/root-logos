#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const archiveRoot = join(root, "works");
const now = () => new Date().toISOString();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const slug = (value) => String(value).toLowerCase().normalize("NFKD")
  .replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
const words = (value) => String(value).toLowerCase().match(/[\p{L}\p{N}'’]+/gu) || [];
const STOP = new Set("a an and are as at be been but by can could did do does for from had has have he her hers him his how i if in into is it its may me more most my no nor not of on one only or our ours she so than that the their them then there these they this those through to too under up upon us was we were what when where which who will with would you your".split(" "));

const walkMarkdown = async (path) => {
  const stat = await import("node:fs/promises").then(({ stat }) => stat(path));
  if (stat.isFile()) return extname(path).toLowerCase() === ".md" ? [path] : [];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter(({ name }) => !name.startsWith("."))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map(({ name }) => walkMarkdown(join(path, name))));
  return nested.flat();
};

const parseDocument = (text, file, sourceRoot) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = { level: 1, title: basename(file, extname(file)), lines: [] };
  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      if (current.lines.some((entry) => entry.trim())) sections.push(current);
      current = { level: heading[1].length, title: heading[2].trim(), lines: [] };
    } else current.lines.push(line);
  }
  if (current.lines.some((entry) => entry.trim())) sections.push(current);
  return {
    path: relative(sourceRoot, file) || basename(file),
    title: sections[0]?.title || basename(file, extname(file)),
    sections: sections.map((section, index) => ({
      coordinate: `${relative(sourceRoot, file) || basename(file)}#${index + 1}`,
      level: section.level,
      title: section.title,
      text: section.lines.join("\n").trim()
    }))
  };
};

const deriveWork = ({ title, author, kind, source, translation, language, rights, documents, sourceHash, workId, editionId, rootRevision }) => {
  const sectionRows = documents.flatMap((document, documentIndex) => document.sections.map((section, sectionIndex) => ({
    ...section, documentIndex, sectionIndex, document: document.path
  })));
  const frequency = new Map();
  for (const token of words(sectionRows.map(({ title: heading, text }) => `${heading} ${text}`).join(" "))) {
    if (token.length > 3 && !STOP.has(token)) frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  const concepts = [...frequency].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 36);
  const conceptIndex = new Map(concepts.map(([concept], index) => [concept, index]));
  const nodes = [
    { id: "work", type: "work", label: title, weight: 1, coordinate: "work" },
    ...documents.map((document, index) => ({
      id: `document-${index + 1}`, type: "document", label: document.title, weight: document.sections.length,
      coordinate: document.path
    })),
    ...concepts.map(([concept, count], index) => ({
      id: `concept-${index + 1}`, type: "concept", label: concept, weight: count,
      coordinate: `lexicon:${concept}`
    }))
  ];
  const edges = documents.map((document, index) => ({
    from: "work", to: `document-${index + 1}`, relation: "contains", weight: document.sections.length
  }));
  documents.forEach((document, documentIndex) => {
    const seen = new Map();
    for (const token of words(document.sections.map(({ text }) => text).join(" "))) {
      if (conceptIndex.has(token)) seen.set(token, (seen.get(token) || 0) + 1);
    }
    [...seen].sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([concept, count]) => edges.push({
      from: `document-${documentIndex + 1}`, to: `concept-${conceptIndex.get(concept) + 1}`,
      relation: "expresses", weight: count
    }));
  });
  for (let left = 0; left < concepts.length; left += 1) {
    for (let right = left + 1; right < concepts.length; right += 1) {
      let shared = 0;
      for (const section of sectionRows) {
        const tokens = new Set(words(`${section.title} ${section.text}`));
        if (tokens.has(concepts[left][0]) && tokens.has(concepts[right][0])) shared += 1;
      }
      if (shared) edges.push({ from: `concept-${left + 1}`, to: `concept-${right + 1}`, relation: "co-occurs", weight: shared });
    }
  }
  const seed = Number.parseInt(sourceHash.slice(0, 8), 16) >>> 0;
  const palette = ["#cbb77a", "#e9e5d8", "#93b9bb", "#9a8cb6", "#ad7159", "#8aa681"];
  const scale = [1, 1.125, 1.25, 1.333333, 1.5, 1.666667, 1.875, 2];
  const graphEdges = edges.sort((a, b) => b.weight - a.weight).slice(0, 180);
  const scoreEvents = Array.from({ length: 72 }, (_, index) => {
    const concept = concepts[(seed + index * 7) % Math.max(1, concepts.length)] || ["silence", 1];
    const rest = index % 13 === 0 || (index + concept[1]) % 19 === 0;
    return {
      index, voice: ["ground", "relation", "figure", "breath"][index % 4],
      provenance: `lexicon:${concept[0]}`, frequency: 55 * scale[(seed + index * 3 + concept[1]) % scale.length] * (2 ** (1 + index % 3)),
      beats: index % 11 === 0 ? 2 : index % 3 === 0 ? 1 : 0.5, rest,
      amplitude: Number(Math.min(.12, .025 + concept[1] / Math.max(80, sectionRows.length * 10)).toFixed(4))
    };
  });
  return {
    manifest: {
      schema: "root-logos-work/v1", work_id: workId, title, author, kind,
      source, source_hash: sourceHash, source_retained: true,
      translation: translation || null, language: language || "en",
      rights: rights || "Rights status must be witnessed before public ingestion.",
      first_received_at: now(), current_edition: editionId,
      constitutional_role: "A bounded body of language transformed into a navigable visual and resonant object."
    },
    edition: {
      schema: "root-logos-work-edition/v1", edition_id: editionId, work_id: workId,
      created_at: now(), root_logos_revision: rootRevision, source_hash: sourceHash,
      parent_edition: null, status: "archived", transformation: "deterministic-structural-reading/v1",
      measures: {
        documents: documents.length, sections: sectionRows.length,
        words: sectionRows.reduce((sum, section) => sum + words(section.text).length, 0),
        concepts: concepts.length, relations: graphEdges.length
      },
      visual: {
        schema: "root-logos-visual-score/v1", seed, palette,
        topology: { nodes, edges: graphEdges },
        motion: { drift: .16 + (seed % 20) / 100, pulse: 7 + (seed % 9), fold: (seed % 7) + 3 }
      },
      sound: {
        schema: "root-logos-work-score/v1", signature: sourceHash.slice(0, 12),
        tempo: 44 + (seed % 21), root_hz: 55, events: scoreEvents
      },
      reading: {
        dominant_concepts: concepts.slice(0, 12).map(([concept, count]) => ({ concept, count })),
        statement: `${title} resolves as ${documents.length} document${documents.length === 1 ? "" : "s"}, ${sectionRows.length} structural passage${sectionRows.length === 1 ? "" : "s"}, and ${graphEdges.length} witnessed relations.`
      }
    }
  };
};

export const ingestWork = async ({
  input, title, author = "Unattributed", kind = "manuscript", source = null,
  translation = null, language = "en", rights = null, rootRevision = "v1.0"
}) => {
  const sourcePath = resolve(input);
  const files = await walkMarkdown(sourcePath);
  if (!files.length) throw new Error("No Markdown files were found in the supplied work.");
  const sourceRoot = (await import("node:fs/promises").then(({ stat }) => stat(sourcePath))).isDirectory() ? sourcePath : resolve(sourcePath, "..");
  const texts = await Promise.all(files.map((file) => readFile(file, "utf8")));
  const canonicalSource = files.map((file, index) => `--- ${relative(sourceRoot, file)} ---\n${texts[index].replace(/\r\n/g, "\n")}`).join("\n");
  const sourceHash = digest(canonicalSource);
  const resolvedTitle = title || basename(sourcePath, extname(sourcePath));
  const workId = `${slug(resolvedTitle)}-${digest(`${resolvedTitle}\n${author}`).slice(0, 8)}`;
  const editionId = `${workId}--${slug(rootRevision)}-${sourceHash.slice(8, 16)}`;
  const documents = texts.map((text, index) => parseDocument(text, files[index], sourceRoot));
  const derived = deriveWork({
    title: resolvedTitle, author, kind, source: source || `local:${sourcePath}`,
    translation, language, rights, documents, sourceHash, workId, editionId, rootRevision
  });
  const workDir = join(archiveRoot, workId);
  const editionDir = join(workDir, "editions", editionId);
  let priorManifest = null;
  try { priorManifest = JSON.parse(await readFile(join(workDir, "manifest.json"), "utf8")); } catch {}
  let priorEditions = priorManifest?.editions || [];
  if (priorManifest) {
    derived.manifest.first_received_at = priorManifest.first_received_at;
    derived.edition.parent_edition = priorManifest.current_edition === editionId ? derived.edition.parent_edition : priorManifest.current_edition;
    if (priorManifest.current_edition === editionId) {
      try {
        const existingEdition = JSON.parse(await readFile(join(workDir, "editions", editionId, "edition.json"), "utf8"));
        derived.edition.created_at = existingEdition.created_at;
        derived.edition.parent_edition = existingEdition.parent_edition;
      } catch {}
    }
    if (!priorEditions.length && priorManifest.current_edition) {
      try {
        const editionDirectories = await readdir(join(workDir, "editions"));
        priorEditions = await Promise.all(editionDirectories.map(async (directory) => {
          const priorEdition = JSON.parse(await readFile(join(workDir, "editions", directory, "edition.json"), "utf8"));
          return {
            edition_id: priorEdition.edition_id,
            root_logos_revision: priorEdition.root_logos_revision,
            created_at: priorEdition.created_at,
            href: `works/${workId}/editions/${priorEdition.edition_id}/edition.json`
          };
        }));
        priorEditions.sort((a, b) => a.created_at.localeCompare(b.created_at));
      } catch {}
    }
  }
  const currentEditionRecord = {
    edition_id: editionId, root_logos_revision: rootRevision, created_at: derived.edition.created_at,
    href: `works/${workId}/editions/${editionId}/edition.json`
  };
  derived.manifest.editions = [...priorEditions.filter(({ edition_id: id }) => id !== editionId), currentEditionRecord];
  await mkdir(editionDir, { recursive: true });
  await writeFile(join(workDir, "manifest.json"), json(derived.manifest));
  await writeFile(join(editionDir, "edition.json"), json(derived.edition));
  const indexPath = join(archiveRoot, "index.json");
  let index = { schema: "root-logos-works-index/v1", updated_at: now(), works: [] };
  try { index = JSON.parse(await readFile(indexPath, "utf8")); } catch {}
  const priorEntry = (index.works || []).find(({ work_id: id }) => id === workId);
  const sameEdition = priorEntry?.current_edition === editionId;
  const entry = {
    work_id: workId, title: resolvedTitle, author, kind, current_edition: editionId,
    editions: sameEdition ? priorEntry.editions : (priorEntry?.editions || 0) + 1, updated_at: derived.edition.created_at,
    edition_history: derived.manifest.editions,
    manifest: `works/${workId}/manifest.json`,
    edition: `works/${workId}/editions/${editionId}/edition.json`
  };
  index.works = [entry, ...(index.works || []).filter(({ work_id: id }) => id !== workId)];
  index.updated_at = now();
  await mkdir(archiveRoot, { recursive: true });
  await writeFile(indexPath, json(index));
  return entry;
};

const args = process.argv.slice(2);
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const command = args.shift();
  if (command !== "ingest") {
    process.stderr.write("Usage: node scripts/works.mjs ingest <path> [--title <title>] [--author <author>] [--kind <kind>] [--source <url>] [--translation <name>] [--language <code>] [--rights <statement>] [--revision <revision>]\n");
    process.exitCode = 1;
  } else {
    const input = args.shift();
    const options = { input };
    for (let index = 0; index < args.length; index += 2) {
      const key = args[index].replace(/^--/, "");
      const map = { revision: "rootRevision" };
      options[map[key] || key] = args[index + 1];
    }
    ingestWork(options).then((entry) => process.stdout.write(`${JSON.stringify(entry, null, 2)}\n`)).catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
  }
}
