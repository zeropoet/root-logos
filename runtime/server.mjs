#!/usr/bin/env node

import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const runtimeDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(runtimeDir, "..");
const iso = () => new Date().toISOString();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const safeEqual = (left, right) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

const readJson = async (path, fallback = null) => {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
};

const atomicJson = async (path, value) => {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, json(value), { mode: 0o600 });
  await rename(temp, path);
};

const run = (command, args, cwd) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { cwd, env: process.env });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => code === 0
    ? resolveRun({ stdout: stdout.trim(), stderr: stderr.trim() })
    : reject(new Error(stderr.trim() || `${command} exited ${code}`)));
});

const validateEnvelope = (event) => {
  const errors = [];
  const requiredStrings = [
    "event_id", "occurred_at", "source_surface", "authenticated_producer",
    "payload_type", "schema_version", "consent_classification",
    "retention_classification", "provenance_signature", "constitutional_relevance"
  ];
  for (const field of requiredStrings) if (typeof event?.[field] !== "string" || !event[field].trim()) errors.push(`${field} is required`);
  if (!event || (!("payload" in event) && !event.content_ref)) errors.push("payload or content_ref is required");
  if (event?.occurred_at && Number.isNaN(Date.parse(event.occurred_at))) errors.push("occurred_at must be an ISO timestamp");
  if (event?.constitutional_relevance && !["unreviewed", "admissible", "rejected", "promoted"].includes(event.constitutional_relevance)) {
    errors.push("constitutional_relevance is invalid");
  }
  return errors;
};

const publicCycle = (cycle) => ({
  cultivation_id: cycle.cultivation_id,
  status: cycle.status,
  phase: cycle.phase,
  lens: cycle.lens,
  source_snapshot: cycle.source_snapshot,
  selected_finding: cycle.selected_finding,
  proposal: cycle.proposal,
  autonomous_judgment: cycle.autonomous_judgment,
  human_review: cycle.human_review,
  application: cycle.application,
  novelty: cycle.novelty,
  events: cycle.events
});

export const createRuntime = async (options = {}) => {
  const root = resolve(options.root || process.env.ROOT_LOGOS_ROOT || defaultRoot);
  const dataDir = resolve(options.dataDir || process.env.ROOT_LOGOS_DATA_DIR || join(root, ".runtime-data"));
  const intakeSecret = options.intakeSecret ?? process.env.ROOT_LOGOS_INTAKE_SECRET;
  const adminToken = options.adminToken ?? process.env.ROOT_LOGOS_ADMIN_TOKEN;
  const allowedOrigin = options.allowedOrigin ?? process.env.ROOT_LOGOS_ALLOWED_ORIGIN ?? "https://rootlogos.com";
  const publish = options.publish ?? process.env.ROOT_LOGOS_GIT_PUBLISH === "1";
  const commandRunner = options.commandRunner || ((args) => run(process.execPath, ["scripts/cultivate.mjs", ...args], root));
  const journalPath = join(dataDir, "intake.jsonl");
  const runtimeStatePath = join(dataDir, "state.json");
  await mkdir(dataDir, { recursive: true, mode: 0o700 });

  const initialRuntimeState = {
    version: 1, status: "sleeping", active_trigger: null, queued_triggers: [],
    last_wake_at: null, last_sleep_at: null, last_error: null, completed_wakes: 0
  };
  let runtimeState = await readJson(runtimeStatePath, initialRuntimeState);
  if (runtimeState.status === "running") {
    runtimeState.status = "sleeping";
    runtimeState.active_trigger = null;
    runtimeState.last_error = "Recovered from an interrupted runtime process.";
  }
  await atomicJson(runtimeStatePath, runtimeState);

  const knownEvents = new Set();
  try {
    for (const line of (await readFile(journalPath, "utf8")).split("\n").filter(Boolean)) {
      const record = JSON.parse(line);
      if (record.type === "observation-accepted") knownEvents.add(record.event.event_id);
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }

  let workerPromise = null;
  const saveRuntimeState = () => atomicJson(runtimeStatePath, runtimeState);
  const appendRecord = (record) => appendFile(journalPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });

  const publishChanges = async (trigger) => {
    if (!publish) return { published: false, reason: "publication-disabled" };
    await run("git", ["add", "cultivation/state.json", "cultivation/memory.json", "cultivation/cycles", "content/constitutional-graph.json"], root);
    const diff = await run("git", ["diff", "--cached", "--quiet"], root).catch((error) => ({ changed: true, error }));
    if (!diff.changed) return { published: false, reason: "no-change" };
    await run("git", ["commit", "-m", `Cultivate Root Logos (${trigger.id})`], root);
    await run("git", ["push", "origin", "HEAD:main"], root);
    return { published: true };
  };

  const work = async () => {
    while (runtimeState.queued_triggers.length) {
      const trigger = runtimeState.queued_triggers.shift();
      runtimeState.status = "running";
      runtimeState.active_trigger = trigger;
      runtimeState.last_wake_at = iso();
      runtimeState.last_error = null;
      await saveRuntimeState();
      await appendRecord({ type: "wake-started", at: iso(), trigger });
      try {
        const force = trigger.kind === "human-command";
        const result = await commandRunner(["cycle", ...(force ? ["--force"] : [])]);
        const publication = await publishChanges(trigger);
        await appendRecord({ type: "wake-completed", at: iso(), trigger, output: result.stdout, publication });
        runtimeState.completed_wakes += 1;
      } catch (error) {
        runtimeState.last_error = error.message;
        await appendRecord({ type: "wake-failed", at: iso(), trigger, error: error.message });
      }
      runtimeState.active_trigger = null;
      runtimeState.status = "sleeping";
      runtimeState.last_sleep_at = iso();
      await saveRuntimeState();
    }
    workerPromise = null;
  };

  const enqueue = async (trigger) => {
    const duplicate = runtimeState.active_trigger?.id === trigger.id || runtimeState.queued_triggers.some(({ id }) => id === trigger.id);
    if (duplicate) return false;
    runtimeState.queued_triggers.push(trigger);
    await saveRuntimeState();
    if (!workerPromise) workerPromise = work();
    return true;
  };

  const verifySignature = (timestamp, supplied, raw) => {
    if (!intakeSecret || !timestamp || !supplied) return false;
    const milliseconds = Date.parse(timestamp);
    if (Number.isNaN(milliseconds) || Math.abs(Date.now() - milliseconds) > 5 * 60 * 1000) return false;
    const expected = `sha256=${createHmac("sha256", intakeSecret).update(`${timestamp}.${raw}`).digest("hex")}`;
    return safeEqual(expected, supplied);
  };

  const readCycles = async () => {
    const path = join(root, "cultivation", "cycles");
    const files = (await readdir(path)).filter((file) => file.endsWith(".json")).sort().reverse();
    return Promise.all(files.map(async (file) => publicCycle(await readJson(join(path, file)))));
  };

  const snapshot = async () => {
    const [state, memory, policy] = await Promise.all([
      readJson(join(root, "cultivation", "state.json")),
      readJson(join(root, "cultivation", "memory.json")),
      readJson(join(root, "cultivation", "policy.json"))
    ]);
    return {
      service: { ...runtimeState, queued_triggers: [...runtimeState.queued_triggers] },
      cultivation: state,
      dormancy: memory.dormancy,
      novelty: memory.novelty,
      hypothesis_count: Object.keys(memory.hypotheses || {}).length,
      policy: { version: policy.version, constitutional_revision: policy.constitutional_revision, mode: policy.mode },
      intake_count: knownEvents.size
    };
  };

  const send = (res, status, body, extra = {}) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra });
    res.end(JSON.stringify(body));
  };

  const handler = async (req, res) => {
    const origin = req.headers.origin;
    const cors = origin && (allowedOrigin === "*" || origin === allowedOrigin)
      ? { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization,content-type,x-rootlogos-signature,x-rootlogos-timestamp", "access-control-allow-methods": "GET,POST,OPTIONS", vary: "Origin" }
      : {};
    if (req.method === "OPTIONS") return send(res, 204, {}, cors);
    const url = new URL(req.url, "http://runtime.local");
    try {
      if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, status: runtimeState.status }, cors);
      if (req.method === "GET" && url.pathname === "/v1/status") return send(res, 200, await snapshot(), cors);
      if (req.method === "GET" && url.pathname === "/v1/cycles") return send(res, 200, { cycles: await readCycles() }, cors);
      if (req.method === "GET" && url.pathname === "/v1/proposals") {
        const cycles = await readCycles();
        return send(res, 200, { proposals: cycles.filter(({ proposal }) => proposal).map(({ events, ...cycle }) => cycle) }, cors);
      }
      const cycleMatch = req.method === "GET" && url.pathname.match(/^\/v1\/cycles\/(RL-CULT-\d{4,})$/);
      if (cycleMatch) return send(res, 200, publicCycle(await readJson(join(root, "cultivation", "cycles", `${cycleMatch[1]}.json`))), cors);

      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 1_000_000) throw Object.assign(new Error("request body exceeds 1 MB"), { status: 413 });
      }
      if (req.method === "POST" && url.pathname === "/v1/intake") {
        if (!verifySignature(req.headers["x-rootlogos-timestamp"], req.headers["x-rootlogos-signature"], raw)) {
          return send(res, 401, { error: "invalid or stale signature" }, cors);
        }
        const event = JSON.parse(raw);
        const errors = validateEnvelope(event);
        if (errors.length) return send(res, 422, { error: "invalid envelope", details: errors }, cors);
        if (knownEvents.has(event.event_id)) return send(res, 200, { accepted: false, duplicate: true, event_id: event.event_id }, cors);
        const record = { type: "observation-accepted", received_at: iso(), event };
        await appendRecord(record);
        knownEvents.add(event.event_id);
        const wakes = ["admissible", "promoted"].includes(event.constitutional_relevance);
        if (wakes) await enqueue({ id: `event:${event.event_id}`, kind: "admissible-observation", event_id: event.event_id, accepted_at: record.received_at });
        return send(res, 202, { accepted: true, duplicate: false, event_id: event.event_id, wake_queued: wakes }, cors);
      }
      if (req.method === "POST" && url.pathname === "/v1/commands/wake") {
        if (!adminToken || req.headers.authorization !== `Bearer ${adminToken}`) return send(res, 401, { error: "unauthorized" }, cors);
        const body = raw ? JSON.parse(raw) : {};
        const trigger = { id: `human:${Date.now()}`, kind: "human-command", note: String(body.note || "Explicit human wake"), requested_at: iso() };
        await enqueue(trigger);
        return send(res, 202, { accepted: true, trigger }, cors);
      }
      return send(res, 404, { error: "not found" }, cors);
    } catch (error) {
      return send(res, error.status || (error instanceof SyntaxError ? 400 : 500), { error: error.message }, cors);
    }
  };

  return { handler, snapshot, enqueue, waitForIdle: async () => { if (workerPromise) await workerPromise; }, dataDir };
};

export const startServer = async (options = {}) => {
  const runtime = await createRuntime(options);
  const port = Number(options.port ?? process.env.ROOT_LOGOS_PORT ?? 8787);
  const host = options.host ?? process.env.ROOT_LOGOS_HOST ?? "127.0.0.1";
  const server = http.createServer(runtime.handler);
  await new Promise((resolveListen, reject) => server.listen(port, host, (error) => error ? reject(error) : resolveListen()));
  process.stdout.write(`Root Logos runtime listening on http://${host}:${server.address().port}\n`);
  return { server, runtime };
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) startServer().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
