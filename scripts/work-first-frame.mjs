#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const root = resolve(new URL("..", import.meta.url).pathname);
const outputRoot = join(root, "assets", "library-first-frames");
const archiveRoot = join(root, "works");
const BIBLE_COLLECTION = "Original Douay-Rheims Catholic Canon";
const WIDTH = 2400;
const HEIGHT = 2400;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const slug = (value) => String(value).toLowerCase().normalize("NFKD")
  .replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
const digest = (value) => createHash("sha256").update(value).digest("hex");

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};
const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
};
const encodePng = (pixels, width, height) => {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1);
    scanlines[target] = 0;
    pixels.copy(scanlines, target + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
};

class Raster {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = Buffer.alloc(width * height * 4);
    for (let index = 3; index < this.pixels.length; index += 4) this.pixels[index] = 255;
  }

  blend(x, y, alpha) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height || alpha <= 0) return;
    const index = (py * this.width + px) * 4;
    const value = Math.round(255 * clamp(alpha, 0, 1));
    this.pixels[index] = Math.max(this.pixels[index], value);
    this.pixels[index + 1] = Math.max(this.pixels[index + 1], value);
    this.pixels[index + 2] = Math.max(this.pixels[index + 2], value);
  }

  circle(x, y, radius, alpha = 1) {
    const extent = Math.ceil(radius);
    for (let offsetY = -extent; offsetY <= extent; offsetY += 1) {
      for (let offsetX = -extent; offsetX <= extent; offsetX += 1) {
        const distance = Math.hypot(offsetX, offsetY);
        if (distance > radius) continue;
        const edge = clamp(radius - distance, 0, 1);
        this.blend(x + offsetX, y + offsetY, alpha * edge);
      }
    }
  }

  line(from, to, width = 1, alpha = 1, control = null) {
    const fromX = from.x ?? from.screenX;
    const fromY = from.y ?? from.screenY;
    const toX = to.x ?? to.screenX;
    const toY = to.y ?? to.screenY;
    const distance = Math.max(1, Math.hypot(toX - fromX, toY - fromY));
    const steps = Math.ceil(distance * 1.3);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const inverse = 1 - t;
      const x = control
        ? inverse * inverse * fromX + 2 * inverse * t * control.x + t * t * toX
        : fromX + (toX - fromX) * t;
      const y = control
        ? inverse * inverse * fromY + 2 * inverse * t * control.y + t * t * toY
        : fromY + (toY - fromY) * t;
      this.circle(x, y, Math.max(.7, width / 2), alpha);
    }
  }

  ellipse(centerX, centerY, radiusX, radiusY, rotation, alpha) {
    const steps = Math.ceil(Math.PI * Math.max(radiusX, radiusY) * 1.4);
    let previous = null;
    for (let index = 0; index <= steps; index += 1) {
      const angle = index / steps * Math.PI * 2;
      const x = Math.cos(angle) * radiusX;
      const y = Math.sin(angle) * radiusY;
      const point = {
        x: centerX + x * Math.cos(rotation) - y * Math.sin(rotation),
        y: centerY + x * Math.sin(rotation) + y * Math.cos(rotation)
      };
      if (previous) this.line(previous, point, 1, alpha);
      previous = point;
    }
  }
}

const hash = (value) => {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 4294967295;
};
const weightScale = (weight, maximum) =>
  Math.log1p(Math.max(0, Number(weight) || 0)) / Math.log1p(Math.max(1, maximum));

const arrangeWeighted = (edition) => {
  const nodes = edition.visual.topology.nodes.map((node) => ({ ...node }));
  const edges = edition.visual.topology.edges.map((edge) => ({ ...edge }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map((node) => [node.id, []]));
  const maxNodeWeight = Math.max(1, ...nodes.map(({ weight }) => Math.max(0, Number(weight) || 0)));
  const maxEdgeWeight = Math.max(1, ...edges.map(({ weight }) => Math.max(0, Number(weight) || 0)));
  edges.forEach((edge) => {
    const weight = Math.max(0, Number(edge.weight) || 0);
    edge.morphWeight = weightScale(weight, maxEdgeWeight);
    adjacency.get(edge.from)?.push({ id: edge.to, weight, edge });
    adjacency.get(edge.to)?.push({ id: edge.from, weight, edge });
  });
  nodes.forEach((node) => {
    const relations = adjacency.get(node.id) || [];
    node.weightMass = weightScale(node.weight, maxNodeWeight);
    node.relationMass = weightScale(
      relations.reduce((sum, relation) => sum + relation.weight, 0),
      Math.max(1, maxEdgeWeight * relations.length)
    );
    node.visualMass = clamp(node.weightMass * .58 + node.relationMass * .42, 0, 1);
  });
  const work = nodes.find(({ type }) => type === "work");
  const documents = nodes.filter(({ type }) => type === "document");
  const concepts = nodes.filter(({ type }) => type === "concept")
    .sort((left, right) => right.visualMass - left.visualMass || left.id.localeCompare(right.id));
  const signature = `${edition.source_hash}:${edition.edition_id}`;
  const phase = hash(signature) * Math.PI * 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const place = (node, x, y, z = 0) => Object.assign(node, { layoutX: x, layoutY: y, layoutZ: z });
  if (work) place(work, 0, 0, 0);
  documents.forEach((node, index) => {
    const progress = documents.length === 1 ? .5 : index / (documents.length - 1);
    const angle = phase + index * golden;
    const reach = documents.length === 1 ? .12 : .18 + Math.sin(progress * Math.PI) * .38;
    place(node, Math.cos(angle) * reach, (progress - .5) * 1.45, Math.sin(angle) * reach);
  });
  concepts.forEach((node, index) => {
    const relations = (adjacency.get(node.id) || [])
      .map((relation) => ({ ...relation, node: byId.get(relation.id) }))
      .filter(({ node: related }) => related?.type === "document")
      .sort((left, right) => right.weight - left.weight);
    const anchor = relations[0]?.node || work;
    const angle = phase + index * golden + hash(node.id) * .72;
    const reach = .22 + (1 - node.visualMass) * .48;
    place(node,
      (anchor?.layoutX || 0) * .62 + Math.cos(angle) * reach,
      (anchor?.layoutY || 0) * .62 + Math.sin(angle * 1.37) * reach * .7,
      (anchor?.layoutZ || 0) * .62 + Math.sin(angle) * reach);
    node.community = anchor?.id || "work";
  });
  const movable = nodes.filter((node) => node !== work);
  for (let iteration = 0; iteration < 72; iteration += 1) {
    const cooling = 1 - iteration / 90;
    const force = new Map(movable.map((node) => [node.id, { x: 0, y: 0, z: 0 }]));
    for (let leftIndex = 0; leftIndex < movable.length; leftIndex += 1) {
      const left = movable[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < movable.length; rightIndex += 1) {
        const right = movable[rightIndex];
        const dx = left.layoutX - right.layoutX;
        const dy = left.layoutY - right.layoutY;
        const dz = left.layoutZ - right.layoutZ;
        const distanceSquared = Math.max(.008, dx * dx + dy * dy + dz * dz);
        const repulsion = (.0007 + (left.visualMass + right.visualMass) * .00045) / distanceSquared;
        force.get(left.id).x += dx * repulsion;
        force.get(left.id).y += dy * repulsion;
        force.get(left.id).z += dz * repulsion;
        force.get(right.id).x -= dx * repulsion;
        force.get(right.id).y -= dy * repulsion;
        force.get(right.id).z -= dz * repulsion;
      }
    }
    edges.forEach((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) return;
      const dx = to.layoutX - from.layoutX;
      const dy = to.layoutY - from.layoutY;
      const dz = to.layoutZ - from.layoutZ;
      const distance = Math.max(.01, Math.hypot(dx, dy, dz));
      const desired = .17 + (1 - edge.morphWeight) * .36;
      const spring = (distance - desired) * (.0018 + edge.morphWeight * .0045);
      for (const [node, direction] of [[from, 1], [to, -1]]) {
        const nodeForce = force.get(node.id);
        if (!nodeForce) continue;
        nodeForce.x += dx / distance * spring * direction;
        nodeForce.y += dy / distance * spring * direction;
        nodeForce.z += dz / distance * spring * direction;
      }
    });
    movable.forEach((node) => {
      const nodeForce = force.get(node.id);
      const gravity = .0012 + node.visualMass * .0022;
      nodeForce.x -= node.layoutX * gravity;
      nodeForce.y -= node.layoutY * gravity * .42;
      nodeForce.z -= node.layoutZ * gravity;
      node.layoutX += clamp(nodeForce.x, -.025, .025) * cooling;
      node.layoutY += clamp(nodeForce.y, -.025, .025) * cooling;
      node.layoutZ += clamp(nodeForce.z, -.025, .025) * cooling;
    });
  }
  const extent = Math.max(.5, ...nodes.flatMap((node) => [
    Math.abs(node.layoutX || 0), Math.abs(node.layoutY || 0) * .78, Math.abs(node.layoutZ || 0)
  ]));
  const normalization = .94 / extent;
  nodes.forEach((node) => {
    node.layoutX *= normalization;
    node.layoutY *= normalization;
    node.layoutZ *= normalization;
  });
  return {
    nodes, edges,
    morphology: {
      phase,
      chambers: Math.max(1, documents.length),
      density: clamp(edges.length / Math.max(1, nodes.length * (nodes.length - 1) / 2), 0, 1),
      concentration: nodes.reduce((sum, node) => sum + node.visualMass, 0) / Math.max(1, nodes.length)
    }
  };
};

const renderWeighted = (edition) => {
  const raster = new Raster(WIDTH, HEIGHT);
  const { nodes, edges, morphology } = arrangeWeighted(edition);
  const centerX = WIDTH * .5;
  const centerY = HEIGHT * .5;
  const radius = Math.min(WIDTH, HEIGHT) * .37;
  const shells = clamp(Math.round(2 + Math.sqrt(morphology.chambers)), 3, 8);
  for (let shell = 1; shell <= shells; shell += 1) {
    const scale = shell / shells;
    raster.ellipse(centerX, centerY,
      radius * scale * (.7 + morphology.concentration * .28),
      radius * scale * (.34 + morphology.density * .34),
      morphology.phase * .08,
      .055 + morphology.density * .085 + (shells - shell) * .008);
  }
  nodes.forEach((node) => {
    node.screenX = centerX + (node.layoutX || 0) * radius;
    node.screenY = centerY + (node.layoutY || 0) * radius * .72 + (node.layoutZ || 0) * radius * .07;
    node.depth = clamp(.72 + ((node.layoutZ || 0) + 1) * .15, .55, 1.05);
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  edges.forEach((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return;
    const emphasis = edge.morphWeight ?? 0;
    const direction = from.community && from.community === to.community ? -1 : 1;
    raster.line(from, to, 1.5 + emphasis * 3.4, .14 + emphasis * .46, {
      x: (from.screenX + to.screenX) / 2,
      y: (from.screenY + to.screenY) / 2 + direction * Math.min(60, Math.abs(to.screenX - from.screenX) * .08)
    });
  });
  [...nodes].sort((left, right) => left.depth - right.depth).forEach((node) => {
    const size = node.type === "work"
      ? 22
      : node.type === "document"
        ? 7.2 + (node.visualMass ?? .3) * 8
        : 3.6 + (node.visualMass ?? .3) * 10.5;
    raster.circle(node.screenX, node.screenY, size * node.depth, clamp(.62 + node.depth * .34, .68, .98));
  });
  return raster.pixels;
};

const renderCorpus = (corpus) => {
  const raster = new Raster(WIDTH, HEIGHT);
  const nodes = corpus.visual.topology.nodes.map((node, index, all) => ({
    ...node,
    angle: node.angle ?? index / Math.max(1, all.length) * Math.PI * 2,
    band: node.band ?? 0
  }));
  const centerX = WIDTH * .5;
  const centerY = HEIGHT * .5;
  const radius = Math.min(WIDTH, HEIGHT) * .37;
  nodes.forEach((node) => {
    const perspective = .7 + Math.sin(node.angle) * .3;
    node.screenX = centerX + Math.cos(node.angle) * radius * node.band;
    node.screenY = centerY + Math.sin(node.angle) * radius * node.band * .54;
    node.depth = perspective;
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  corpus.visual.topology.edges.forEach((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return;
    raster.line(from, to, 1.7, clamp(.2 + Number(edge.weight || 1) * .018, .24, .62), { x: centerX, y: centerY });
  });
  nodes.sort((left, right) => left.depth - right.depth).forEach((node) => {
    const size = node.type === "work" ? 22 : node.type === "document" ? 10 : 5;
    raster.circle(node.screenX, node.screenY, size * node.depth, clamp(.7 + node.depth * .27, .74, .98));
  });
  return raster.pixels;
};

const frameName = (order, id) => `${String(order).padStart(2, "0")}-${slug(id)}.png`;

const currentLibraryFrames = async () => {
  const [index, corpus] = await Promise.all([
    readFile(join(archiveRoot, "index.json"), "utf8").then(JSON.parse),
    readFile(join(archiveRoot, "corpora", "original-douay-rheims.json"), "utf8").then(JSON.parse)
  ]);
  const works = (index.works || [])
    .filter(({ collection, library_order: order }) => collection !== BIBLE_COLLECTION && order != null)
    .sort((left, right) => Number(left.library_order) - Number(right.library_order));
  return { index, corpus, works };
};

export const renderLibraryFirstFrames = async () => {
  const { corpus, works } = await currentLibraryFrames();
  const frames = [];
  await mkdir(outputRoot, { recursive: true });
  for (const entry of works) {
    const edition = JSON.parse(await readFile(resolve(root, entry.edition), "utf8"));
    const filename = frameName(entry.library_order, entry.work_id);
    const png = encodePng(renderWeighted(edition), WIDTH, HEIGHT);
    await writeFile(join(outputRoot, filename), png);
    frames.push({
      order: Number(entry.library_order), work_id: entry.work_id, title: entry.title,
      edition_id: edition.edition_id, file: `assets/library-first-frames/${filename}`,
      width: WIDTH, height: HEIGHT, sha256: digest(png)
    });
  }
  const corpusFilename = frameName(1, "original-douay-rheims");
  const corpusPng = encodePng(renderCorpus(corpus), WIDTH, HEIGHT);
  await writeFile(join(outputRoot, corpusFilename), corpusPng);
  frames.push({
    order: 1, work_id: corpus.corpus_id, title: corpus.title,
    edition_id: `corpus-${corpus.sound.signature}`,
    file: `assets/library-first-frames/${corpusFilename}`,
    width: WIDTH, height: HEIGHT, sha256: digest(corpusPng)
  });
  frames.sort((left, right) => left.order - right.order);
  const expected = new Set(frames.map(({ file }) => basename(file)));
  for (const filename of await readdir(outputRoot)) {
    if (filename.endsWith(".png") && !expected.has(filename)) await unlink(join(outputRoot, filename));
  }
  const manifest = {
    schema: "root-logos-library-first-frames/v1",
    generated_at: new Date().toISOString(),
    renderer: "deterministic-weighted-topology-raster/v3-engraved-depth",
    resolution: { width: WIDTH, height: HEIGHT },
    frames
  };
  await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
};

export const validateLibraryFirstFrames = async () => {
  const [{ corpus, works }, manifest] = await Promise.all([
    currentLibraryFrames(),
    readFile(join(outputRoot, "manifest.json"), "utf8").then(JSON.parse)
  ]);
  if (manifest.schema !== "root-logos-library-first-frames/v1") throw new Error("Unexpected first-frame manifest schema.");
  if (manifest.resolution?.width !== WIDTH || manifest.resolution?.height !== HEIGHT) {
    throw new Error(`First-frame resolution must remain ${WIDTH}×${HEIGHT}.`);
  }
  const expected = [
    ...works.map((entry) => ({
      order: Number(entry.library_order),
      work_id: entry.work_id,
      edition_id: null,
      file: `assets/library-first-frames/${frameName(entry.library_order, entry.work_id)}`
    })),
    {
      order: 1,
      work_id: corpus.corpus_id,
      edition_id: `corpus-${corpus.sound.signature}`,
      file: `assets/library-first-frames/${frameName(1, "original-douay-rheims")}`
    }
  ].sort((left, right) => left.order - right.order);
  if (manifest.frames?.length !== expected.length) {
    throw new Error(`Expected ${expected.length} first frames; found ${manifest.frames?.length || 0}.`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    const wanted = expected[index];
    const actual = manifest.frames[index];
    if (actual.order !== wanted.order || actual.work_id !== wanted.work_id || actual.file !== wanted.file) {
      throw new Error(`First-frame identity mismatch at Library order ${wanted.order}.`);
    }
    const bytes = await readFile(resolve(root, actual.file));
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error(`${actual.file} is not a PNG.`);
    }
    if (bytes.readUInt32BE(16) !== WIDTH || bytes.readUInt32BE(20) !== HEIGHT) {
      throw new Error(`${actual.file} is not ${WIDTH}×${HEIGHT}.`);
    }
    if (digest(bytes) !== actual.sha256) throw new Error(`${actual.file} does not match its witnessed SHA-256.`);
    if (wanted.edition_id && actual.edition_id !== wanted.edition_id) {
      throw new Error(`${actual.file} does not represent the current corpus edition.`);
    }
    if (!wanted.edition_id) {
      const entry = works.find(({ work_id }) => work_id === wanted.work_id);
      const edition = JSON.parse(await readFile(resolve(root, entry.edition), "utf8"));
      if (actual.edition_id !== edition.edition_id) {
        throw new Error(`${actual.file} does not represent the current edition of ${entry.title}.`);
      }
    }
  }
  return manifest;
};

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const check = process.argv.includes("--check");
  (check ? validateLibraryFirstFrames() : renderLibraryFirstFrames())
    .then((manifest) => process.stdout.write(`${manifest.frames.length} Library first frames ${check ? "validated" : "rendered"} at ${WIDTH}×${HEIGHT}.\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
