#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { createHmac, randomBytes } from "node:crypto";
import process from "node:process";

const packetsPath = new URL("../content/attractor-packets.json", import.meta.url);
const graphPath = new URL("../content/constitutional-graph.json", import.meta.url);
const policyPath = new URL("../content/attractor-policy.json", import.meta.url);
const command = process.argv[2] || "validate";
const packetId = process.argv[3];
const flags = new Set(process.argv.slice(4));

const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

const materializeArchive = (archive) => {
  if (Array.isArray(archive)) return archive.map((packet) => ({ packet, raw: packet }));
  const defaults = archive.defaults || {};
  return (archive.packets || []).map((raw) => {
    const [recognition, tension, reorientation, aperture] = Array.isArray(raw.fragment) ? raw.fragment : [];
    const packet = {
      ...defaults,
      ...raw,
      scrutiny: { ...(defaults.scrutiny || {}), ...(raw.scrutiny || {}) },
      release: { ...(defaults.release || {}), ...(raw.release || {}), not_before: raw.not_before || raw.release?.not_before },
      source: raw.source || { node: raw.node, relations: raw.relations || [] },
      fragment: Array.isArray(raw.fragment) ? { recognition, tension, reorientation, aperture } : raw.fragment,
      destination: raw.destination || { canonical_url: `https://rootlogos.com/#${raw.node}` },
      channel: { ...(defaults.channel || {}), ...(raw.channel || {}) },
      integrity: { ...(defaults.integrity || {}), ...(raw.integrity || {}) },
      publication: { ...(defaults.publication || {}), ...(raw.publication || {}) },
    };
    return { packet, raw };
  });
};

const composeFragment = (packet) => {
  const { recognition, tension, reorientation, aperture } = packet.fragment;
  return [recognition, tension, reorientation, aperture, packet.destination.canonical_url]
    .filter(Boolean)
    .join("\n\n");
};

const refinementKinds = new Set(["discovery", "question", "tension", "compression", "amendment"]);
const epistemicStatuses = new Set(["canonical", "proposed", "unresolved"]);
const isRefinementPacket = (packet) => refinementKinds.has(packet.kind);

const validatePacket = (packet, nodesById) => {
  const errors = [];
  const required = ["attractor_id", "status", "source_revision", "source", "fragment", "destination", "channel", "integrity", "publication"];
  required.forEach((key) => {
    if (!packet[key]) errors.push(`missing ${key}`);
  });

  if (!nodesById.has(packet.source?.node)) errors.push(`unknown source node ${packet.source?.node || ""}`);
  (packet.source?.relations || []).forEach((id) => {
    if (!nodesById.has(id)) errors.push(`unknown related node ${id}`);
  });

  const text = composeFragment(packet);
  const limit = packet.channel?.character_limit || 280;
  if (text.length > limit) errors.push(`rendered fragment is ${text.length} characters; limit is ${limit}`);
  if (!packet.destination?.canonical_url?.startsWith("https://rootlogos.com/")) errors.push("return path must resolve to rootlogos.com");

  if (!packet.kind) errors.push("missing attractor kind");
  if (!epistemicStatuses.has(packet.epistemic?.status)) errors.push("invalid or missing epistemic status");
  if (!packet.epistemic?.basis) errors.push("missing epistemic basis");
  if (isRefinementPacket(packet)) {
    if (packet.release?.cadence_class === "founding-cycle") errors.push("refinement packets cannot enter the founding cycle");
    if (packet.epistemic.status !== "canonical" && packet.kind === "amendment") {
      errors.push("an amendment attractor must describe a canonical amendment; use discovery, question, tension, or compression while unresolved");
    }
    if (["proposed", "unresolved"].includes(packet.epistemic.status) && !packet.fragment?.tension?.includes("?")) {
      errors.push("proposed and unresolved refinement packets must make their uncertainty explicit as a question");
    }
  }

  const integrityValues = Object.values(packet.integrity || {});
  if (integrityValues.length !== 4 || integrityValues.some((value) => value !== "passed")) {
    errors.push("all four Gravitational Integrity checks must pass");
  }

  if (packet.status === "eligible") {
    const scrutinyValues = Object.values(packet.scrutiny || {});
    if (scrutinyValues.length !== 6 || scrutinyValues.some((value) => value !== "passed")) {
      errors.push("eligible packets require all six scrutiny checks to pass");
    }
    if (!packet.release?.not_before || Number.isNaN(Date.parse(packet.release.not_before))) {
      errors.push("eligible packets require a valid release.not_before date");
    }
  }

  return { packet, text, errors };
};

const load = async () => {
  const [archive, graph, policy] = await Promise.all([readJson(packetsPath), readJson(graphPath), readJson(policyPath)]);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const entries = materializeArchive(archive);
  const packets = entries.map(({ packet }) => packet);
  const results = entries.map(({ packet, raw }) => ({ ...validatePacket(packet, nodesById), raw }));
  const renderings = new Map();
  results.forEach((result) => {
    const normalized = result.text.toLowerCase().replace(/\s+/g, " ").trim();
    if (renderings.has(normalized)) result.errors.push(`duplicates rendering of ${renderings.get(normalized)}`);
    else renderings.set(normalized, result.packet.attractor_id);
  });
  return { archive, packets, policy, results };
};

const findResult = (results) => {
  const result = results.find(({ packet }) => packet.attractor_id === packetId);
  if (!result) throw new Error(`Unknown attractor packet: ${packetId || "<missing>"}`);
  return result;
};

const percentEncode = (value) => encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

const oauth1Authorization = (method, url) => {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (![consumerKey, consumerSecret, accessToken, accessTokenSecret].every(Boolean)) return null;

  const parameters = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(18).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };
  const parameterString = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
  const signatureBase = [method.toUpperCase(), percentEncode(url), percentEncode(parameterString)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;
  parameters.oauth_signature = createHmac("sha1", signingKey).update(signatureBase).digest("base64");
  return `OAuth ${Object.entries(parameters).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`).join(", ")}`;
};

const xAuthorization = (method, url) => {
  const oauth1 = oauth1Authorization(method, url);
  if (oauth1) return oauth1;
  if (process.env.X_USER_ACCESS_TOKEN) return `Bearer ${process.env.X_USER_ACCESS_TOKEN}`;
  throw new Error("X user-context credentials are not configured.");
};

const publishToX = async (result, archive, { autonomous = false } = {}) => {
  if (result.errors.length) throw new Error(result.errors.join("; "));
  if (result.packet.status !== "eligible") throw new Error("Packet has not earned constitutional eligibility.");
  if (!autonomous && !flags.has("--confirm")) throw new Error("Manual publication requires --confirm.");
  if (result.packet.publication.status === "published") throw new Error("Packet is already archived as published.");
  if (Date.parse(result.packet.release.not_before) > Date.now()) throw new Error("Packet has not reached its not-before date.");

  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: xAuthorization("POST", "https://api.x.com/2/tweets"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: result.text, made_with_ai: true }),
  });
  const body = await response.json();
  if (!response.ok || !body.data?.id) throw new Error(`X API ${response.status}: ${JSON.stringify(body)}`);

  const publishedAt = new Date().toISOString();
  result.packet.publication = {
    status: "published",
    external_id: body.data.id,
    external_url: `https://x.com/rootlogos/status/${body.data.id}`,
    published_at: publishedAt,
  };
  result.packet.status = "emitted";
  result.raw.status = "emitted";
  result.raw.publication = result.packet.publication;
  await writeFile(packetsPath, `${JSON.stringify(archive, null, 2)}\n`);
  process.stdout.write(`${result.packet.attractor_id} published and archived: ${result.packet.publication.external_url}\n`);
};

const verifyXIdentity = async () => {
  const url = "https://api.x.com/2/users/me";
  const response = await fetch(url, {
    headers: { Authorization: xAuthorization("GET", url) },
  });
  const body = await response.json();
  if (!response.ok || !body.data?.username) throw new Error(`X identity check ${response.status}: ${JSON.stringify(body)}`);
  if (body.data.username.toLowerCase() !== "rootlogos") throw new Error(`Credentials authorize @${body.data.username}, not @rootlogos.`);
  process.stdout.write(`Authenticated X identity confirmed: @${body.data.username} (${body.data.id})\n`);
};

const main = async () => {
  const { archive, policy, results } = await load();

  if (command === "validate") {
    results.forEach(({ packet, text, errors }) => {
      process.stdout.write(`${errors.length ? "FAIL" : "PASS"} ${packet.attractor_id} · ${text.length}/${packet.channel.character_limit}\n`);
      errors.forEach((error) => process.stdout.write(`  - ${error}\n`));
    });
    if (results.some(({ errors }) => errors.length)) process.exitCode = 1;
    return;
  }

  if (command === "list") {
    results.forEach(({ packet, text }) => process.stdout.write(`${packet.attractor_id}\t${packet.status}\t${packet.source.node}\t${text.length}\n`));
    return;
  }

  if (command === "prepare") {
    const result = findResult(results);
    if (result.errors.length) throw new Error(result.errors.join("; "));
    process.stdout.write(`${result.text}\n\n${result.text.length}/${result.packet.channel.character_limit} characters\n`);
    return;
  }

  if (command === "publish-x") {
    await publishToX(findResult(results), archive);
    return;
  }

  if (command === "release-x") {
    if (!policy.enabled) {
      process.stdout.write("Attractor policy is disabled; no emission attempted.\n");
      return;
    }
    const foundingOpen = results.some(({ packet }) =>
      packet.release?.cadence_class === "founding-cycle" && packet.publication.status !== "published"
    );
    const eligible = results
      .filter(({ packet, errors }) => packet.status === "eligible" && packet.publication.status === "unpublished" && !errors.length && Date.parse(packet.release.not_before) <= Date.now())
      .filter(({ packet }) => !isRefinementPacket(packet) || (policy.refinement_transition?.enabled && !foundingOpen))
      .sort((left, right) => Date.parse(left.packet.release.not_before) - Date.parse(right.packet.release.not_before) || left.packet.attractor_id.localeCompare(right.packet.attractor_id));
    if (!eligible.length) {
      process.stdout.write("No constitutionally eligible fragment is due.\n");
      return;
    }
    await publishToX(eligible[0], archive, { autonomous: true });
    return;
  }

  if (command === "transition-status") {
    const founding = results.filter(({ packet }) => packet.release?.cadence_class === "founding-cycle");
    const remaining = founding.filter(({ packet }) => packet.publication.status !== "published");
    const refinements = results.filter(({ packet }) => isRefinementPacket(packet));
    process.stdout.write(`Founding cycle: ${founding.length - remaining.length}/${founding.length} emitted\n`);
    process.stdout.write(`Refinement transition: ${policy.refinement_transition?.enabled && !remaining.length ? "active" : "waiting"}\n`);
    process.stdout.write(`Refinement packets: ${refinements.length} total, ${refinements.filter(({ errors }) => !errors.length).length} valid\n`);
    return;
  }

  if (command === "verify-x") {
    await verifyXIdentity();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
