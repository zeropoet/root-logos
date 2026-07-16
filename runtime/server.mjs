#!/usr/bin/env node

import http from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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
  const observations = new Map();
  const classifications = new Map();
  try {
    for (const line of (await readFile(journalPath, "utf8")).split("\n").filter(Boolean)) {
      const record = JSON.parse(line);
      if (record.type === "observation-accepted") {
        knownEvents.add(record.event.event_id);
        observations.set(record.event.event_id, record);
      }
      if (record.type === "observation-classified") {
        if (!classifications.has(record.event_id)) classifications.set(record.event_id, []);
        classifications.get(record.event_id).push(record);
      }
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }

  const publicRateLimits = new Map();
  const rateLimit = (req) => {
    const forwarded = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
    const identity = createHmac("sha256", intakeSecret || "unconfigured").update(forwarded).digest("hex").slice(0, 20);
    const now = Date.now();
    const recent = (publicRateLimits.get(identity) || []).filter((timestamp) => now - timestamp < 60 * 60 * 1000);
    if (recent.length >= 3) return false;
    recent.push(now);
    publicRateLimits.set(identity, recent);
    return true;
  };

  const publicObservation = (body) => {
    const errors = [];
    const observation = String(body?.observation || "").trim();
    const context = String(body?.context || "").trim();
    const relation = String(body?.relation || "").trim();
    const sourceType = String(body?.source_type || "").trim();
    const attribution = String(body?.attribution || "Anonymous").trim();
    if (observation.length < 20 || observation.length > 6000) errors.push("observation must be between 20 and 6000 characters");
    if (context.length > 2000) errors.push("context must be 2000 characters or fewer");
    if (relation.length > 500) errors.push("relation must be 500 characters or fewer");
    if (attribution.length > 120) errors.push("attribution must be 120 characters or fewer");
    if (!["lived-experience", "research", "dialogue", "artifact", "other"].includes(sourceType)) errors.push("source_type is invalid");
    if (body?.consent !== true) errors.push("consent is required");
    return { errors, payload: { observation, context, relation, source_type: sourceType, attribution } };
  };

  const currentIntake = () => [...observations.values()].map((record) => {
    const history = classifications.get(record.event.event_id) || [];
    const latest = history.at(-1);
    return {
      event_id: record.event.event_id,
      received_at: record.received_at,
      occurred_at: record.event.occurred_at,
      source_surface: record.event.source_surface,
      payload: record.event.payload,
      consent_classification: record.event.consent_classification,
      retention_classification: record.event.retention_classification,
      status: latest?.status || record.event.constitutional_relevance,
      classification_history: history
    };
  }).sort((a, b) => b.received_at.localeCompare(a.received_at));

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
        const args = ["cycle", ...(force ? ["--force"] : [])];
        if (trigger.event_id) {
          const observation = observations.get(trigger.event_id)?.event;
          if (!observation) throw new Error(`Wake source ${trigger.event_id} is unavailable.`);
          const contextPath = join(dataDir, `wake-${trigger.event_id.replace(/[^A-Za-z0-9-]/g, "_")}.json`);
          await atomicJson(contextPath, {
            event_id: trigger.event_id,
            disposition: trigger.disposition || "admissible",
            admitted_at: trigger.accepted_at,
            steward_note: trigger.steward_note || null,
            payload: observation.payload
          });
          args.push("--intake-context", contextPath, "--priority", trigger.disposition || "admissible");
        }
        const result = await commandRunner(args);
        const publication = await publishChanges(trigger);
        const cycleId = result.stdout.match(/RL-CULT-\d{4,}/)?.[0] || null;
        const response = { cycle_id: cycleId, summary: result.stdout.split("\n").filter(Boolean).at(-1) || "Cultivation completed." };
        await appendRecord({ type: "wake-completed", at: iso(), trigger, output: result.stdout, response, publication });
        runtimeState.last_response = response;
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
      intake_count: knownEvents.size,
      intake_pending: currentIntake().filter(({ status }) => status === "unreviewed" || status === "hold").length
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
      if (req.method === "GET" && url.pathname === "/v1/admin/intake") {
        if (!adminToken || req.headers.authorization !== `Bearer ${adminToken}`) return send(res, 401, { error: "unauthorized" }, cors);
        return send(res, 200, { observations: currentIntake() }, cors);
      }

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
        observations.set(event.event_id, record);
        const wakes = ["admissible", "promoted"].includes(event.constitutional_relevance);
        if (wakes) await enqueue({ id: `event:${event.event_id}`, kind: "admitted-observation", event_id: event.event_id, disposition: event.constitutional_relevance, accepted_at: record.received_at });
        return send(res, 202, { accepted: true, duplicate: false, event_id: event.event_id, wake_queued: wakes }, cors);
      }
      if (req.method === "POST" && url.pathname === "/v1/public/intake") {
        if (origin !== allowedOrigin && allowedOrigin !== "*") return send(res, 403, { error: "origin not permitted" }, cors);
        if (!intakeSecret) return send(res, 503, { error: "intake is not configured" }, cors);
        const body = JSON.parse(raw);
        if (String(body.website || "").trim()) return send(res, 202, { accepted: true, status: "unreviewed" }, cors);
        if (!rateLimit(req)) return send(res, 429, { error: "intake limit reached; please return later" }, { ...cors, "retry-after": "3600" });
        const { errors, payload } = publicObservation(body);
        if (errors.length) return send(res, 422, { error: "invalid observation", details: errors }, cors);
        const eventId = `RL-OBS-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const occurredAt = iso();
        const provenance = createHmac("sha256", intakeSecret).update(`${eventId}.${occurredAt}.${JSON.stringify(payload)}`).digest("hex");
        const event = {
          event_id: eventId,
          occurred_at: occurredAt,
          source_surface: "rootlogos.com/public-membrane",
          authenticated_producer: "public-web-submission",
          payload_type: "offered-observation",
          schema_version: "1",
          payload,
          consent_classification: "explicit-public-intake-consent",
          retention_classification: "review-pending",
          provenance_signature: `server-hmac:${provenance}`,
          constitutional_relevance: "unreviewed"
        };
        const record = { type: "observation-accepted", received_at: occurredAt, event };
        await appendRecord(record);
        knownEvents.add(eventId);
        observations.set(eventId, record);
        return send(res, 202, { accepted: true, event_id: eventId, status: "unreviewed", wake_queued: false }, cors);
      }
      const classifyMatch = req.method === "POST" && url.pathname.match(/^\/v1\/admin\/intake\/([^/]+)\/classify$/);
      if (classifyMatch) {
        if (!adminToken || req.headers.authorization !== `Bearer ${adminToken}`) return send(res, 401, { error: "unauthorized" }, cors);
        const eventId = decodeURIComponent(classifyMatch[1]);
        if (!observations.has(eventId)) return send(res, 404, { error: "observation not found" }, cors);
        const body = JSON.parse(raw);
        const status = String(body.status || "");
        const reviewer = String(body.reviewer || "").trim();
        const note = String(body.note || "").trim();
        if (!["hold", "rejected", "admissible", "promoted"].includes(status)) return send(res, 422, { error: "invalid classification" }, cors);
        if (!reviewer || !note) return send(res, 422, { error: "reviewer and note are required" }, cors);
        const classification = { type: "observation-classified", event_id: eventId, status, reviewer, note, at: iso() };
        await appendRecord(classification);
        if (!classifications.has(eventId)) classifications.set(eventId, []);
        classifications.get(eventId).push(classification);
        const wakes = status === "admissible" || status === "promoted";
        if (wakes) await enqueue({ id: `classification:${eventId}:${classification.at}`, kind: "admitted-observation", event_id: eventId, disposition: status, steward_note: note, accepted_at: classification.at });
        return send(res, 202, { accepted: true, event_id: eventId, status, wake_queued: wakes }, cors);
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
