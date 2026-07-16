#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntime, startServer } from "./server.mjs";

const sourceRoot = new URL("../", import.meta.url);
const sandbox = await mkdtemp(join(tmpdir(), "root-logos-runtime-"));
await Promise.all([
  mkdir(join(sandbox, "cultivation"), { recursive: true }),
  cp(new URL("cultivation/state.json", sourceRoot), join(sandbox, "cultivation", "state.json")),
  cp(new URL("cultivation/memory.json", sourceRoot), join(sandbox, "cultivation", "memory.json")),
  cp(new URL("cultivation/policy.json", sourceRoot), join(sandbox, "cultivation", "policy.json")),
  cp(new URL("cultivation/cycles/", sourceRoot), join(sandbox, "cultivation", "cycles"), { recursive: true })
]);

const calls = [];
const secret = "test-intake-secret";
const admin = "test-admin-token";
const { server, runtime } = await startServer({
  root: sandbox, dataDir: join(sandbox, "data"), port: 0, intakeSecret: secret, adminToken: admin,
  commandRunner: async (args) => { calls.push(args); return { stdout: "test cycle complete", stderr: "" }; }
});
const base = `http://127.0.0.1:${server.address().port}`;

try {
  const health = await fetch(`${base}/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  const status = await fetch(`${base}/v1/status`).then((response) => response.json());
  assert.equal(status.policy.constitutional_revision, "v0.8");
  assert.equal(status.intake_count, 0);

  const publicOffer = await fetch(`${base}/v1/public/intake`, { method: "POST", body: JSON.stringify({
    observation: "A public observation remains outside the constitution until it earns admission.",
    context: "Runtime boundary test", relation: "The Living Membrane Principle",
    source_type: "dialogue", attribution: "Runtime Test", consent: true, website: ""
  }), headers: { "content-type": "application/json", origin: "https://rootlogos.com", "x-forwarded-for": "192.0.2.40" } });
  assert.equal(publicOffer.status, 202);
  const publicReceipt = await publicOffer.json();
  assert.match(publicReceipt.event_id, /^RL-OBS-/);
  assert.equal(publicReceipt.status, "unreviewed");
  assert.equal(publicReceipt.wake_queued, false);
  assert.deepEqual(calls, []);

  const deniedIntake = await fetch(`${base}/v1/admin/intake`);
  assert.equal(deniedIntake.status, 401);
  const adminIntake = await fetch(`${base}/v1/admin/intake`, { headers: { authorization: `Bearer ${admin}` } }).then((response) => response.json());
  assert.equal(adminIntake.observations.length, 1);
  assert.equal(adminIntake.observations[0].status, "unreviewed");
  const classified = await fetch(`${base}/v1/admin/intake/${publicReceipt.event_id}/classify`, { method: "POST", body: JSON.stringify({
    status: "admissible", reviewer: "Test Steward", note: "Relevant, attributable, and safe for cultivation."
  }), headers: { authorization: `Bearer ${admin}`, "content-type": "application/json" } });
  assert.equal(classified.status, 202);
  assert.equal((await classified.json()).wake_queued, true);
  await runtime.waitForIdle();
  assert.ok(calls.some((args) => args.includes("--intake-context")));
  assert.ok(calls.some((args) => args.includes("--priority") && args.includes("admissible")));

  const event = {
    event_id: "evt-001", occurred_at: new Date().toISOString(), source_surface: "rootlogos.com",
    authenticated_producer: "site-test", payload_type: "reflection", schema_version: "1",
    payload: { text: "A bounded observation." }, consent_classification: "public-submission",
    retention_classification: "durable", provenance_signature: "site:test",
    constitutional_relevance: "admissible"
  };
  const raw = JSON.stringify(event);
  const timestamp = new Date().toISOString();
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex")}`;
  const accepted = await fetch(`${base}/v1/intake`, { method: "POST", body: raw, headers: {
    "content-type": "application/json", "x-rootlogos-timestamp": timestamp, "x-rootlogos-signature": signature
  }});
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).wake_queued, true);
  await runtime.waitForIdle();
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes("--intake-context"));

  const duplicate = await fetch(`${base}/v1/intake`, { method: "POST", body: raw, headers: {
    "content-type": "application/json", "x-rootlogos-timestamp": timestamp, "x-rootlogos-signature": signature
  }}).then((response) => response.json());
  assert.equal(duplicate.duplicate, true);

  const denied = await fetch(`${base}/v1/commands/wake`, { method: "POST", body: "{}" });
  assert.equal(denied.status, 401);
  const wake = await fetch(`${base}/v1/commands/wake`, { method: "POST", body: JSON.stringify({ note: "test" }), headers: {
    authorization: `Bearer ${admin}`, "content-type": "application/json"
  }});
  assert.equal(wake.status, 202);
  await runtime.waitForIdle();
  assert.deepEqual(calls.at(-1), ["cycle", "--force"]);

  const journal = await readFile(join(sandbox, "data", "intake.jsonl"), "utf8");
  assert.match(journal, /observation-accepted/);
  assert.match(journal, /wake-completed/);
  process.stdout.write("PASS public membrane, immutable receipts, steward classification, signed intake, replay protection, serialized wakes, and human command boundary.\n");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
