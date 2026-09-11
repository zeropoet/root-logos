import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = join(root, "writing", "objects");
const check = process.argv.includes("--check");
const numbers = [52, 53, 54, 55];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stableNumber = (value) => Number.parseInt(sha256(value).slice(0, 8), 16) >>> 0;
const round = (value) => Number(value.toFixed(6));
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;

const parseReadings = (markdown) => Object.fromEntries(markdown
  .split(/\n## (?=\d{2} — )/)
  .slice(1)
  .map((block) => {
    const lines = block.trim().split("\n");
    const match = lines.shift()?.match(/^(\d{2}) — (.+)$/);
    if (!match) return [];
    const prose = lines.join("\n").split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter((part) => part && part !== "---");
    return [Number(match[1]), { number: Number(match[1]), title: match[2], prose }];
  })
  .filter((entry) => entry.length));

const tokensFor = (text) => text.toLowerCase()
  .replace(/[^a-z0-9'’-]+/g, " ")
  .split(/\s+/)
  .filter((token) => token.length > 2);

const deriveGeometry = ({ number, title, prose, branch }) => {
  const tokens = tokensFor(`${title} ${prose.join(" ")}`);
  const frequencies = new Map();
  tokens.forEach((token) => frequencies.set(token, (frequencies.get(token) || 0) + 1));
  const vocabulary = [...frequencies]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 72);
  const points = vocabulary.map(([token, frequency], index) => {
    const seed = stableNumber(`${number}:${token}:${frequency}`);
    const theta = ((seed % 3600) / 3600) * Math.PI * 2;
    const phi = ((((seed >>> 9) % 1800) / 1800) - .5) * Math.PI;
    const semanticMass = Math.min(1, Math.log1p(frequency) / Math.log(8));
    const radius = .34 + semanticMass * .6 + ((seed >>> 18) % 100) / 520;
    return {
      id: `word-${String(index + 1).padStart(3, "0")}`,
      source: "writing",
      token,
      mass: round(semanticMass),
      x: round(Math.cos(phi) * Math.cos(theta) * radius),
      y: round(Math.sin(phi) * radius),
      z: round(Math.cos(phi) * Math.sin(theta) * radius)
    };
  });
  const tonePoints = branch.experiments.tonal.events.map((event, index) => {
    const angle = (event.at / branch.experiments.tonal.duration_seconds) * Math.PI * 2;
    const radius = .42 + Math.min(.54, event.ratio / 4);
    return {
      id: `tone-${String(index + 1).padStart(3, "0")}`,
      source: "sound",
      token: event.source,
      mass: round(event.amplitude / .14),
      x: round(Math.cos(angle) * radius),
      y: round((event.ratio - 1.5) * .38),
      z: round(Math.sin(angle) * radius)
    };
  });
  const allPoints = [...points, ...tonePoints];
  const edges = allPoints.slice(1).map((point, index) => ({
    from: allPoints[Math.max(0, index - (index % 5 === 0 ? Math.min(index, 4) : 0))].id,
    to: point.id,
    relation: point.source === "sound" ? "tone-enters-writing" : "sequential-language",
    weight: round((point.mass + allPoints[index].mass) / 2)
  }));
  return {
    schema: "root-logos-writing-geometry/v1",
    work_number: number,
    coordinate_system: "right-handed / normalized unit field",
    renderer: "root-logos-sigil-point-cloud/v1",
    seed: `sha256:${sha256(`${number}:${title}:${tokens.join(":")}:${branch.experiments.tonal.score_id}`)}`,
    first_frame: { rotation: [0, 0, 0], camera: [0, 0, 3.2], projection: "perspective" },
    points: allPoints,
    edges,
    evolution_boundary: "Point identity is witnessed. Motion and later geometry are append-only versions outside the receipt."
  };
};

const project = (point, size = 1200) => {
  const depth = 3.2 - point.z;
  const scale = 1.85 / depth;
  return {
    x: round(size / 2 + point.x * scale * size * .42),
    y: round(size / 2 - point.y * scale * size * .42),
    depth,
    radius: round(Math.max(1.4, 2 + point.mass * 7) * (3.2 / depth))
  };
};

const renderFirstFrame = (geometry) => {
  const size = 1200;
  const projected = new Map(geometry.points.map((point) => [point.id, project(point, size)]));
  const lines = geometry.edges.map((edge) => {
    const from = projected.get(edge.from);
    const to = projected.get(edge.to);
    if (!from || !to) return "";
    return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="white" stroke-opacity="${round(.1 + edge.weight * .38)}" stroke-width="${round(.45 + edge.weight * 1.1)}"/>`;
  }).join("");
  const points = geometry.points
    .map((point) => ({ point, projection: projected.get(point.id) }))
    .sort((left, right) => right.projection.depth - left.projection.depth)
    .map(({ point, projection }) => `<circle cx="${projection.x}" cy="${projection.y}" r="${projection.radius}" fill="white" fill-opacity="${point.source === "sound" ? .96 : round(.48 + point.mass * .5)}"/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Root Logos work ${geometry.work_number} first frame"><rect width="1200" height="1200" fill="black"/><g>${lines}${points}</g></svg>\n`;
};

const writeOrCheck = async (path, value) => {
  const content = typeof value === "string" ? value : canonical(value);
  if (check) {
    const existing = await readFile(path, "utf8").catch(() => "");
    if (existing !== content) throw new Error(`${path} is not synchronized`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};

const readingState = JSON.parse(await readFile(join(root, "reading", "state.json"), "utf8"));
const readings = parseReadings(await readFile(join(root, "reading", "sequence-52-55.md"), "utf8"));
const records = [];

for (const number of numbers) {
  const reading = readings[number];
  const branch = readingState.branches.find(({ question }) => question.origin === `RL work ${number} / threshold sequence`);
  if (!reading || !branch) throw new Error(`Work ${number} has no canonical writing branch`);
  const geometry = deriveGeometry({ ...reading, branch });
  const geometryContent = canonical(geometry);
  const sound = {
    schema: "root-logos-writing-sound/v1",
    work_number: number,
    branch_id: branch.branch_id,
    score: branch.experiments.tonal,
    renderer: { engine: "root-logos-reading-tone/v1", stereo: "center" },
    evolution_boundary: "The canonical initial tone remains witnessed; later sound states are append-only and need not alter geometry."
  };
  const soundContent = canonical(sound);
  const frame = renderFirstFrame(geometry);
  const base = join(outputRoot, String(number));
  await writeOrCheck(join(base, "receipt", `RL-Writings-${number}.svg`), frame);
  const mintImagePath = join(base, "receipt", `RL-Writings-${number}.jpg`);
  const mintImage = await readFile(mintImagePath).catch(() => {
    throw new Error(`Missing JPEG mint companion: ${mintImagePath}`);
  });
  const writingWitness = sha256(`${reading.title}\n${reading.prose.join("\n\n")}`);
  const geometryWitness = sha256(geometryContent);
  const soundWitness = sha256(soundContent);
  const frameWitness = sha256(frame);
  const mintTitle = `${number} — ${reading.title}`;
  const mintDescription = `${branch.question.text}\n\nWriting ${number} by Root Logos. This token preserves its first observable frame and provides a durable receipt for the writing’s emergence. Its text, geometry, sound, and future relations remain independently addressable within Folio.`;
  const receipt = {
    schema: "root-logos-writing-receipt/v1",
    work_number: number,
    title: reading.title,
    mint: { status: "unminted", token_id: null, contract: null, transaction: null },
    mint_metadata: {
      standard: "root-logos-writing-mint/v1",
      title: mintTitle,
      description: mintDescription,
      image: `writing/objects/${number}/receipt/RL-Writings-${number}.jpg`
    },
    first_frame: {
      path: `writing/objects/${number}/receipt/RL-Writings-${number}.svg`,
      sha256: frameWitness,
      width: 1200,
      height: 1200,
      mint_image: {
        path: `writing/objects/${number}/receipt/RL-Writings-${number}.jpg`,
        sha256: sha256(mintImage),
        width: 1200,
        height: 1200,
        media_type: "image/jpeg"
      }
    },
    witnesses: { writing: writingWitness, geometry_v1: geometryWitness, sound_v1: soundWitness },
    resolver: `https://folio.rootlogos.com/?work=${number}`,
    state_resolver: `https://rootlogos.com/writing/objects/${number}/current.json`,
    principle: "The receipt fixes the work's first observable frame. It does not own or freeze the living work."
  };
  const current = {
    schema: "root-logos-writing-current/v1",
    work_number: number,
    title: reading.title,
    writing: "reading/sequence-52-55.md",
    branch: `reading/state.json#${branch.branch_id}`,
    receipt: `writing/objects/${number}/receipt/receipt.json`,
    geometry: `writing/objects/${number}/geometry/v1.json`,
    sound: `writing/objects/${number}/sound/v1.json`,
    viewer: `https://folio.rootlogos.com/?work=${number}`,
    update_policy: "Geometry and sound advance independently through witnessed, append-only versions."
  };
  const versions = {
    schema: "root-logos-writing-versions/v1",
    work_number: number,
    geometry: [{ version: 1, path: current.geometry, sha256: geometryWitness, status: "current" }],
    sound: [{ version: 1, path: current.sound, sha256: soundWitness, status: "current" }]
  };
  await writeOrCheck(join(base, "geometry", "v1.json"), geometry);
  await writeOrCheck(join(base, "sound", "v1.json"), sound);
  await writeOrCheck(join(base, "receipt", "receipt.json"), receipt);
  await writeOrCheck(join(base, "current.json"), current);
  await writeOrCheck(join(base, "versions.json"), versions);
  records.push({
    work_number: number,
    title: reading.title,
    question: branch.question.text,
    branch_id: branch.branch_id,
    mint_status: "unminted",
    first_frame: receipt.first_frame.path,
    mint_image: receipt.first_frame.mint_image.path,
    receipt: current.receipt,
    current: `writing/objects/${number}/current.json`,
    viewer: `https://folio.rootlogos.com/?work=${number}`,
    point_count: geometry.points.length,
    writing_witness: writingWitness
  });
}

const index = {
  schema: "root-logos-writing-objects/v1",
  title: "Root Logos Writing Objects",
  principle: "Readable without ownership. Mintable as a receipt. Living through independently versioned geometry and sound.",
  order: "work-number-ascending",
  works: records
};
await writeOrCheck(join(outputRoot, "index.json"), index);
console.log(`${check ? "Verified" : "Generated"} ${records.length} independent writing objects.`);
