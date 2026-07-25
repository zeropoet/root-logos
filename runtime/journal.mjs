import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const iso = () => new Date().toISOString();
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const digest = (value) => createHash("sha256").update(value).digest("hex");
const safeName = (value) => String(value || "").replace(/[^A-Za-z0-9._-]/g, "_");
const allowedExtensions = new Set([".md", ".markdown", ".txt"]);
const stopwords = new Set("about after again against also among because before being between both could does doing during each from further have having into itself more most other over same should some such than that their theirs them themselves then there these they this those through under very what when where which while who will with would your yours".split(" "));

const atomicJson = async (path, value) => {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, json(value), { mode: 0o600 });
  await rename(temporary, path);
};

const readJson = async (path, fallback) => {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
};

const matchesPattern = (name, pattern) => {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "i").test(name);
};

const withinScope = (name, grant) => {
  const include = grant.include?.length ? grant.include : ["*.md", "*.markdown", "*.txt"];
  const exclude = grant.exclude || [];
  return include.some((pattern) => matchesPattern(name, pattern)) && !exclude.some((pattern) => matchesPattern(name, pattern));
};

const riskFlags = (text) => {
  const flags = [];
  const checks = [
    ["possible-private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i],
    ["possible-secret", /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*\S{8,}/i],
    ["possible-auth-token", /\b(?:ghp_|github_pat_|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16})/],
    ["third-party-material", /(?:^|\n)\s*(?:third[- ]party|quoted from|private correspondence)\s*:/i]
  ];
  for (const [flag, pattern] of checks) if (pattern.test(text)) flags.push(flag);
  return flags;
};

const derive = (text) => {
  const normalized = text.toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[^a-z0-9'?\n-]+/g, " ");
  const words = normalized.split(/\s+/).filter((word) => word.length > 3 && !stopwords.has(word) && !/^\d+$/.test(word));
  const frequency = new Map();
  for (const word of words) frequency.set(word, (frequency.get(word) || 0) + 1);
  const concepts = [...frequency].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)
    .map(([concept, recurrence]) => ({ concept, recurrence }));
  const tensions = [];
  if (/\b(?:but|however|although|yet|contradiction|tension)\b/i.test(text)) tensions.push("internal-contrast");
  if (/\b(?:change|changed|becoming|formerly|now|future|past)\b/i.test(text)) tensions.push("temporal-change");
  if (/\b(?:must|should|ought|value|meaning|responsibility)\b/i.test(text)) tensions.push("normative-pressure");
  return {
    kind: "journal-derived-observation",
    concepts,
    tensions,
    question_count: (text.match(/\?/g) || []).length,
    paragraph_count: text.split(/\n\s*\n/).filter((part) => part.trim()).length,
    word_count: words.length,
    structural_summary: concepts.length
      ? `A public entry creates attributable pressure around ${concepts.slice(0, 5).map(({ concept }) => concept).join(", ")}.`
      : "The public entry produced no durable conceptual structure."
  };
};

const encrypt = (plaintext, key) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
};

const decrypt = (sealed, key) => {
  const iv = sealed.subarray(0, 12);
  const tag = sealed.subarray(12, 28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
};

export const createJournalMembrane = async ({
  root,
  dataDir,
  secret,
  dropDir,
  enabled,
  beforeTransform = null,
  onAdmitted = async () => {}
}) => {
  const policy = await readJson(join(root, "journal", "policy.json"), {});
  const collectionEnabled = enabled ?? policy.collection?.enabled === true;
  const grantsPath = join(dataDir, "journal-grants.json");
  const recordsPath = join(dataDir, "journal-records.json");
  const auditPath = join(dataDir, "journal-audit.jsonl");
  const quarantineDir = join(dataDir, "journal-quarantine");
  const sourceDir = resolve(dropDir || join(dataDir, "journal-drop"));
  const key = createHash("sha256").update(String(secret || "")).digest();
  await Promise.all([
    mkdir(sourceDir, { recursive: true, mode: 0o700 }),
    mkdir(quarantineDir, { recursive: true, mode: 0o700 })
  ]);
  let grants = await readJson(grantsPath, []);
  let records = await readJson(recordsPath, []);
  const identities = new Set(records.map((record) =>
    `${record.source_grant_id}:${record.source_entry_id}:${String(record.content_digest || "").replace(/^sha256:/, "")}`));

  const audit = (record) => appendFile(auditPath, `${JSON.stringify({ at: iso(), ...record })}\n`, { mode: 0o600 });
  const persist = () => Promise.all([atomicJson(grantsPath, grants), atomicJson(recordsPath, records)]);
  const publicGrant = ({ revocation_secret: _secret, ...grant }) => grant;

  const createGrant = async (input, actor) => {
    const required = ["source", "owner", "adapter", "revocation_method"];
    const missing = required.filter((field) => !String(input?.[field] || "").trim());
    if (missing.length) throw Object.assign(new Error(`source grant requires ${missing.join(", ")}`), { status: 422 });
    if (input.adapter !== "local-drop") throw Object.assign(new Error("only the local-drop adapter is currently constitutional"), { status: 422 });
    const grant = {
      source_grant_id: `RL-GRANT-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`,
      status: "active",
      source: String(input.source).trim(),
      owner: String(input.owner).trim(),
      adapter: "local-drop",
      include: Array.isArray(input.include) ? input.include.map(String) : ["*.md", "*.markdown", "*.txt"],
      exclude: Array.isArray(input.exclude) ? input.exclude.map(String) : [],
      cadence: input.cadence || "runtime-poll",
      retention_class: input.retention_class || "transform-and-release",
      privacy_mode: input.privacy_mode || "private-derived-only",
      revocation_method: String(input.revocation_method).trim(),
      authorized_by: actor,
      authorized_at: iso(),
      revoked_at: null
    };
    grants.push(grant);
    await persist();
    await mkdir(join(sourceDir, grant.source_grant_id), { recursive: true, mode: 0o700 });
    await audit({ type: "source-grant-activated", source_grant_id: grant.source_grant_id, actor });
    return publicGrant(grant);
  };

  const revokeGrant = async (id, actor, reason) => {
    const grant = grants.find(({ source_grant_id }) => source_grant_id === id);
    if (!grant) throw Object.assign(new Error("source grant not found"), { status: 404 });
    if (grant.status === "revoked") return publicGrant(grant);
    grant.status = "revoked";
    grant.revoked_at = iso();
    grant.revoked_by = actor;
    grant.revocation_reason = String(reason || "Explicit revocation").trim();
    const quarantined = (await readdir(quarantineDir)).filter((name) => name.startsWith(`${safeName(id)}__`));
    await Promise.all(quarantined.map((name) => unlink(join(quarantineDir, name))));
    await persist();
    await audit({ type: "source-grant-revoked", source_grant_id: id, actor, released_working_copies: quarantined.length });
    return publicGrant(grant);
  };

  const transformQuarantine = async ({ grant, eventId, quarantinePath, recovered = false }) => {
    const sealedPayload = JSON.parse(decrypt(await readFile(quarantinePath), key).toString("utf8"));
    const sourceEntryId = sealedPayload.source_entry_id;
    const raw = Buffer.from(sealedPayload.content_base64, "base64");
    const contentDigest = digest(raw);
    const identity = `${grant.source_grant_id}:${sourceEntryId}:${contentDigest}`;
    if (identities.has(identity)) {
      await unlink(quarantinePath);
      await audit({ type: recovered ? "journal-recovery-duplicate-released" : "journal-entry-duplicate-released", source_grant_id: grant.source_grant_id, source_entry_id: sourceEntryId, content_digest: `sha256:${contentDigest}` });
      return { duplicate: true, source_entry_id: sourceEntryId };
    }
    let record;
    try {
      const plaintext = raw.toString("utf8");
      const flags = riskFlags(plaintext);
      const derived = derive(plaintext);
      const status = flags.length ? "held" : derived.word_count < 20 || derived.concepts.length < 3 ? "rejected" : "admissible";
      const dispositionReason = flags.length
        ? "Sensitive or third-party risk requires a hold outside autonomous cultivation."
        : status === "rejected"
          ? "The entry did not yield enough distinct structure to justify cultivation."
          : "The entry yielded attributable conceptual pressure without detected privacy risk.";
      record = {
        event_id: eventId,
        source_grant_id: grant.source_grant_id,
        source_entry_id: sourceEntryId,
        observed_at: iso(),
        received_at: iso(),
        content_digest: `sha256:${contentDigest}`,
        adapter: { id: "local-drop", version: "1" },
        privacy: { retention_class: grant.retention_class, sensitivity: flags.length ? "held" : "derived-only", third_party_review: flags.includes("third-party-material") },
        status,
        derived,
        triage: {
          recommended_disposition: status,
          reason: dispositionReason,
          confidence: flags.length ? 1 : status === "admissible" ? 0.82 : 0.74,
          candidate_relations: derived.concepts.slice(0, 6).map(({ concept }) => concept),
          novelty_comparison: "deferred-to-cultivation-semantic-memory",
          counterargument: status === "admissible"
            ? "Lexical recurrence may reflect emphasis rather than a genuinely new constitutional relation."
            : "A sparse entry may still matter when considered longitudinally.",
          risk_flags: flags
        },
        transformation: {
          method: "deterministic-structural-distillation/v1",
          source_text_persisted: false,
          prompt_instruction_authority: false,
          recovered_after_interruption: recovered,
          released_at: iso(),
          release_verified: false
        },
        lineage: [
          { type: "source-grant", id: grant.source_grant_id },
          { type: "source-entry", id: sourceEntryId, digest: `sha256:${contentDigest}` },
          { type: "autonomous-judgment", disposition: status }
        ]
      };
      records.push(record);
      identities.add(identity);
      await persist();
    } finally {
      await unlink(quarantinePath).catch((error) => { if (error.code !== "ENOENT") throw error; });
    }
    record.transformation.release_verified = true;
    record.lineage.push({ type: "working-copy-released", at: iso() });
    await persist();
    await audit({ type: "journal-entry-transformed-and-released", event_id: eventId, disposition: record.status, content_digest: record.content_digest });
    if (record.status === "admissible" || record.status === "promoted") await onAdmitted(record);
    return { event_id: eventId, status: record.status, wake_queued: ["admissible", "promoted"].includes(record.status) };
  };

  const processFile = async (grant, name) => {
    const sourcePath = join(sourceDir, grant.source_grant_id, name);
    const sourceEntryId = basename(name, extname(name));
    const raw = await readFile(sourcePath);
    const contentDigest = digest(raw);
    const identity = `${grant.source_grant_id}:${sourceEntryId}:${contentDigest}`;
    if (identities.has(identity)) {
      await unlink(sourcePath);
      await audit({ type: "journal-entry-duplicate-released", source_grant_id: grant.source_grant_id, source_entry_id: sourceEntryId, content_digest: `sha256:${contentDigest}` });
      return { duplicate: true, source_entry_id: sourceEntryId };
    }
    const eventId = `RL-JOURNAL-${digest(identity).slice(0, 12).toUpperCase()}`;
    const quarantinePath = join(quarantineDir, `${safeName(grant.source_grant_id)}__${eventId}.enc`);
    const sealedPayload = Buffer.from(JSON.stringify({ source_entry_id: sourceEntryId, content_base64: raw.toString("base64") }));
    await writeFile(quarantinePath, encrypt(sealedPayload, key), { mode: 0o600 });
    await unlink(sourcePath);
    await audit({ type: "journal-entry-quarantined", event_id: eventId, source_grant_id: grant.source_grant_id, source_entry_id: sourceEntryId, content_digest: `sha256:${contentDigest}` });
    if (beforeTransform) await beforeTransform({ event_id: eventId, quarantine_path: quarantinePath });
    return transformQuarantine({ grant, eventId, quarantinePath });
  };

  const recoverQuarantine = async () => {
    if (!secret) return [];
    const recovered = [];
    for (const name of (await readdir(quarantineDir)).filter((candidate) => candidate.endsWith(".enc")).sort()) {
      const [grantId, eventPart] = name.split("__");
      const eventId = eventPart?.replace(/\.enc$/, "");
      const grant = grants.find(({ source_grant_id }) => safeName(source_grant_id) === grantId);
      const quarantinePath = join(quarantineDir, name);
      if (!grant || grant.status !== "active") {
        await unlink(quarantinePath);
        await audit({ type: "journal-recovery-released-without-active-grant", source_grant_id: grantId, event_id: eventId || null });
        continue;
      }
      recovered.push(await transformQuarantine({ grant, eventId, quarantinePath, recovered: true }));
    }
    return recovered;
  };

  const inQuietHours = () => {
    const [start, end] = policy.collection?.quiet_hours_local || [];
    if (!start || !end) return false;
    const minutes = new Date().getHours() * 60 + new Date().getMinutes();
    const toMinutes = (value) => Number(value.split(":")[0]) * 60 + Number(value.split(":")[1]);
    const from = toMinutes(start);
    const until = toMinutes(end);
    return from > until ? minutes >= from || minutes < until : minutes >= from && minutes < until;
  };

  const collect = async ({ force = false } = {}) => {
    if (!collectionEnabled && !force) return { enabled: false, processed: [], reason: "collection-disabled" };
    if (!secret) throw Object.assign(new Error("journal encryption secret is not configured"), { status: 503 });
    if (!force && inQuietHours()) return { enabled: true, processed: [], reason: "quiet-hours" };
    const recovered = await recoverQuarantine();
    const active = grants.filter(({ status }) => status === "active");
    const processed = [...recovered];
    for (const grant of active) {
      const path = join(sourceDir, grant.source_grant_id);
      await mkdir(path, { recursive: true, mode: 0o700 });
      const names = (await readdir(path)).filter((name) => allowedExtensions.has(extname(name).toLowerCase())).sort()
        .filter((name) => withinScope(name, grant))
        .slice(0, policy.collection?.maximum_entries_per_batch || 12);
      for (const name of names) processed.push(await processFile(grant, name));
    }
    await audit({ type: "journal-collection-completed", active_grants: active.length, processed: processed.length });
    return { enabled: collectionEnabled, active_grants: active.length, processed };
  };

  const addEntry = async (grantId, input) => {
    if (!collectionEnabled) throw Object.assign(new Error("journal collection is disabled"), { status: 503 });
    if (!secret) throw Object.assign(new Error("journal encryption secret is not configured"), { status: 503 });
    const grant = grants.find(({ source_grant_id }) => source_grant_id === grantId);
    if (!grant || grant.status !== "active") throw Object.assign(new Error("active source grant not found"), { status: 404 });
    const sourceEntryId = safeName(String(input?.source_entry_id || "").trim());
    const content = String(input?.content || "");
    if (!sourceEntryId || sourceEntryId.length > 120) throw Object.assign(new Error("source_entry_id is required and must be 120 characters or fewer"), { status: 422 });
    if (content.length < 20 || Buffer.byteLength(content) > 1_000_000) throw Object.assign(new Error("journal content must be between 20 characters and 1 MB"), { status: 422 });
    const name = `${sourceEntryId}.md`;
    if (!withinScope(name, grant)) throw Object.assign(new Error("entry is outside the Source Grant file scope"), { status: 422 });
    const path = join(sourceDir, grant.source_grant_id);
    await mkdir(path, { recursive: true, mode: 0o700 });
    try {
      await writeFile(join(path, name), content, { mode: 0o600, flag: "wx" });
    } catch (error) {
      if (error.code === "EEXIST") throw Object.assign(new Error("source_entry_id already exists in the local drop"), { status: 409 });
      throw error;
    }
    await audit({ type: "journal-entry-explicitly-added", source_grant_id: grantId, source_entry_id: sourceEntryId });
    return processFile(grant, name);
  };

  const status = () => ({
    status: collectionEnabled ? "online" : "disabled",
    adapter: "local-drop",
    active_grants: grants.filter(({ status }) => status === "active").length,
    total_grants: grants.length,
    transformed_entries: records.length,
    pending_wakes: records.filter(({ status }) => status === "admissible" || status === "promoted").length
  });

  return {
    status,
    collect,
    recover: recoverQuarantine,
    addEntry,
    createGrant,
    revokeGrant,
    grants: () => grants.map(publicGrant),
    records: () => records,
    getRecord: (id) => records.find(({ event_id }) => event_id === id),
    sourceDir
  };
};
