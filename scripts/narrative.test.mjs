import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const [policy, seasons, archive, html, renderer] = await Promise.all([
  readJson("content/narrative-policy.json"),
  readJson("content/narrative-seasons.json"),
  readJson("content/attractor-packets.json"),
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("weave.js", root), "utf8")
]);

assert.equal(policy.status, "active");
assert.equal(policy.composition.platform_metrics_are_selection_authority, false);
assert.equal(policy.dialogue.automated_unsolicited_contact, false);
assert.ok(policy.material_passage.forbidden.some((rule) => rule.includes("prayer")));

const season = seasons.seasons.find(({ season_id }) => season_id === seasons.current_season);
assert.ok(season);
assert.equal(season.movement, "The Weaving");
assert.equal(season.chapters.flatMap(({ questions }) => questions).length, 12);
assert.ok(Date.parse(season.not_before) > Date.parse(archive.packets[23].not_before));

assert.match(html, /id="fragments"/);
assert.match(html, /Outward fragments \/ X/);
assert.match(html, /Each becomes prior memory for what follows/);
assert.match(renderer, /publication\?\.status === "published"/);
assert.match(renderer, /\.slice\(-8\)\.reverse\(\)/);

console.log("Root Logos narrative policy and the Weaving-era fragment surface are coherent.");
