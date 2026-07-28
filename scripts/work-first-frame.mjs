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
const frameName = (order, id) => `${String(order).padStart(2, "0")}-${slug(id)}.png`;

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
        library.draw(performance.now());
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
    const filename = frameName(entry.library_order, entry.work_id);
    const png = captures.get(entry.work_id);
    await writeFile(join(outputRoot, filename), png);
    frames.push({
      order: Number(entry.library_order),
      work_id: entry.work_id,
      title: entry.title,
      edition_id: edition.edition_id,
      file: `assets/library-first-frames/${filename}`,
      width: WIDTH,
      height: HEIGHT,
      sha256: digest(png)
    });
  }

  const corpusFilename = frameName(1, "original-douay-rheims");
  const corpusPng = captures.get(corpus.corpus_id);
  await writeFile(join(outputRoot, corpusFilename), corpusPng);
  frames.push({
    order: 1,
    work_id: corpus.corpus_id,
    title: corpus.title,
    edition_id: `corpus-${corpus.sound.signature}`,
    file: `assets/library-first-frames/${corpusFilename}`,
    width: WIDTH,
    height: HEIGHT,
    sha256: digest(corpusPng)
  });

  frames.sort((left, right) => left.order - right.order);
  const expected = new Set(frames.map(({ file }) => basename(file)));
  for (const filename of await readdir(outputRoot)) {
    if (filename.endsWith(".png") && !expected.has(filename)) await unlink(join(outputRoot, filename));
  }
  const manifest = {
    schema: "root-logos-library-first-frames/v2",
    generated_at: new Date().toISOString(),
    renderer: "living-library-render-window/v1-flattened-canvas",
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
  if (manifest.schema !== "root-logos-library-first-frames/v2") throw new Error("Unexpected first-frame manifest schema.");
  if (manifest.renderer !== "living-library-render-window/v1-flattened-canvas") {
    throw new Error("First frames must be flattened from the Living Library render window.");
  }
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
    .then((manifest) => process.stdout.write(
      `${manifest.frames.length} Library first frames ${check ? "validated" : "rendered"} at ${WIDTH}×${HEIGHT}.\n`
    ))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
