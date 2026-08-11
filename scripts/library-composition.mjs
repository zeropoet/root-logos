import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = resolve(root, "works/library-composition.json");
const check = process.argv.includes("--check");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const round = (value, precision = 6) => Number(Number(value).toFixed(precision));
const stable = (value) => JSON.stringify(value);

const [index, corpus, frameManifest, priorComposition] = await Promise.all([
  readFile(resolve(root, "works/index.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "works/corpora/original-douay-rheims.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "assets/library-first-frames/manifest.json"), "utf8").then(JSON.parse),
  readFile(outputPath, "utf8").then(JSON.parse).catch(() => null)
]);
const priorPrimitives = new Map((priorComposition?.primitives || [])
  .map((primitive) => [`${primitive.work_id}:${primitive.portrait.png_sha256}`, primitive]));

const byOrder = new Map((index.works || [])
  .filter(({ library_order: order }) => order != null)
  .map((entry) => [Number(entry.library_order), entry]));

const svgFeatures = async (frame) => {
  const source = await readFile(resolve(root, frame.svg_file), "utf8");
  const circles = [...source.matchAll(/<circle\b[^>]*\bcx="([^"]+)"[^>]*\bcy="([^"]+)"[^>]*\br="([^"]+)"/g)]
    .map((match) => match.slice(1).map(Number));
  const paths = [...source.matchAll(/<path\b/g)].length;
  const centroid = circles.reduce((sum, [x, y]) => [sum[0] + x, sum[1] + y], [0, 0])
    .map((value) => value / Math.max(1, circles.length));
  const spread = Math.sqrt(circles.reduce((sum, [x, y]) =>
    sum + ((x - centroid[0]) ** 2 + (y - centroid[1]) ** 2), 0) / Math.max(1, circles.length));
  const radius = circles.reduce((sum, circle) => sum + circle[2], 0) / Math.max(1, circles.length);
  return {
    centroid_x: round(centroid[0] / 2400),
    centroid_y: round(centroid[1] / 2400),
    spread: round(spread / 1200),
    node_density: round(circles.length / 256),
    relation_density: round(paths / 2048),
    mean_node_radius: round(radius / 24),
    nodes: circles.length,
    paths
  };
};

const frameRows = await Promise.all([...frameManifest.frames]
  .sort((left, right) => left.order - right.order)
  .map(async (frame) => {
    const prior = priorPrimitives.get(`${frame.work_id}:${frame.sha256}`);
    if (prior) return {
      ...prior,
      order: Number(frame.order),
      portrait: {
        ...prior.portrait,
        png: frame.file,
        svg: frame.svg_file
      }
    };
    const entry = frame.work_id === corpus.corpus_id ? {
      work_id: corpus.corpus_id,
      title: corpus.title,
      kind: "coherent corpus",
      collection: corpus.title,
      division: "Canonical whole",
      author: "Canonical witnesses",
      current_edition: frame.edition_id
    } : byOrder.get(Number(frame.order));
    if (!entry) throw new Error(`Library order ${frame.order} has no attributable work.`);
    const edition = frame.work_id === corpus.corpus_id
      ? { reading: { dominant_concepts: [] }, sound: corpus.sound }
      : await readFile(resolve(
          root,
          "works",
          entry.work_id,
          "editions",
          frame.edition_id,
          "edition.json"
        ), "utf8").then(JSON.parse);
    return {
      order: Number(frame.order),
      work_id: entry.work_id,
      title: entry.title,
      kind: entry.kind,
      collection: entry.collection || "Root Logos",
      division: entry.division || null,
      author: entry.author || null,
      sealed_edition: frame.edition_id,
      portrait: {
        png: frame.file,
        png_sha256: frame.sha256,
        svg: frame.svg_file,
        svg_sha256: frame.svg_sha256,
        width: frame.width,
        height: frame.height
      },
      visual_signature: await svgFeatures(frame),
      concepts: (edition.reading?.dominant_concepts || []).slice(0, 12).map(({ concept }) => concept),
      sound: {
        signature: edition.sound?.signature || null,
        tempo: Number(edition.sound?.tempo || 48),
        event_count: edition.sound?.events?.length || 0,
        frequencies: (edition.sound?.events || [])
          .filter(({ rest, frequency }) => !rest && Number.isFinite(Number(frequency)))
          .map(({ frequency }) => Number(frequency))
      }
    };
  }));

const featureKeys = [
  "centroid_x", "centroid_y", "spread", "node_density",
  "relation_density", "mean_node_radius"
];
const ranges = Object.fromEntries(featureKeys.map((key) => {
  const values = frameRows.map(({ visual_signature: signature }) => signature[key]);
  return [key, [Math.min(...values), Math.max(...values)]];
}));
const vector = ({ visual_signature: signature }) => featureKeys.map((key) => {
  const [minimum, maximum] = ranges[key];
  return maximum === minimum ? 0 : (signature[key] - minimum) / (maximum - minimum);
});
const visualDistance = (left, right) => Math.sqrt(vector(left)
  .reduce((sum, value, index) => sum + (value - vector(right)[index]) ** 2, 0) / featureKeys.length);
const coherence = (left, right) => {
  const a = new Set(left.concepts);
  const b = new Set(right.concepts);
  const union = new Set([...a, ...b]);
  const shared = [...a].filter((term) => b.has(term));
  return union.size ? shared.length / union.size : 0;
};

const relationMap = new Map();
const addRelation = (kind, left, right, strength, evidence) => {
  if (!left || !right || left.work_id === right.work_id) return;
  const [from, to] = [left, right].sort((a, b) => a.order - b.order);
  const key = `${kind}:${from.work_id}:${to.work_id}`;
  const candidate = {
    id: `relation-${digest(key).slice(0, 12)}`,
    kind,
    from: from.work_id,
    to: to.work_id,
    strength: round(clamp(strength, 0, 1)),
    evidence
  };
  if (!relationMap.has(key) || relationMap.get(key).strength < candidate.strength) {
    relationMap.set(key, candidate);
  }
};

for (const work of frameRows) {
  const candidates = frameRows.filter(({ work_id }) => work_id !== work.work_id)
    .map((candidate) => ({
      candidate,
      distance: visualDistance(work, candidate),
      coherence: coherence(work, candidate)
    }));
  const continuity = [...candidates].sort((a, b) => a.distance - b.distance || a.candidate.order - b.candidate.order)[0];
  const counterpoint = [...candidates].sort((a, b) => b.distance - a.distance || a.candidate.order - b.candidate.order)[0];
  const coherent = [...candidates].sort((a, b) =>
    b.coherence - a.coherence || a.distance - b.distance || a.candidate.order - b.candidate.order)[0];
  addRelation("continuity", work, continuity.candidate, 1 - continuity.distance, {
    visual_distance: round(continuity.distance),
    basis: "nearest normalized SVG geometry"
  });
  addRelation("counterpoint", work, counterpoint.candidate, counterpoint.distance, {
    visual_distance: round(counterpoint.distance),
    basis: "furthest normalized SVG geometry"
  });
  addRelation("coherence", work, coherent.candidate, coherent.coherence, {
    shared_concepts: work.concepts.filter((term) => coherent.candidate.concepts.includes(term)),
    basis: "strongest shared derived language"
  });
}

const collections = new Map();
for (const work of frameRows) {
  if (!collections.has(work.collection)) collections.set(work.collection, []);
  collections.get(work.collection).push(work);
}
for (const members of collections.values()) {
  members.sort((left, right) => left.order - right.order);
  for (let index = 1; index < members.length; index += 1) {
    addRelation("recurrence", members[index - 1], members[index], 1, {
      collection: members[index].collection,
      basis: "adjacent attributable works in one collection"
    });
  }
}

const relations = [...relationMap.values()].sort((left, right) =>
  left.kind.localeCompare(right.kind) || left.from.localeCompare(right.from) || left.to.localeCompare(right.to));
const relationKinds = ["continuity", "coherence", "counterpoint", "recurrence"];
const degree = new Map(frameRows.map(({ work_id }) => [work_id, 0]));
relations.forEach(({ from, to }) => {
  degree.set(from, degree.get(from) + 1);
  degree.set(to, degree.get(to) + 1);
});
const maximumDegree = Math.max(...degree.values());
const golden = Math.PI * (3 - Math.sqrt(5));

const workNodes = frameRows.map((work, index) => {
  const angle = index * golden;
  const radius = 0.78 + (degree.get(work.work_id) / Math.max(1, maximumDegree)) * 0.22;
  return {
    id: work.work_id,
    type: "book",
    level: 0,
    label: work.title,
    coordinate: `root://library-composition/primitive/${work.work_id}`,
    primitive_order: work.order,
    portrait_sha256: work.portrait.png_sha256,
    collection: work.collection,
    weight: degree.get(work.work_id),
    layoutX: round(Math.cos(angle) * radius),
    layoutY: round(0.62 + Math.sin(index * 1.71) * 0.16),
    layoutZ: round(Math.sin(angle) * radius)
  };
});

const byId = new Map(workNodes.map((node) => [node.id, node]));
const relationNodes = relations.map((relation, index) => {
  const from = byId.get(relation.from);
  const to = byId.get(relation.to);
  const familyIndex = relationKinds.indexOf(relation.kind);
  return {
    id: relation.id,
    type: "relation",
    level: 1,
    label: `${relation.kind}: ${from.label} / ${to.label}`,
    coordinate: `root://library-composition/relation/${relation.id}`,
    relation_kind: relation.kind,
    strength: relation.strength,
    weight: 1 + relation.strength * 8,
    layoutX: round((from.layoutX + to.layoutX) * 0.32 + Math.cos(index * golden) * 0.12),
    layoutY: round(0.08 + familyIndex * 0.045 + Math.sin(index * 0.91) * 0.07),
    layoutZ: round((from.layoutZ + to.layoutZ) * 0.32 + Math.sin(index * golden) * 0.12)
  };
});
const grammarNodes = relationKinds.map((kind, index) => ({
  id: `grammar-${kind}`,
  type: "collection",
  level: 2,
  label: kind,
  coordinate: `root://library-composition/grammar/${kind}`,
  weight: relations.filter((relation) => relation.kind === kind).length,
  layoutX: round((index - 1.5) * 0.24),
  layoutY: -0.46,
  layoutZ: round(Math.sin(index * Math.PI / 2) * 0.18)
}));
const libraryNode = {
  id: "library-composition",
  type: "work",
  level: 3,
  label: "Root Logos Library Composition",
  coordinate: "root://library-composition",
  weight: frameRows.length,
  layoutX: 0,
  layoutY: -0.92,
  layoutZ: 0
};
const edges = [];
relations.forEach((relation) => {
  edges.push({
    from: relation.from,
    to: relation.id,
    relation: "enters",
    weight: round(1 + relation.strength * 8),
    relation_kind: relation.kind
  });
  edges.push({
    from: relation.to,
    to: relation.id,
    relation: "enters",
    weight: round(1 + relation.strength * 8),
    relation_kind: relation.kind
  });
  edges.push({
    from: relation.id,
    to: `grammar-${relation.kind}`,
    relation: "composes",
    weight: round(1 + relation.strength * 8),
    relation_kind: relation.kind
  });
});
relationKinds.forEach((kind) => edges.push({
  from: `grammar-${kind}`,
  to: libraryNode.id,
  relation: "emerges-as",
  weight: relations.filter((relation) => relation.kind === kind).length,
  relation_kind: kind
}));

const ratios = [1, 9 / 8, 6 / 5, 4 / 3, 3 / 2, 8 / 5, 2];
const sourceById = new Map(frameRows.map((work) => [work.work_id, work]));
const soundEvents = relations.map((relation, index) => {
  const from = sourceById.get(relation.from);
  const to = sourceById.get(relation.to);
  const sourceFrequency = from.sound.frequencies[index % Math.max(1, from.sound.frequencies.length)] || 55;
  const targetFrequency = to.sound.frequencies[index % Math.max(1, to.sound.frequencies.length)] || 55;
  const interval = ratios[(parseInt(digest(relation.id).slice(0, 4), 16) + index) % ratios.length];
  const relationalRoot = Math.sqrt(sourceFrequency * targetFrequency);
  const frequency = clamp(relationalRoot * interval / 2, 42, 1320);
  return {
    index,
    voice: relation.kind,
    waveform: relation.kind === "counterpoint" ? "sawtooth" : relation.kind === "recurrence" ? "triangle" : "sine",
    frequency: round(frequency, 3),
    amplitude: round(0.018 + relation.strength * 0.036, 4),
    beats: relation.kind === "recurrence" ? 2 : relation.kind === "counterpoint" ? 0.5 : 1,
    rest: index % 17 === 0,
    relation_id: relation.id,
    from_work_id: relation.from,
    to_work_id: relation.to,
    provenance: `${from.title} + ${to.title} / ${relation.kind}`
  };
});

const payload = {
  schema: "root-logos-library-composition/v1",
  grammar: {
    id: "RL-LIB-COMP-0001",
    version: "1.0.0",
    title: "Hierarchy of Emergence",
    levels: [
      { level: 0, id: "sealed-works", claim: "Individual visual and resonant works remain unchanged." },
      { level: 1, id: "witnessed-relations", claim: "Relations arise between sealed works." },
      { level: 2, id: "relation-grammars", claim: "Continuity, coherence, counterpoint, and recurrence organize those relations." },
      { level: 3, id: "library-composition", claim: "The Library emerges without rewriting its members." }
    ]
  },
  source: {
    first_frame_manifest: "assets/library-first-frames/manifest.json",
    first_frame_schema: frameManifest.schema,
    first_frame_generated_at: frameManifest.generated_at
  },
  measures: {
    works: frameRows.length,
    relations: relations.length,
    relation_families: relationKinds.length,
    hierarchy_levels: 4
  },
  primitives: frameRows,
  relations,
  visual: {
    renderer: "hierarchy-of-emergence/v1",
    palette: ["#ffffff", "#d8d8d8", "#a8a8a8", "#787878"],
    motion: { drift: 0.38 },
    topology: {
      nodes: [...workNodes, ...relationNodes, ...grammarNodes, libraryNode],
      edges
    }
  },
  sound: {
    schema: "root-logos-library-composition-score/v1",
    tempo: 47,
    voices: relationKinds,
    events: soundEvents
  },
  boundary: "This composition may relate sealed work portraits and voices. It may not alter, reposition within, or regenerate an individual work."
};
const witness = `sha256:${digest(stable(payload))}`;
const artifact = {
  ...payload,
  composition_id: `library-composition-${witness.slice(7, 19)}`,
  witness,
  sound: {
    ...payload.sound,
    signature: witness.slice(7, 19)
  }
};
const bytes = `${JSON.stringify(artifact, null, 2)}\n`;

if (check) {
  const current = await readFile(outputPath, "utf8");
  if (current !== bytes) throw new Error("The Library composition is behind its sealed work witnesses.");
  process.stdout.write(`${artifact.measures.works} sealed works compose through ${artifact.measures.relations} witnessed relations across ${artifact.measures.hierarchy_levels} visible levels (${artifact.witness}).\n`);
} else {
  await writeFile(outputPath, bytes);
  process.stdout.write(`${artifact.composition_id} written with ${artifact.measures.relations} relations.\n`);
}
