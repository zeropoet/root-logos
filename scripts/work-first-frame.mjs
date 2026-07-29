#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(new URL("..", import.meta.url).pathname);
const outputRoot = join(root, "assets", "library-first-frames");
const archiveRoot = join(root, "works");
const WIDTH = 2400;
const HEIGHT = 2400;
const COMPILED_BIBLE_COLLECTIONS = new Set([
  "Original Douay-Rheims Catholic Canon",
  "King James Bible (1769) Protestant Canon"
]);
const slug = (value) => String(value).toLowerCase().normalize("NFKD")
  .replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const frameStem = (order, id) => `${String(order).padStart(2, "0")}-${slug(id)}`;
const frameName = (order, id, fingerprint) =>
  `${frameStem(order, id)}-${String(fingerprint).slice(0, 12)}.png`;

const contentType = (pathname) => ({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
})[pathname.slice(pathname.lastIndexOf("."))] || "application/octet-stream";

const currentLibraryFrames = async () => {
  const [index, corpus] = await Promise.all([
    readFile(join(archiveRoot, "index.json"), "utf8").then(JSON.parse),
    readFile(join(archiveRoot, "corpora", "original-douay-rheims.json"), "utf8").then(JSON.parse)
  ]);
  const works = (index.works || [])
    .filter(({ collection, library_order: order }) => !COMPILED_BIBLE_COLLECTIONS.has(collection) && order != null)
    .sort((left, right) => Number(left.library_order) - Number(right.library_order));
  return { corpus, works };
};

const startCaptureServer = async () => {
  const server = createServer(async (request, response) => {
    try {
      const requested = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const pathname = requested === "/" ? "/index.html" : requested;
      const filepath = resolve(root, `.${pathname}`);
      if (!filepath.startsWith(`${root}/`) || !(await stat(filepath)).isFile()) throw new Error("not found");
      response.writeHead(200, { "content-type": contentType(filepath), "cache-control": "no-store" });
      response.end(await readFile(filepath));
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
};

const captureLiveLibraryFrames = async ({ corpus, works }) => {
  const { server, origin } = await startCaptureServer();
  let browser;
  try {
    browser = await chromium.launch({
      channel: process.env.ROOT_LOGOS_CHROME_CHANNEL || "chrome",
      headless: true
    });
    const context = await browser.newContext({
      viewport: { width: WIDTH / 2, height: HEIGHT / 2 },
      deviceScaleFactor: 2,
      colorScheme: "dark",
      reducedMotion: "reduce"
    });
    const page = await context.newPage();
    await page.goto(`${origin}/?library-capture=1#works`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.rootLogosWorks?.edition);
    await page.evaluate(() => document.fonts?.ready);

    const capture = async (workId = null) => {
      await page.evaluate(async (selectedWorkId) => {
        const library = window.rootLogosWorks;
        library.stop();
        if (selectedWorkId === null) library.openCorpus();
        else {
          const entry = library.index.works.find(({ work_id: id }) => id === selectedWorkId);
          if (!entry) throw new Error(`Living Library work ${selectedWorkId} is unavailable.`);
          await library.open(entry);
        }
        library.rotation = 0;
        library.targetRotation = 0;
        library.resize();
        Object.getPrototypeOf(library).draw.call(library, performance.now());
        const context = library.context;
        const centerX = library.width * .5;
        const centerY = library.height * .54;
        const bounded = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
        const structured = library.layoutMode !== "orbital" && !library.isCorpus && !library.isLibrary;
        const nodesById = new Map(library.nodes.map((node) => [node.id, node]));
        context.clearRect(0, 0, library.width, library.height);
        context.fillStyle = "#000";
        context.fillRect(0, 0, library.width, library.height);
        context.globalAlpha = 1;
        for (const edge of library.edition.visual.topology.edges) {
          const from = nodesById.get(edge.from);
          const to = nodesById.get(edge.to);
          if (!from || !to) continue;
          const emphasis = edge.morphWeight
            ?? bounded(Math.log1p(Number(edge.weight) || 0) / Math.log(13), 0, 1);
          context.strokeStyle = `rgba(255,255,255,${library.isCorpus
            ? bounded(.045 + Number(edge.weight || 1) * .008, .055, .22)
            : bounded(.08 + emphasis * .5, .1, .58)})`;
          context.lineWidth = library.isCorpus ? .85 : .65 + emphasis * 1.8;
          context.beginPath();
          context.moveTo(from.screenX, from.screenY);
          if (structured) {
            const direction = from.community && from.community === to.community ? -1 : 1;
            context.quadraticCurveTo(
              (from.screenX + to.screenX) / 2,
              (from.screenY + to.screenY) / 2 + direction * Math.min(24, Math.abs(to.screenX - from.screenX) * .08),
              to.screenX,
              to.screenY
            );
          } else {
            context.quadraticCurveTo(centerX, centerY, to.screenX, to.screenY);
          }
          context.stroke();
        }
        [...library.nodes].sort((left, right) => left.depth - right.depth).forEach((node) => {
          const size = node.type === "work"
            ? 11
            : node.type === "document"
              ? 3.6 + (node.visualMass ?? .3) * 3.8
              : 1.7 + (node.visualMass ?? bounded(Math.log1p(Number(node.weight) || 0) / Math.log(13), 0, 1)) * 5.3;
          context.fillStyle = "#fff";
          context.globalAlpha = bounded(.55 + node.depth * .4, .62, 1);
          context.beginPath();
          context.arc(node.screenX, node.screenY, size * node.depth, 0, Math.PI * 2);
          context.fill();
        });
        context.globalAlpha = 1;
        library.draw = () => {};
      }, workId);
      const image = await page.locator("#work-canvas").evaluate((canvas) => ({
        width: canvas.width,
        height: canvas.height,
        data: canvas.toDataURL("image/png").split(",")[1]
      }));
      if (image.width !== WIDTH || image.height !== HEIGHT) {
        throw new Error(`Living Library capture resolved at ${image.width}×${image.height}; expected ${WIDTH}×${HEIGHT}.`);
      }
      return Buffer.from(image.data, "base64");
    };

    const images = new Map();
    for (const entry of works) images.set(entry.work_id, await capture(entry.work_id));
    images.set(corpus.corpus_id, await capture(null));
    await context.close();
    return images;
  } finally {
    if (browser) await browser.close();
    await new Promise((accept) => server.close(accept));
  }
};

export const renderLibraryFirstFrames = async () => {
  const { corpus, works } = await currentLibraryFrames();
  const captures = await captureLiveLibraryFrames({ corpus, works });
  const frames = [];
  await mkdir(outputRoot, { recursive: true });

  for (const entry of works) {
    const edition = JSON.parse(await readFile(resolve(root, entry.edition), "utf8"));
    const png = captures.get(entry.work_id);
    const sha256 = digest(png);
    const filename = frameName(entry.library_order, entry.work_id, sha256);
    await writeFile(join(outputRoot, filename), png);
    frames.push({
      order: Number(entry.library_order),
      work_id: entry.work_id,
      title: entry.title,
      edition_id: edition.edition_id,
      file: `assets/library-first-frames/${filename}`,
      width: WIDTH,
      height: HEIGHT,
      sha256
    });
  }

  const corpusPng = captures.get(corpus.corpus_id);
  const corpusSha256 = digest(corpusPng);
  const corpusFilename = frameName(1, "original-douay-rheims", corpusSha256);
  await writeFile(join(outputRoot, corpusFilename), corpusPng);
  frames.push({
    order: 1,
    work_id: corpus.corpus_id,
    title: corpus.title,
    edition_id: `corpus-${corpus.sound.signature}`,
    file: `assets/library-first-frames/${corpusFilename}`,
    width: WIDTH,
    height: HEIGHT,
    sha256: corpusSha256
  });

  frames.sort((left, right) => left.order - right.order);
  const expected = new Set(frames.map(({ file }) => basename(file)));
  for (const filename of await readdir(outputRoot)) {
    if (filename.endsWith(".png") && !expected.has(filename)) await unlink(join(outputRoot, filename));
  }
  const manifest = {
    schema: "root-logos-library-first-frames/v3",
    generated_at: new Date().toISOString(),
    renderer: "isolated-relational-portrait/v1-lines-and-nodes",
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
  if (manifest.schema !== "root-logos-library-first-frames/v3") throw new Error("Unexpected first-frame manifest schema.");
  if (manifest.renderer !== "isolated-relational-portrait/v1-lines-and-nodes") {
    throw new Error("First frames must contain only the isolated relational portrait.");
  }
  if (manifest.resolution?.width !== WIDTH || manifest.resolution?.height !== HEIGHT) {
    throw new Error(`First-frame resolution must remain ${WIDTH}×${HEIGHT}.`);
  }
  const expected = [
    ...works.map((entry) => ({
      order: Number(entry.library_order),
      work_id: entry.work_id,
      edition_id: null,
      file_stem: `assets/library-first-frames/${frameStem(entry.library_order, entry.work_id)}-`
    })),
    {
      order: 1,
      work_id: corpus.corpus_id,
      edition_id: `corpus-${corpus.sound.signature}`,
      file_stem: `assets/library-first-frames/${frameStem(1, "original-douay-rheims")}-`
    }
  ].sort((left, right) => left.order - right.order);
  if (manifest.frames?.length !== expected.length) {
    throw new Error(`Expected ${expected.length} first frames; found ${manifest.frames?.length || 0}.`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    const wanted = expected[index];
    const actual = manifest.frames[index];
    if (
      actual.order !== wanted.order
      || actual.work_id !== wanted.work_id
      || !actual.file.startsWith(wanted.file_stem)
      || actual.file !== `${wanted.file_stem}${actual.sha256.slice(0, 12)}.png`
    ) {
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
    .then((manifest) => process.stdout.write(
      `${manifest.frames.length} Library first frames ${check ? "validated" : "rendered"} at ${WIDTH}×${HEIGHT}.\n`
    ))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
