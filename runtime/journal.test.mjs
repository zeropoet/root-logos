#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJournalMembrane } from "./journal.mjs";

const sourceRoot = new URL("../", import.meta.url);
const sandbox = await mkdtemp(join(tmpdir(), "root-logos-journal-recovery-"));
const root = join(sandbox, "root");
const dataDir = join(sandbox, "data");
await mkdir(join(root, "journal"), { recursive: true });
await cp(new URL("journal/policy.json", sourceRoot), join(root, "journal", "policy.json"));

let interrupted = false;
const first = await createJournalMembrane({
  root,
  dataDir,
  secret: "recovery-test-secret",
  enabled: true,
  beforeTransform: async () => {
    interrupted = true;
    throw new Error("simulated process interruption");
  }
});
const grant = await first.createGrant({
  source: "Recovery journal",
  owner: "Runtime Test",
  adapter: "local-drop",
  include: ["*.md"],
  revocation_method: "Test revocation"
}, "Runtime Test");
const rawPhrase = "Copper orchard recovery phrase must not survive the transformation boundary.";
await writeFile(join(first.sourceDir, grant.source_grant_id, "interrupted.md"), `${rawPhrase}\n\nIdentity, memory, relation, responsibility, autonomy, cultivation, judgment, evidence, structure, and coherence are changing through time. The constitutional field requires a careful response that preserves lineage while allowing genuinely new relations to become visible.`);
await assert.rejects(first.collect({ force: true }), /simulated process interruption/);
assert.equal(interrupted, true);
assert.equal((await readdir(join(dataDir, "journal-quarantine"))).length, 1);

const admitted = [];
const recovered = await createJournalMembrane({
  root,
  dataDir,
  secret: "recovery-test-secret",
  enabled: true,
  onAdmitted: async (record) => admitted.push(record.event_id)
});
const results = await recovered.recover();
assert.equal(results.length, 1);
assert.equal(results[0].status, "admissible");
assert.equal(admitted.length, 1);
assert.equal((await readdir(join(dataDir, "journal-quarantine"))).length, 0);
const records = await readFile(join(dataDir, "journal-records.json"), "utf8");
assert.doesNotMatch(records, new RegExp(rawPhrase));
assert.match(records, /"recovered_after_interruption": true/);

process.stdout.write("PASS encrypted quarantine recovery, resumed autonomous judgment, raw-source release, and derived-only persistence after interruption.\n");
