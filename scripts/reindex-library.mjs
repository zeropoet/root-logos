#!/usr/bin/env node

import { basename, resolve } from "node:path";
import { access, readFile, rename, writeFile } from "node:fs/promises";

const root = resolve(new URL("..", import.meta.url).pathname);
const indexPath = resolve(root, "works/index.json");
const framesPath = resolve(root, "assets/library-first-frames/manifest.json");
const framesRoot = resolve(root, "assets/library-first-frames");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = (path) => readFile(path, "utf8").then(JSON.parse);

const [index, frames] = await Promise.all([readJson(indexPath), readJson(framesPath)]);
const activeFrames = [...frames.frames].sort((left, right) => left.order - right.order);
if (activeFrames.length === 0) throw new Error("The active Library has no first frames.");

const orderByWork = new Map(activeFrames.map((frame, position) => [frame.work_id, position + 1]));
const updatedAt = new Date().toISOString();
const activeEntries = index.works.filter(({ library_order: order }) => order != null);
for (const entry of activeEntries) {
  const order = orderByWork.get(entry.work_id);
  if (!order) throw new Error(`${entry.work_id} has an active Library order but no first frame.`);
  entry.library_order = order;
  const manifestPath = resolve(root, entry.manifest);
  const manifest = await readJson(manifestPath);
  manifest.library_order = order;
  await writeFile(manifestPath, json(manifest));
}
index.updated_at = updatedAt;

const moves = new Map();
const reindexFrame = (frame) => {
  const order = orderByWork.get(frame.work_id);
  if (!order) throw new Error(`${frame.work_id} is present in the first-frame lineage but not the active Library.`);
  const prefix = String(order).padStart(2, "0");
  for (const field of ["file", "svg_file"]) {
    const prior = frame[field];
    const priorName = basename(prior);
    const next = `assets/library-first-frames/${prefix}-${priorName.replace(/^\d{2}-/, "")}`;
    if (prior !== next) moves.set(resolve(root, prior), {
      fallback: resolve(framesRoot, priorName),
      next: resolve(root, next)
    });
    frame[field] = next;
  }
  frame.order = order;
  return frame;
};

frames.frames = frames.frames.map(reindexFrame).sort((left, right) => left.order - right.order);
frames.archive = frames.archive.map(reindexFrame).sort((left, right) =>
  left.order - right.order || String(left.edition_id).localeCompare(String(right.edition_id)));
frames.generated_at = updatedAt;

for (const [prior, { fallback, next }] of moves) {
  if (prior === next) continue;
  let source = prior;
  await access(source).catch(async (error) => {
    if (error.code !== "ENOENT") throw error;
    source = fallback;
    await access(source);
  });
  await rename(source, next);
}
await Promise.all([
  writeFile(indexPath, json(index)),
  writeFile(framesPath, json(frames))
]);

const orders = frames.frames.map(({ order }) => order);
if (orders.some((order, position) => order !== position + 1)) {
  throw new Error("Library reindexing did not produce a continuous one-based sequence.");
}
process.stdout.write(`Reindexed ${frames.frames.length} Library first frames from 1 through ${frames.frames.length}.\n`);
