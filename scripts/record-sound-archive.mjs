import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, "content/record-sound-archive.json");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const excludedCollections = new Set([
  "Original Douay-Rheims Catholic Canon",
  "King James Bible (1769) Protestant Canon"
]);

const score = (sound) => ({
  mode: "event-score",
  schema: sound.schema,
  signature: sound.signature,
  tempo: sound.tempo,
  rootHz: sound.root_hz,
  events: sound.events.map(({ frequency, waveform, voice, amplitude, beats, rest, provenance }) => ({
    frequency, ...(waveform ? { waveform } : {}), ...(voice ? { voice } : {}),
    amplitude, beats, rest: Boolean(rest), ...(provenance ? { provenance } : {})
  }))
});

const index = await readJson("works/index.json");
const library = await readJson("works/library-composition.json");
const corpus = await readJson("works/corpora/original-douay-rheims.json");
const works = index.works
  .filter(({ collection, edition }) => edition && !excludedCollections.has(collection))
  .sort((a, b) => Number(a.library_order ?? 9999) - Number(b.library_order ?? 9999));

const entries = [{
  id: "root-logos-resonant-chamber",
  title: "The Resonant Chamber",
  branch: "Root Logos",
  kind: "constitutional voice",
  availability: "public instrument",
  source: { repository: "zeropoet/root-logos", path: "resonance/grammar.json", url: "https://rootlogos.com/#resonance" },
  sound: { rootHz: 55, ratios: [1, 1.125, 1.333333, 1.5], waves: ["sine", "triangle", "sine", "sine"], cutoffHz: 1260 }
}, {
  id: "root-logos-library-composition",
  title: "Root Logos — Library Composition",
  branch: "Root Logos / Library",
  kind: "library composition",
  availability: "public procedural score",
  source: { repository: "zeropoet/root-logos", path: "works/library-composition.json", url: "https://rootlogos.com/#works" },
  sound: score(library.sound)
}, {
  id: `root-logos-${corpus.corpus_id}`,
  title: corpus.title,
  branch: "Root Logos / Library",
  kind: "coherent corpus voice",
  availability: "public procedural score",
  source: { repository: "zeropoet/root-logos", path: "works/corpora/original-douay-rheims.json", url: "https://rootlogos.com/#works" },
  sound: score(corpus.sound)
}];

for (const work of works) {
  const edition = await readJson(work.edition);
  if (!edition.sound?.events?.length) continue;
  entries.push({
    id: `root-logos-work-${work.work_id}`,
    title: work.title,
    branch: `Root Logos / ${work.collection || "Library"}`,
    kind: `${work.kind} voice`,
    availability: "public procedural score",
    source: { repository: "zeropoet/root-logos", path: work.edition, url: "https://rootlogos.com/#works" },
    sound: score(edition.sound)
  });
}

const manifest = {
  schema: "zeropoet-sound-source/v1",
  source_id: "root-logos",
  authority: "Root Logos",
  canonical_url: "https://rootlogos.com/",
  entries
};
const output = `${JSON.stringify(manifest, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8");
  if (current !== output) throw new Error("Root Logos sound archive is stale; run node scripts/record-sound-archive.mjs");
  console.log(`Verified ${entries.length} playable Root Logos voices.`);
} else {
  await writeFile(target, output);
  console.log(`Wrote ${entries.length} playable Root Logos voices.`);
}
