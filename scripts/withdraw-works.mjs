#!/usr/bin/env node

import { basename, resolve } from "node:path";
import { readFile, rm, unlink, writeFile } from "node:fs/promises";

const root = resolve(new URL("..", import.meta.url).pathname);
const indexPath = resolve(root, "works/index.json");
const migrationPath = resolve(root, "works/structural-depth-migration.json");
const framesPath = resolve(root, "assets/library-first-frames/manifest.json");
const withdrawalsPath = resolve(root, "works/withdrawals.json");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = (path) => readFile(path, "utf8").then(JSON.parse);

const requested = new Set(process.argv.slice(2).filter((argument) => !argument.startsWith("--")));
const removeAllNoncompliant = process.argv.includes("--all-noncompliant");
if (!removeAllNoncompliant && requested.size === 0) {
  throw new Error("Usage: node scripts/withdraw-works.mjs --all-noncompliant | <work-id> [...]");
}

const [index, migration, frames, priorWithdrawals] = await Promise.all([
  readJson(indexPath),
  readJson(migrationPath),
  readJson(framesPath),
  readJson(withdrawalsPath).catch(() => ({ schema: "root-logos-library-withdrawals/v1", withdrawals: [] }))
]);
const noncompliant = new Map(migration.works
  .filter(({ status }) => status === "exact-source-required")
  .map((work) => [work.work_id, work]));
const targetIds = removeAllNoncompliant ? new Set(noncompliant.keys()) : requested;
for (const workId of targetIds) {
  if (!noncompliant.has(workId)) {
    throw new Error(`${workId} is not currently marked exact-source-required; refusing automatic withdrawal.`);
  }
}

const removedAt = new Date().toISOString();
const entries = new Map(index.works.map((entry) => [entry.work_id, entry]));
const withdrawals = [];
for (const workId of targetIds) {
  const entry = entries.get(workId);
  if (!entry) throw new Error(`${workId} is absent from the active works index.`);
  const manifest = await readJson(resolve(root, entry.manifest));
  withdrawals.push({
    work_id: workId,
    title: entry.title,
    author: entry.author,
    kind: entry.kind,
    prior_library_order: entry.library_order,
    prior_current_edition: entry.current_edition,
    removed_at: removedAt,
    reason: "Withdrawn from the active Library because no exact witnessed source had passed the structural-depth admission standard.",
    standard: migration.target_work_grammar,
    source_witness: manifest.source_witness?.identity || "unwitnessed",
    historical_recovery: "Prior public lineage remains attributable in Git history; the work may return only through a newly verified exact-source ingestion."
  });
}

index.updated_at = removedAt;
index.works = index.works.filter(({ work_id: workId }) => !targetIds.has(workId));

const removedFrames = [...(frames.frames || []), ...(frames.archive || [])]
  .filter(({ work_id: workId }) => targetIds.has(workId));
frames.generated_at = removedAt;
frames.frames = (frames.frames || []).filter(({ work_id: workId }) => !targetIds.has(workId));
frames.archive = (frames.archive || []).filter(({ work_id: workId }) => !targetIds.has(workId));
const retainedAssets = new Set([...frames.frames, ...frames.archive]
  .flatMap(({ file, svg_file: svgFile }) => [basename(file), basename(svgFile)]));

const mergedWithdrawals = new Map((priorWithdrawals.withdrawals || [])
  .map((record) => [workIdKey(record), record]));
for (const record of withdrawals) mergedWithdrawals.set(workIdKey(record), record);
const withdrawalLedger = {
  schema: "root-logos-library-withdrawals/v1",
  generated_at: removedAt,
  policy: "Active Library membership requires a verified exact source and the current structural-depth grammar. Withdrawal removes the public object and assets without pretending its prior publication never occurred.",
  measures: {
    withdrawals: mergedWithdrawals.size,
    active_coherent_works_after_withdrawal: migration.measures.coherent_works - withdrawals.length
  },
  withdrawals: [...mergedWithdrawals.values()].sort((left, right) =>
    Number(left.prior_library_order) - Number(right.prior_library_order))
};

await Promise.all([
  writeFile(indexPath, json(index)),
  writeFile(framesPath, json(frames)),
  writeFile(withdrawalsPath, json(withdrawalLedger))
]);
for (const frame of removedFrames) {
  for (const path of [frame.file, frame.svg_file]) {
    if (!path || retainedAssets.has(basename(path))) continue;
    await unlink(resolve(root, path)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
for (const workId of targetIds) await rm(resolve(root, "works", workId), { recursive: true, force: true });

process.stdout.write(`Withdrawn ${withdrawals.length} noncompliant work${withdrawals.length === 1 ? "" : "s"} from the active Library.\n`);

function workIdKey(record) {
  return `${record.work_id}:${record.removed_at}`;
}
