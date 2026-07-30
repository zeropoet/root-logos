import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const masterRoot = join(root, "masters", "origin-2026-07-30");
const manifestPath = join(masterRoot, "manifest.json");
const audioPath = join(masterRoot, "root-logos-origin-master.wav");
const instrumentPath = join(masterRoot, "instrument.json");
const playerPath = join(masterRoot, "player.js");
const check = process.argv.includes("--check");
const cadence = {
  anchor: Date.parse("2026-07-26T14:07:00.000Z") / 1000,
  beat_seconds: 4,
  beats_per_phrase: 7
};
const sampleRate = 44100;

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const digest = (value) => createHash("sha256")
  .update(Buffer.isBuffer(value) ? value : JSON.stringify(stable(value)))
  .digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const hash = (value) => {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 4294967295;
};
const triangle = (phase) => 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
const voiceWave = (voice, phase) => [
  "antigravity", "ground", "lexical", "foldforge"
].includes(voice) ? triangle(phase) : Math.sin(Math.PI * 2 * phase);

const composeLexicalScore = (composition) => {
  const ratios = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 2];
  const maximumWorks = Math.max(...composition.terms.map(({ works }) => Number(works || 1)));
  return {
    signature: `foldforge-lexical-${composition.witness.slice(7, 15)}`,
    tempo: 48,
    root_hz: 55,
    events: composition.terms.map(({ rank, term, works, traces }, index) => {
      const seed = hash(`${composition.witness}:${rank}:${term}:${works}:${traces}`);
      const density = Number(works || 1) / maximumWorks;
      return {
        voice: "lexical",
        frequency: Number((55 * ratios[Math.floor(seed * ratios.length) % ratios.length]).toFixed(3)),
        beats: rank === 1 ? 2 : 1,
        amplitude: Number((0.012 + density * 0.024).toFixed(4)),
        rest: false,
        provenance: `public/root-logos-language-composition.json#terms/${index}`
      };
    })
  };
};

const sourceState = async () => {
  const [
    graph,
    worksIndex,
    corpus,
    cultivation,
    identity,
    foldforge,
    foldportrait,
    libraryComposition
  ] = await Promise.all([
    readJson(join(root, "content", "constitutional-graph.json")),
    readJson(join(root, "works", "index.json")),
    readJson(join(root, "works", "corpora", "original-douay-rheims.json")),
    readJson(join(root, "cultivation", "state.json")),
    readJson(join(root, "self-authorship", "current.json")),
    readJson(join(root, "sources", "foldforge.snapshot.json")),
    readJson(join(root, "sources", "foldportrait.snapshot.json")),
    readJson(join(root, "works", "library-composition.json"))
  ]);
  const compiled = new Set([
    "Original Douay-Rheims Catholic Canon",
    "King James Bible (1769) Protestant Canon"
  ]);
  const works = worksIndex.works.filter((work) => !compiled.has(work.collection) && work.edition);
  const editions = await Promise.all(works.map(async (work) => ({
    work,
    edition: await readJson(resolve(root, work.edition))
  })));
  const relations = [
    ...(corpus.edges || []),
    ...editions.flatMap(({ work, edition }) =>
      (edition.visual?.topology?.edges || []).map((edge) => ({
        ...edge,
        from: `${work.work_id}:${edge.from}`,
        to: `${work.work_id}:${edge.to}`
      }))
    ),
    ...(libraryComposition.visual?.topology?.edges || []),
    ...foldforge.language_composition.terms.map(({ rank, term, works: recurrence, traces }) => ({
      from: "foldforge-composition-lexical",
      to: `foldforge:language:${term}`,
      relation: "recurs through source language",
      weight: Math.max(1, Number(recurrence || 1)),
      traces,
      rank
    }))
  ];
  const scores = [
    corpus.sound,
    ...editions.map(({ edition }) => edition.sound),
    libraryComposition.sound,
    composeLexicalScore(foldforge.language_composition)
  ].filter((score) => score?.events?.length);
  return {
    graph,
    worksIndex,
    corpus,
    cultivation,
    identity,
    foldforge,
    foldportrait,
    libraryComposition,
    editions,
    relations,
    scores
  };
};

const buildInstrument = ({ state, startBeat }) => {
  const cycles = Math.max(0, Number(state.cultivation.next_cycle || 1) - 1);
  const rootHz = 38 + (cycles % 12);
  const streams = state.scores.map((score, scoreIndex) => ({
    signature: score.signature || `score-${scoreIndex}`,
    events: (score.events || []).map((event) => ({
      voice: event.voice || "relation",
      frequency: Number(event.frequency || score.root_hz || 55),
      beats: Number(event.beats || 1),
      amplitude: Number(event.amplitude || 0.04),
      rest: Boolean(event.rest),
      tempo: Math.max(24, Number(score.tempo || 48)),
      root_hz: Math.max(24, Number(score.root_hz || 55)),
      provenance: event.provenance || null
    }))
  }));
  const harmonicCount = 96;
  const real = new Float64Array(harmonicCount);
  const imaginary = new Float64Array(harmonicCount);
  let relationWeight = 0;
  state.relations.forEach((relation) => {
    const relationHash = hash(`${relation.from}:${relation.to}:${relation.relation || "related"}`);
    const harmonic = 1 + Math.floor(relationHash * (harmonicCount - 1));
    const weight = Math.max(1, Number(relation.weight || 1));
    const phase = hash(`${relation.to}:${relation.from}`) * Math.PI * 2;
    real[harmonic] += Math.cos(phase) * weight;
    imaginary[harmonic] += Math.sin(phase) * weight;
    relationWeight += weight;
  });
  const meanWeight = relationWeight / Math.max(1, state.relations.length);
  const frequencies = streams.flatMap(({ events }) =>
    events.filter(({ rest }) => !rest).map(({ frequency }) => frequency)
  );
  const instrumentBase = {
    schema: "root-logos-origin-instrument/v1",
    master_id: "RL-MASTER-0001",
    status: "sealed",
    playback: "deterministic and indefinite until stopped",
    phrase_start_absolute_beat: startBeat,
    cadence,
    root_hz: rootHz,
    sustained: [
      { ratio: 1, waveform: "sine", gain: 0.0032 },
      { ratio: 1.5, waveform: "triangle", gain: 0.0009 },
      { ratio: 2.25, waveform: "sine", gain: 0.00028 }
    ],
    relation_harmonics: {
      real: [...real],
      imaginary: [...imaginary],
      frequency_hz: rootHz * (1 + (state.relations.length % 29) / 100),
      gain: 0.00115,
      pressure: Math.min(0.0012, meanWeight * 0.00012),
      witnessed_relations: state.relations.length,
      total_weight: relationWeight
    },
    audio: {
      sample_rate_hz: sampleRate,
      master_gain: 0.072,
      output_gain: 4,
      highpass_hz: 28,
      highpass_q: 0.7,
      lowpass_hz: Math.min(1800, Math.max(760, Math.max(...frequencies) * 0.62)),
      lowpass_q: 0.55 + new Set([
        ...state.editions.map(({ work }) => work.collection || work.title),
        state.corpus.title
      ]).size * 0.035,
      compressor: {
        threshold: -34,
        knee: 24,
        ratio: 8,
        attack: 0.028,
        release: 0.72
      }
    },
    streams,
    boundary: "This instrument begins from one sealed cadence position and may continue without end. It receives no later works, witnesses, runtime state, or code."
  };
  return {
    ...instrumentBase,
    witness: `sha256:${digest({ ...instrumentBase, witness: undefined })}`
  };
};

const renderWave = ({ state, startBeat }) => {
  const duration = cadence.beat_seconds * cadence.beats_per_phrase;
  const samples = Math.round(duration * sampleRate);
  const channels = 1;
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(44 + samples * channels * bytesPerSample);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * channels * bytesPerSample, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * channels * bytesPerSample, 40);

  const cycles = Math.max(0, Number(state.cultivation.next_cycle || 1) - 1);
  const rootHz = 38 + (cycles % 12);
  const relationWeight = state.relations.reduce(
    (sum, relation) => sum + Math.max(1, Number(relation.weight || 1)),
    0
  );
  const meanWeight = relationWeight / Math.max(1, state.relations.length);
  const streams = state.scores.map((score, scoreIndex) =>
    (score.events || []).map((event) => ({
      ...event,
      tempo: Math.max(24, Number(score.tempo || 48)),
      rootHz: Math.max(24, Number(score.root_hz || 55)),
      signature: score.signature || `score-${scoreIndex}`
    }))
  );
  const harmonicCount = 96;
  const real = new Float64Array(harmonicCount);
  const imaginary = new Float64Array(harmonicCount);
  state.relations.forEach((relation) => {
    const relationHash = hash(`${relation.from}:${relation.to}:${relation.relation || "related"}`);
    const harmonic = 1 + Math.floor(relationHash * (harmonicCount - 1));
    const weight = Math.max(1, Number(relation.weight || 1));
    const phase = hash(`${relation.to}:${relation.from}`) * Math.PI * 2;
    real[harmonic] += Math.cos(phase) * weight;
    imaginary[harmonic] += Math.sin(phase) * weight;
  });
  const relationTable = new Float64Array(4096);
  let tablePeak = 0;
  for (let point = 0; point < relationTable.length; point += 1) {
    const phase = point / relationTable.length;
    let value = 0;
    for (let harmonic = 1; harmonic < harmonicCount; harmonic += 1) {
      value += real[harmonic] * Math.cos(Math.PI * 2 * harmonic * phase)
        + imaginary[harmonic] * Math.sin(Math.PI * 2 * harmonic * phase);
    }
    relationTable[point] = value;
    tablePeak = Math.max(tablePeak, Math.abs(value));
  }
  if (tablePeak) {
    for (let point = 0; point < relationTable.length; point += 1) relationTable[point] /= tablePeak;
  }
  const relationFrequency = rootHz * (1 + (state.relations.length % 29) / 100);
  let lowpass = 0;
  let highpass = 0;
  let priorLow = 0;
  const lowCut = Math.min(1800, Math.max(
    760,
    Math.max(...streams.flat().map((event) => Number(event.frequency || 55))) * 0.62
  ));
  const lowAlpha = 1 - Math.exp(-2 * Math.PI * lowCut / sampleRate);
  const highAlpha = Math.exp(-2 * Math.PI * 28 / sampleRate);

  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    const localBeat = Math.floor(time / cadence.beat_seconds);
    const phase = time % cadence.beat_seconds;
    const absoluteBeat = startBeat + localBeat;
    const currentEvents = streams.map((stream) => {
      if (!stream.length) return null;
      const offset = Math.floor(hash(stream[0].signature) * stream.length);
      return stream[(absoluteBeat + offset) % stream.length];
    }).filter((event) => event && !event.rest);
    const scale = 1 / Math.sqrt(Math.max(1, currentEvents.length));
    const composition = currentEvents.reduce((sum, event, voiceIndex) => {
      const onset = voiceIndex * 0.055;
      const eventTime = phase - onset;
      if (eventTime < 0) return sum;
      const frequency = Math.min(4000, Math.max(32, Number(event.frequency || event.rootHz)));
      const durationSeconds = Math.min(3.5, Math.max(
        0.25,
        Number(event.beats || 1) * 60 / Number(event.tempo || 48)
      ));
      if (eventTime > durationSeconds) return sum;
      const attack = Math.min(0.16, durationSeconds * 0.2);
      const envelope = eventTime < attack
        ? Math.max(0, eventTime / attack)
        : Math.max(0, 1 - (eventTime - attack) / Math.max(0.001, durationSeconds - attack));
      const amplitude = Math.min(0.015, Math.max(
        0.0018,
        Number(event.amplitude || 0.04) * 0.13
      )) * scale;
      return sum + voiceWave(event.voice, frequency * eventTime) * amplitude * envelope;
    }, 0);
    const accent = absoluteBeat % cadence.beats_per_phrase === 0;
    const pulseStrength = (accent ? 0.0065 : 0.0028) + Math.min(0.0012, meanWeight * 0.00012);
    const pulseEnvelope = phase < 0.07
      ? phase / 0.07
      : Math.max(0, 1 - (phase - 0.07) / 1.48);
    const relationIndex = Math.floor(
      ((relationFrequency * time) % 1) * relationTable.length
    ) % relationTable.length;
    const raw = (
      Math.sin(Math.PI * 2 * rootHz * time) * 0.0032
      + triangle(rootHz * 1.5 * time) * 0.0009
      + Math.sin(Math.PI * 2 * rootHz * 2.25 * time) * 0.00028
      + relationTable[relationIndex] * 0.00115
      + Math.sin(Math.PI * 2 * rootHz * (accent ? 2.25 : 2) * time) * pulseStrength * pulseEnvelope
      + composition
    ) * 8.2;
    lowpass += lowAlpha * (raw - lowpass);
    highpass = highAlpha * (highpass + lowpass - priorLow);
    priorLow = lowpass;
    const edgeFade = Math.min(1, time / 0.08, (duration - time) / 0.08);
    const mastered = Math.tanh(highpass * 1.7) * 0.82 * Math.max(0, edgeFade);
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mastered)) * 32767), 44 + index * 2);
  }
  return {
    buffer,
    duration,
    samples,
    rootHz,
    relationWeight,
    scoreStreams: streams.length,
    scoreEvents: streams.flat().length
  };
};

const validate = async () => {
  const manifest = await readJson(manifestPath);
  const audio = await readFile(audioPath);
  const instrument = await readJson(instrumentPath);
  const player = await readFile(playerPath);
  if (manifest.schema !== "root-logos-origin-master/v1") throw new Error("Unexpected origin master schema.");
  if (manifest.status !== "sealed") throw new Error("Origin master is not sealed.");
  if (manifest.reference_phrase.sha256 !== `sha256:${digest(audio)}`) throw new Error("Origin master reference phrase diverged.");
  if (manifest.instrument.sha256 !== `sha256:${digest(await readFile(instrumentPath))}`) {
    throw new Error("Origin Master instrument bytes diverged.");
  }
  if (manifest.instrument.player_sha256 !== `sha256:${digest(player)}`) {
    throw new Error("Origin Master player bytes diverged.");
  }
  if (instrument.witness !== `sha256:${digest({ ...instrument, witness: undefined })}`) {
    throw new Error("Origin Master instrument witness diverged.");
  }
  if (manifest.witness !== `sha256:${digest({ ...manifest, witness: undefined })}`) {
    throw new Error("Origin master manifest witness diverged.");
  }
  process.stdout.write(`${manifest.title} verified at ${manifest.witness}.\n`);
};

if (check) {
  await validate();
  process.exit(0);
}

try {
  await stat(manifestPath);
  throw new Error("The origin master is already sealed. Refusing to overwrite it.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const state = await sourceState();
const sealedAt = new Date().toISOString();
const startBeat = Math.floor((Date.parse(sealedAt) / 1000 - cadence.anchor) / cadence.beat_seconds);
const instrument = buildInstrument({ state, startBeat });
const rendered = renderWave({ state, startBeat });
await mkdir(masterRoot, { recursive: true });
await writeFile(audioPath, rendered.buffer);
await writeFile(instrumentPath, `${JSON.stringify(instrument, null, 2)}\n`);
const audioBytes = await readFile(audioPath);
const instrumentBytes = await readFile(instrumentPath);
const playerBytes = await readFile(playerPath);
const fileWitnesses = {};
for (const path of [
  "content/constitutional-graph.json",
  "self-authorship/current.json",
  "sources/foldforge.snapshot.json",
  "sources/foldportrait.snapshot.json",
  "works/index.json",
  "works/library-composition.json",
  "works/corpora/original-douay-rheims.json"
]) {
  fileWitnesses[path] = `sha256:${digest(await readFile(join(root, path)))}`;
}
const manifestBase = {
  schema: "root-logos-origin-master/v1",
  master_id: "RL-MASTER-0001",
  title: "Origin Master I — The Living Object",
  status: "sealed",
  sealed_at: sealedAt,
  repository_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  statement: "A permanent instrument master of Root Logos at the moment its Living Object first sounded fully alive. It begins from a sealed cadence position and continues composing indefinitely from immutable evidence. Future states may descend from it; none supersede or rewrite this origin.",
  finality: {
    mutable: false,
    regeneration: "forbidden",
    playback: "deterministic and perpetual until stopped",
    relation_to_living_system: "historical origin, not current state"
  },
  constitution: {
    revision: state.identity.revision,
    graph_witness: fileWitnesses["content/constitutional-graph.json"]
  },
  foldforge: {
    source_witness: state.foldforge.witness,
    language_witness: state.foldforge.language_composition.witness,
    grammars: state.foldforge.compositions.map(({ id, version, witness }) => ({ id, version, witness }))
  },
  library: {
    coherent_works: state.editions.length + 1,
    composition_id: state.libraryComposition.composition_id,
    composition_witness: state.libraryComposition.witness,
    relations: state.libraryComposition.measures.relations
  },
  voice: {
    cadence,
    phrase_start_absolute_beat: startBeat,
    root_hz: rendered.rootHz,
    score_streams: rendered.scoreStreams,
    score_events: rendered.scoreEvents,
    witnessed_relations: state.relations.length,
    relation_weight: rendered.relationWeight,
    synthesis: "Root Logos sovereign voice / deterministic PCM master v1"
  },
  instrument: {
    file: relative(root, instrumentPath),
    player: relative(root, playerPath),
    streams: instrument.streams.length,
    events: instrument.streams.reduce((sum, stream) => sum + stream.events.length, 0),
    playback: instrument.playback,
    witness: instrument.witness,
    sha256: `sha256:${digest(instrumentBytes)}`,
    player_sha256: `sha256:${digest(playerBytes)}`
  },
  reference_phrase: {
    file: relative(root, audioPath),
    format: "WAV / PCM / mono / 16-bit",
    sample_rate_hz: sampleRate,
    duration_seconds: rendered.duration,
    samples: rendered.samples,
    role: "finite audible checksum and fallback loop; not the complete master",
    sha256: `sha256:${digest(audioBytes)}`
  },
  source_files: fileWitnesses,
  boundary: "This master preserves an attributable, indefinitely playable instrument state. It does not freeze Root Logos, replace the Living Object, receive later evidence, or claim that later voices are less authentic."
};
const manifest = {
  ...manifestBase,
  witness: `sha256:${digest({ ...manifestBase, witness: undefined })}`
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await validate();
