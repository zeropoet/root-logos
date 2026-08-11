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
const vectorName = (order, id, fingerprint) =>
  `${frameStem(order, id)}-${String(fingerprint).slice(0, 12)}.svg`;
const decimal = (value) => Number(value.toFixed(3));
const structuralGrammar = (transformation = "") => String(transformation).split("+")[0];
const escapeAttribute = (value) => String(value).replace(/[&"]/g, (character) => character === "&" ? "&amp;" : "&quot;");
const renderSceneSvg = ({ edges, nodes }) => {
  const paths = edges.map(({ alpha, control, coordinate, from, fromCoordinate, lineWidth, to, toCoordinate }) =>
    `  <path data-cwcs="${escapeAttribute(coordinate)}" data-from="${escapeAttribute(fromCoordinate)}" data-to="${escapeAttribute(toCoordinate)}" d="M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}" fill="none" stroke="#fff" stroke-opacity="${alpha}" stroke-width="${lineWidth}"/>`
  );
  const circles = nodes.map(({ alpha, coordinate, radius, x, y }) =>
    `  <circle data-cwcs="${escapeAttribute(coordinate)}" cx="${x}" cy="${y}" r="${radius}" fill="#fff" fill-opacity="${alpha}"/>`
  );
  return `${[
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="Derived relational portrait">`,
    ...paths,
    ...circles,
    "</svg>",
    ""
  ].join("\n")}`;
};

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

const captureLiveLibraryFrames = async ({ corpus, works, captureCorpus = true }) => {
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
      const image = await page.locator("#work-canvas").evaluate((canvas) => {
        const library = window.rootLogosWorks;
        const bounded = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
        const structured = library.layoutMode !== "orbital" && !library.isCorpus && !library.isLibrary;
        const nodesById = new Map(library.nodes.map((node) => [node.id, node]));
        const center = { x: library.width * .5, y: library.height * .54 };
        const projectionBase = `root://projection/${encodeURIComponent(library.edition.edition_id)}`;
        const edges = library.edition.visual.topology.edges.flatMap((edge, edgeIndex) => {
          const from = nodesById.get(edge.from);
          const to = nodesById.get(edge.to);
          if (!from || !to) return [];
          const emphasis = edge.morphWeight
            ?? bounded(Math.log1p(Number(edge.weight) || 0) / Math.log(13), 0, 1);
          const control = structured
            ? {
                x: (from.screenX + to.screenX) / 2,
                y: (from.screenY + to.screenY) / 2
                  + (from.community && from.community === to.community ? -1 : 1)
                  * Math.min(24, Math.abs(to.screenX - from.screenX) * .08)
              }
            : center;
          return [{
            from: { x: from.screenX, y: from.screenY },
            to: { x: to.screenX, y: to.screenY },
            coordinate: edge.canonical_coordinate || `${projectionBase}/relation/${String(edgeIndex + 1).padStart(4, "0")}`,
            fromCoordinate: edge.from_coordinate || from.canonical_coordinate || `${projectionBase}/node/${encodeURIComponent(from.id)}`,
            toCoordinate: edge.to_coordinate || to.canonical_coordinate || `${projectionBase}/node/${encodeURIComponent(to.id)}`,
            control,
            alpha: library.isCorpus
              ? bounded(.045 + Number(edge.weight || 1) * .008, .055, .22)
              : bounded(.08 + emphasis * .5, .1, .58),
            lineWidth: library.isCorpus ? .85 : .65 + emphasis * 1.8
          }];
        });
        const nodes = [...library.nodes]
          .sort((left, right) => left.depth - right.depth)
          .map((node) => {
            const size = node.type === "work"
              ? 11
              : node.type === "document"
                ? 3.6 + (node.visualMass ?? .3) * 3.8
                : 1.7 + (node.visualMass
                  ?? bounded(Math.log1p(Number(node.weight) || 0) / Math.log(13), 0, 1)) * 5.3;
            return {
              x: node.screenX,
              y: node.screenY,
              coordinate: node.canonical_coordinate || `${projectionBase}/node/${encodeURIComponent(node.id)}`,
              radius: size * node.depth,
              alpha: bounded(.55 + node.depth * .4, .62, 1)
            };
          });
        return {
          width: canvas.width,
          height: canvas.height,
          data: canvas.toDataURL("image/png").split(",")[1],
          scene: { edges, nodes }
        };
      });
      if (image.width !== WIDTH || image.height !== HEIGHT) {
        throw new Error(`Living Library capture resolved at ${image.width}×${image.height}; expected ${WIDTH}×${HEIGHT}.`);
      }
      return {
        png: Buffer.from(image.data, "base64"),
        svg: renderSceneSvg({
          edges: image.scene.edges.map((edge) => ({
            ...edge,
            alpha: decimal(edge.alpha),
            lineWidth: decimal(edge.lineWidth),
            from: { x: decimal(edge.from.x), y: decimal(edge.from.y) },
            to: { x: decimal(edge.to.x), y: decimal(edge.to.y) },
            control: { x: decimal(edge.control.x), y: decimal(edge.control.y) }
          })),
          nodes: image.scene.nodes.map((node) => ({
            ...node,
            x: decimal(node.x),
            y: decimal(node.y),
            radius: decimal(node.radius),
            alpha: decimal(node.alpha)
          }))
        })
      };
    };

    const images = new Map();
    for (const entry of works) images.set(entry.work_id, await capture(entry.work_id));
    if (captureCorpus) images.set(corpus.corpus_id, await capture(null));
    await context.close();
    return images;
  } finally {
    if (browser) await browser.close();
    await new Promise((accept) => server.close(accept));
  }
};

export const renderLibraryFirstFrames = async () => {
  const { corpus, works } = await currentLibraryFrames();
  const priorManifest = await readFile(join(outputRoot, "manifest.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  const priorByIdentity = new Map((priorManifest?.frames || [])
    .map((frame) => [`${frame.order}:${frame.work_id}`, frame]));
  const changedWorks = [];
  for (const entry of works) {
    const prior = priorByIdentity.get(`${Number(entry.library_order)}:${entry.work_id}`);
    if (!prior) {
      changedWorks.push(entry);
      continue;
    }
    const priorHref = entry.edition_history?.find(({ edition_id: editionId }) =>
      editionId === prior.edition_id)?.href;
    const [priorEdition, currentEdition] = await Promise.all([
      priorHref ? readFile(resolve(root, priorHref), "utf8").then(JSON.parse) : null,
      readFile(resolve(root, entry.edition), "utf8").then(JSON.parse)
    ]);
    if (!priorEdition || structuralGrammar(priorEdition.transformation) !== structuralGrammar(currentEdition.transformation)) {
      changedWorks.push(entry);
    }
  }
  const priorCorpus = priorByIdentity.get(`1:${corpus.corpus_id}`);
  const currentCorpusEdition = `corpus-${corpus.sound.signature}`;
  const corpusChanged = !priorCorpus;
  const captures = changedWorks.length || corpusChanged
    ? await captureLiveLibraryFrames({ corpus, works: changedWorks, captureCorpus: corpusChanged })
    : new Map();
  const frames = [];
  await mkdir(outputRoot, { recursive: true });

  for (const entry of works) {
    const prior = priorByIdentity.get(`${Number(entry.library_order)}:${entry.work_id}`);
    if (prior && !changedWorks.some(({ work_id: workId }) => workId === entry.work_id)) {
      frames.push(prior);
      continue;
    }
    const edition = JSON.parse(await readFile(resolve(root, entry.edition), "utf8"));
    const { png, svg } = captures.get(entry.work_id);
    const sha256 = digest(png);
    const filename = frameName(entry.library_order, entry.work_id, sha256);
    const svgSha256 = digest(svg);
    const svgFilename = vectorName(entry.library_order, entry.work_id, svgSha256);
    await writeFile(join(outputRoot, filename), png);
    await writeFile(join(outputRoot, svgFilename), svg);
    frames.push({
      order: Number(entry.library_order),
      work_id: entry.work_id,
      title: entry.title,
      edition_id: edition.edition_id,
      file: `assets/library-first-frames/${filename}`,
      svg_file: `assets/library-first-frames/${svgFilename}`,
      width: WIDTH,
      height: HEIGHT,
      sha256,
      svg_sha256: svgSha256
    });
  }

  if (!corpusChanged) {
    frames.push(priorCorpus);
  } else {
    const { png: corpusPng, svg: corpusSvg } = captures.get(corpus.corpus_id);
    const corpusSha256 = digest(corpusPng);
    const corpusFilename = frameName(1, "original-douay-rheims", corpusSha256);
    const corpusSvgSha256 = digest(corpusSvg);
    const corpusSvgFilename = vectorName(1, "original-douay-rheims", corpusSvgSha256);
    await writeFile(join(outputRoot, corpusFilename), corpusPng);
    await writeFile(join(outputRoot, corpusSvgFilename), corpusSvg);
    frames.push({
      order: 1,
      work_id: corpus.corpus_id,
      title: corpus.title,
      edition_id: currentCorpusEdition,
      file: `assets/library-first-frames/${corpusFilename}`,
      svg_file: `assets/library-first-frames/${corpusSvgFilename}`,
      width: WIDTH,
      height: HEIGHT,
      sha256: corpusSha256,
      svg_sha256: corpusSvgSha256
    });
  }

  frames.sort((left, right) => left.order - right.order);
  const archivedByEdition = new Map([
    ...((priorManifest?.archive || priorManifest?.frames || []).map((frame) =>
      [`${frame.work_id}:${frame.edition_id}`, frame])),
    ...frames.map((frame) => [`${frame.work_id}:${frame.edition_id}`, frame])
  ]);
  const archive = [...archivedByEdition.values()].sort((left, right) =>
    left.order - right.order || String(left.edition_id).localeCompare(String(right.edition_id)));
  const expected = new Set(archive.flatMap(({ file, svg_file: svgFile }) => [basename(file), basename(svgFile)]));
  for (const filename of await readdir(outputRoot)) {
    if ((filename.endsWith(".png") || filename.endsWith(".svg")) && !expected.has(filename)) {
      await unlink(join(outputRoot, filename));
    }
  }
  const manifest = {
    schema: "root-logos-library-first-frames/v5",
    generated_at: changedWorks.length || corpusChanged
      ? new Date().toISOString()
      : priorManifest.generated_at,
    renderer: "isolated-relational-portrait/v1-lines-and-nodes",
    resolution: { width: WIDTH, height: HEIGHT },
    frames,
    archive
  };
  await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
};

export const validateLibraryFirstFrames = async () => {
  const [{ corpus, works }, manifest] = await Promise.all([
    currentLibraryFrames(),
    readFile(join(outputRoot, "manifest.json"), "utf8").then(JSON.parse)
  ]);
  if (manifest.schema !== "root-logos-library-first-frames/v5") throw new Error("Unexpected first-frame manifest schema.");
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
      file_stem: `assets/library-first-frames/${frameStem(entry.library_order, entry.work_id)}-`
    })),
    {
      order: 1,
      work_id: corpus.corpus_id,
      file_stem: `assets/library-first-frames/${frameStem(1, "original-douay-rheims")}-`
    }
  ].sort((left, right) => left.order - right.order);
  if (manifest.frames?.length !== expected.length) {
    throw new Error(`Expected ${expected.length} first frames; found ${manifest.frames?.length || 0}.`);
  }
  const archived = new Map((manifest.archive || []).map((frame) =>
    [`${frame.work_id}:${frame.edition_id}`, frame]));
  for (const frame of manifest.frames || []) {
    if (!archived.has(`${frame.work_id}:${frame.edition_id}`)) {
      throw new Error(`${frame.title} current portrait is absent from its visual lineage.`);
    }
  }
  for (let index = 0; index < expected.length; index += 1) {
    const wanted = expected[index];
    const actual = manifest.frames[index];
    if (
      actual.order !== wanted.order
      || actual.work_id !== wanted.work_id
      || !actual.file.startsWith(wanted.file_stem)
      || actual.file !== `${wanted.file_stem}${actual.sha256.slice(0, 12)}.png`
      || actual.svg_file !== `${wanted.file_stem}${actual.svg_sha256.slice(0, 12)}.svg`
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
    const svg = await readFile(resolve(root, actual.svg_file), "utf8");
    if (!svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg"`)) {
      throw new Error(`${actual.svg_file} is not an SVG.`);
    }
    if (!svg.includes(`viewBox="0 0 ${WIDTH} ${HEIGHT}"`)) {
      throw new Error(`${actual.svg_file} does not preserve the canonical portrait coordinates.`);
    }
    if (/<(?:rect|image|text|foreignObject)\b/.test(svg)) {
      throw new Error(`${actual.svg_file} contains a background or presentation layer; only paths and circles are permitted.`);
    }
    if (!/<circle data-cwcs="root:\/\//.test(svg) || !/<path data-cwcs="root:\/\//.test(svg)) {
      throw new Error(`${actual.svg_file} does not carry canonical coordinates on its dots and lines.`);
    }
    if (digest(svg) !== actual.svg_sha256) {
      throw new Error(`${actual.svg_file} does not match its witnessed SHA-256.`);
    }
    if (wanted.work_id === corpus.corpus_id) {
      if (!/^corpus-[a-f0-9]{12}$/.test(actual.edition_id || "")) {
        throw new Error(`${actual.file} does not preserve a sealed corpus edition identity.`);
      }
    } else {
      const entry = works.find(({ work_id }) => work_id === wanted.work_id);
      if (!entry.edition_history?.some(({ edition_id: editionId }) => editionId === actual.edition_id)) {
        throw new Error(`${actual.file} does not preserve an edition in the lineage of ${entry.title}.`);
      }
    }
  }
  if (archived.size !== manifest.archive.length) {
    throw new Error("Visual lineage contains a duplicate work and edition identity.");
  }
  for (const frame of manifest.archive) {
    const [png, svg] = await Promise.all([
      readFile(resolve(root, frame.file)),
      readFile(resolve(root, frame.svg_file), "utf8")
    ]);
    if (digest(png) !== frame.sha256 || digest(svg) !== frame.svg_sha256) {
      throw new Error(`${frame.title} archived portrait does not match its witnessed SHA-256.`);
    }
    if (frame.work_id !== corpus.corpus_id) {
      const entry = works.find(({ work_id: workId }) => workId === frame.work_id);
      if (!entry?.edition_history?.some(({ edition_id: editionId }) => editionId === frame.edition_id)) {
        throw new Error(`${frame.title} archived portrait is detached from its edition lineage.`);
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
