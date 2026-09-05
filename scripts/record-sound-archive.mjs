import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const target = resolve(root, "content/record-sound-archive.json");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));
const excludedCollections = new Set([
  "Original Douay-Rheims Catholic Canon",
  "King James Bible (1769) Protestant Canon"
]);

const workRenderer = {
  engine: "sequential-event-score/v1",
  masterGain: 0.36,
  outputGain: 2,
  compressor: { threshold: -14, knee: 8, ratio: 10, attack: 0.004, release: 0.22 },
  amplitude: { minimum: 0.018, maximum: 1 },
  envelope: { attackSeconds: 0.08, releaseRatio: 0.9, minimumReleaseSeconds: 0.2 },
  loop: true,
  stereo: "center"
};

const score = (sound) => ({
  mode: "event-score",
  schema: sound.schema,
  signature: sound.signature,
  tempo: sound.tempo,
  rootHz: sound.root_hz,
  renderer: workRenderer,
  events: sound.events.map(({ frequency, waveform, voice, amplitude, beats, rest, provenance }) => ({
    frequency, ...(waveform ? { waveform } : {}), ...(voice ? { voice } : {}),
    amplitude, beats, rest: Boolean(rest), ...(provenance ? { provenance } : {})
  }))
});

const index = await readJson("works/index.json");
const library = await readJson("works/library-composition.json");
const corpus = await readJson("works/corpora/original-douay-rheims.json");
const reading = await readJson("reading/state.json");
const collections = {
  studio: { id: "studio-instruments", title: "Studio Instruments", type: "source-instruments", order: 10 },
  expressions: { id: "root-logos-expressions", title: "Root Logos / Expressions", type: "question-expressions", order: 20 },
  works: { id: "root-logos-works", title: "Root Logos / Works", type: "work-voices", order: 30 }
};
const works = index.works
  .filter(({ collection, edition }) => edition && !excludedCollections.has(collection))
  .sort((a, b) => Number(a.library_order ?? 9999) - Number(b.library_order ?? 9999));

const entries = [{
  id: "root-logos-resonant-chamber",
  title: "The Resonant Chamber",
  branch: "Root Logos",
  kind: "constitutional voice",
  collection: collections.studio,
  availability: "public instrument",
  source: { repository: "zeropoet/root-logos", path: "resonance/grammar.json", url: "https://rootlogos.com/#resonance" },
  sound: {
    rootHz: 55,
    ratios: [1, 1.125, 1.333333, 1.5],
    waves: ["sine", "triangle", "sine", "sine"],
    cutoffHz: 1260,
    renderer: {
      engine: "continuous-voice/v1",
      masterGain: 0.108,
      fadeInSeconds: 1.8,
      fieldFilter: { type: "lowpass", frequency: 1260, Q: 0.7 },
      partialGains: [1, 0.22, 0.08, 0.03],
      stereo: "center"
    }
  }
}, {
  id: "root-logos-library-composition",
  title: "Root Logos — Library Composition",
  branch: "Root Logos / Library",
  kind: "library composition",
  collection: collections.works,
  collection_order: 0,
  availability: "public procedural score",
  source: { repository: "zeropoet/root-logos", path: "works/library-composition.json", url: "https://rootlogos.com/#works" },
  sound: score(library.sound)
}];

for (const [index, branch] of (reading.branches || []).entries()) {
  const tone = branch.experiments?.tonal;
  if (!tone?.events?.length) continue;
  entries.push({
    id: `root-logos-expression-${branch.branch_id.toLowerCase()}`,
    title: `${branch.branch_id} / ${branch.derived_grammar?.name || "Tonal expression"}`,
    branch: "Root Logos / Expressions",
    kind: "question-bearing tonal expression",
    collection: collections.expressions,
    collection_order: index + 1,
    availability: "public procedural score",
    question: branch.question,
    expression: {
      status: branch.status,
      textual_utterance: branch.experiments?.textual?.utterance || [],
      grammar: branch.derived_grammar?.name,
      source_witness: branch.provenance?.source_witness
    },
    source: { repository: "zeropoet/root-logos", path: "reading/state.json", url: "https://rootlogos.com/root-logos-1.6.html#language" },
    sound: {
      mode: "timed-score",
      schema: "root-logos-reading-tone/v1",
      signature: tone.score_id,
      tempo: tone.tempo,
      rootHz: tone.root_hz,
      duration_seconds: tone.duration_seconds,
      renderer: {
        engine: "timed-event-score/v1",
        masterGain: 0.72,
        pitchMultiplier: 2,
        waveformCycle: ["sine", "triangle", "sine"],
        filter: { type: "lowpass", startHz: 720, stepHz: 110 },
        attackMaxSeconds: 0.18,
        attackDurationRatio: 0.22,
        tailSeconds: 0.03,
        loop: true,
        loopGapSeconds: 0.4,
        stereo: "center"
      },
      events: tone.events.map(({ at, duration, ratio, amplitude, source }) => ({ at, duration, ratio, amplitude, source }))
    }
  });
}

entries.push({
  id: `root-logos-${corpus.corpus_id}`,
  title: corpus.title,
  branch: "Root Logos / Library",
  kind: "coherent corpus voice",
  collection: collections.works,
  collection_order: 1,
  availability: "public procedural score",
  source: { repository: "zeropoet/root-logos", path: "works/corpora/original-douay-rheims.json", url: "https://rootlogos.com/#works" },
  sound: score(corpus.sound)
});

for (const work of works) {
  const edition = await readJson(work.edition);
  if (!edition.sound?.events?.length) continue;
  entries.push({
    id: `root-logos-work-${work.work_id}`,
    title: work.title,
    branch: `Root Logos / ${work.collection || "Library"}`,
    kind: `${work.kind} voice`,
    collection: collections.works,
    collection_order: Number(work.library_order ?? 9999) + 1,
    origin_collection: work.collection || "Library",
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
