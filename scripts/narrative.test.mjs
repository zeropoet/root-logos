import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const [policy, seasons, archive] = await Promise.all([
  readJson("content/narrative-policy.json"),
  readJson("content/narrative-seasons.json"),
  readJson("content/attractor-packets.json")
]);

assert.equal(policy.status, "active");
assert.equal(policy.composition.platform_metrics_are_selection_authority, false);
assert.equal(policy.dialogue.automated_unsolicited_contact, false);
assert.match(policy.material_passage.path, /Root Logos narrative/);
assert.equal(archive.defaults.release.cadence_class, "founding-cycle");
assert.ok(policy.material_passage.forbidden.some((rule) => rule.includes("prayer")));

const season = seasons.seasons.find(({ season_id }) => season_id === seasons.current_season);
assert.ok(season, "The current narrative season must exist.");
assert.equal(season.duration_weeks, 12);
assert.equal(season.publication_count, 36);
assert.equal(season.chapters.length, 3);
assert.deepEqual(season.weekly_form.map(({ kind }) => kind), ["seed", "relation", "aperture"]);
assert.equal(season.chapters.flatMap(({ questions }) => questions).length, 12);
assert.ok(Date.parse(season.not_before) > Date.parse(archive.packets.at(-1).not_before));

const [html, styles] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8")
]);
for (const chamber of ["field", "narrative", "language", "coordinate", "verify", "works", "intake"]) {
  assert.match(html, new RegExp(`href=\"#${chamber}\"`));
  assert.match(html, new RegExp(`id=\"${chamber}\"`));
}
const chamberOrder = ["field", "narrative", "language", "coordinate", "verify", "works", "intake"];
const navOrder = chamberOrder.map((id) => html.indexOf(`href="#${id}" data-space="${id}"`));
const scrollOrder = chamberOrder.map((id) => html.indexOf(`id="${id}"`));
assert.deepEqual([...navOrder].sort((a, b) => a - b), navOrder, "Navigation must follow chamber scroll order.");
assert.deepEqual([...scrollOrder].sort((a, b) => a - b), scrollOrder, "Chamber scroll order must remain canonical.");
chamberOrder.forEach((id, index) => {
  assert.match(
    styles,
    new RegExp(`body\\.archive-open #${id} \\{ order: ${index + 1}; \\}`),
    `${id} must preserve its visual scroll position.`
  );
});
assert.match(html, /Sovereign Standard \/ material practice/);

const attractorPolicy = await readJson("content/attractor-policy.json");
const cultivationPolicy = await readJson("cultivation/policy.json");
assert.equal(attractorPolicy.refinement_transition.narrative_policy, "content/narrative-policy.json");
assert.ok(cultivationPolicy.canonical_sources.includes("content/narrative-seasons.json"));

console.log("Root Logos narrative policy, first season, chamber navigation, and material boundary are coherent.");
