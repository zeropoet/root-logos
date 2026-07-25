#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { considerSelfAuthorship } from "./self-author.mjs";

const sourceRoot = new URL("../", import.meta.url);
const sandbox = await mkdtemp(join(tmpdir(), "root-logos-self-author-"));
await Promise.all([
  mkdir(join(sandbox, "self-authorship", "lineage"), { recursive: true }),
  mkdir(join(sandbox, "content"), { recursive: true }),
  mkdir(join(sandbox, "cultivation", "cycles"), { recursive: true }),
  cp(new URL("self-authorship/current.json", sourceRoot), join(sandbox, "self-authorship", "current.json")),
  cp(new URL("self-authorship/policy.json", sourceRoot), join(sandbox, "self-authorship", "policy.json")),
  cp(new URL("content/constitutional-graph.json", sourceRoot), join(sandbox, "content", "constitutional-graph.json"))
]);

const implementedId = "RL-CULTIVATE-TEST-A";
await writeFile(join(sandbox, "cultivation", "cycles", `${implementedId}.json`), `${JSON.stringify({
  cultivation_id: implementedId,
  status: "implemented",
  source_snapshot: { combined: "source-witness" },
  selected_finding: { titles: ["Journal Membrane", "Constitutional Object"] },
  application: { operations: [{ operation: "add-edge", from: "journal-membrane", to: "constitutional-object", type: "changes shape through" }] }
}, null, 2)}\n`);
const before = JSON.parse(await readFile(join(sandbox, "self-authorship", "current.json"), "utf8"));
const rewritten = await considerSelfAuthorship({ projectRoot: sandbox, cultivationId: implementedId, sourceEventId: "RL-JOURNAL-TEST00000001" });
assert.equal(rewritten.decision, "rewrite");
const current = JSON.parse(await readFile(join(sandbox, "self-authorship", "current.json"), "utf8"));
assert.notEqual(current.revision, before.revision);
assert.equal(current.supersedes, before.revision);
assert.ok(current.source_lineage.includes(implementedId));
assert.ok(current.source_lineage.includes("RL-JOURNAL-TEST00000001"));
const lineage = JSON.parse(await readFile(join(sandbox, rewritten.lineage), "utf8"));
assert.deepEqual(lineage.previous_identity, before);
assert.equal(lineage.judgment.privacy_audit, "passed");
assert.equal(lineage.judgment.decision, "rewrite");

const rejectedId = "RL-CULTIVATE-TEST-B";
await writeFile(join(sandbox, "cultivation", "cycles", `${rejectedId}.json`), `${JSON.stringify({
  cultivation_id: rejectedId,
  status: "autonomously-rejected",
  source_snapshot: { combined: "source-witness" },
  proposal: { summary: "A rejected proposal remains lineage." }
}, null, 2)}\n`);
const preserved = await considerSelfAuthorship({ projectRoot: sandbox, cultivationId: rejectedId, sourceEventId: "RL-JOURNAL-TEST00000002" });
assert.equal(preserved.decision, "preserve");
const afterPreserve = JSON.parse(await readFile(join(sandbox, "self-authorship", "current.json"), "utf8"));
assert.deepEqual(afterPreserve, current);
const rejectedLineage = JSON.parse(await readFile(join(sandbox, preserved.lineage), "utf8"));
assert.equal(rejectedLineage.judgment.decision, "preserve");

process.stdout.write("PASS single canonical identity, autonomous rewrite judgment, atomic replacement, prior-manifest lineage, privacy audit, and preserve-current rollback behavior.\n");
