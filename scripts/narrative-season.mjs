#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const archiveUrl = new URL("content/attractor-packets.json", root);
const seasonsUrl = new URL("content/narrative-seasons.json", root);
const command = process.argv[2] || "materialize";
const readJson = async (url) => JSON.parse(await readFile(url, "utf8"));

const weekday = (date) => new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long"
}).format(date).toLowerCase();

const atEastern = (date, hour = 10, minute = 17) => {
  const local = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
  for (let pass = 0; pass < 2; pass += 1) {
    const values = Object.fromEntries(parts.formatToParts(local).map(({ type, value }) => [type, value]));
    const represented = Date.UTC(+values.year, +values.month - 1, +values.day, +values.hour, +values.minute);
    local.setTime(local.getTime() + (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute) - represented));
  }
  return local.toISOString();
};

const phrases = {
  seed: ({ question, recognition, chapter }) => [
    recognition,
    question,
    `${chapter} holds both without deciding their end.`,
    "The Weave begins."
  ],
  relation: ({ motif, relation }) => [
    relation,
    `What changes when ${motif} enters relation?`,
    "The prior question returns without resolution.",
    "The relation remains open."
  ],
  aperture: ({ motif, aperture }) => [
    aperture,
    `What remains outside ${motif}’s present form?`,
    "The structure cannot hold everything.",
    "An opening remains."
  ]
};

const weeklyLanguage = [
  ["Change becomes legible when something can receive it without stopping it.", "A vessel and a field meet where containment becomes relation.", "Whatever holds change is also changed by the holding."],
  ["Shelter begins by making exposure bearable.", "A boundary serves life when it distinguishes care from possession.", "Every shelter must leave a way to depart."],
  ["Departure does not return a vessel to its untouched state.", "Absence and residue describe the same encounter from opposite sides.", "An emptied form may still carry the pressure of what passed through it."],
  ["Structure becomes care when its limits protect another becoming.", "Care gives form to attention without claiming authority over its object.", "A caring structure must remain answerable to the life it affects."],
  ["Repetition makes difference perceptible.", "A repeated act joins memory to the body before it becomes ritual.", "The next return can still refuse the pattern it inherits."],
  ["Attention changes the relation even when it leaves the object intact.", "To attend is to let another presence alter the field of relevance.", "What attention cannot possess may still transform it."],
  ["The hand discovers constraints that abstraction can overlook.", "Material resistance returns thought to weight, temperature, sequence, and consequence.", "The body leaves knowledge unfinished enough to be tested again."],
  ["Return gives an ordinary act a history.", "Ritual begins when repetition can carry difference without losing continuity.", "No recurrence is owed its next occurrence."],
  ["Consumption changes location; it does not erase relation.", "Residue witnesses contact without proving ownership of what occurred.", "What remains may be material, remembered, or unresolved."],
  ["Use writes time into an object without giving the object a voice it does not have.", "Wear becomes evidence when interpretation remains accountable to the marks.", "An object may hold history without settling its meaning."],
  ["Keeping is a temporary relation, not a permanent claim.", "Transfer preserves continuity only when source, condition, and freedom remain visible.", "Every new keeper receives limits along with possibility."],
  ["A vessel learns only in the sense that relation changes what it can truthfully carry.", "What passed through the form returns as constraint, memory, and altered capacity.", "The season closes by returning its first question in a changed field."]
];

const sourceForChapter = {
  Holding: { node: "principle-living-membrane", relations: ["identity", "coherence"] },
  Ritual: { node: "coherence", relations: ["participation", "field-note-time-memory"] },
  Residue: { node: "field-note-time-memory", relations: ["identity", "stewardship"] }
};

const rawPacket = ({ id, due, form, season, chapter, week, question, motif, language, transition = false }) => {
  const source = sourceForChapter[chapter.title];
  const context = { question, motif, chapter: chapter.title, recognition: language[0], relation: language[1], aperture: language[2] };
  return {
    attractor_id: `RL-ATTRACTOR-${String(id).padStart(4, "0")}`,
    kind: "question",
    epistemic: { status: "unresolved", basis: "declared narrative season grounded in accepted constitutional structure" },
    status: "eligible",
    source_revision: "2.0.0-foundation",
    source,
    fragment: phrases[form](context),
    destination: { canonical_url: "https://rootlogos.com/#narrative" },
    release: { cadence_class: transition ? "weaving-threshold" : "weaving-season", not_before: due },
    narrative: {
      movement: season.movement,
      season_id: season.season_id,
      chapter: chapter.title,
      week,
      form,
      motif,
      prior_return: transition ? "RL-ATTRACTOR-0024" : id === 26 ? "RL-ATTRACTOR-0025" : `RL-ATTRACTOR-${String(id - 1).padStart(4, "0")}`
    },
    scrutiny: { provenance: "passed", relational_necessity: "passed", non_substitution: "passed", compression: "passed", novelty: "passed", platform_independence: "passed" },
    integrity: { source_fidelity: "passed", relational_incompleteness: "passed", constitutional_integrity: "passed", return_path: "passed" },
    publication: { status: "unpublished", external_id: null, external_url: null, published_at: null }
  };
};

const build = (season) => {
  const questions = season.chapters.flatMap((chapter) => chapter.questions.map((question) => ({ chapter, question })));
  const openingDate = new Date(season.not_before);
  const packets = [rawPacket({
    id: 25,
    due: season.not_before,
    form: "seed",
    season,
    chapter: season.chapters[0],
    week: 0,
    question: season.opening_question,
    motif: "threshold",
    language: ["The fragments are complete; their relations are not.", "A finished sequence becomes a field when its parts can begin changing one another.", "Completion leaves an opening where composition can start."],
    transition: true
  })];
  let date = new Date(Date.UTC(openingDate.getUTCFullYear(), openingDate.getUTCMonth(), openingDate.getUTCDate() + 1));
  while (weekday(date) !== "monday") date.setUTCDate(date.getUTCDate() + 1);
  let id = 26;
  for (let weekIndex = 0; weekIndex < questions.length; weekIndex += 1) {
    const { chapter, question } = questions[weekIndex];
    const language = weeklyLanguage[weekIndex];
    const motif = season.motifs[weekIndex % season.motifs.length];
    for (const [offset, form] of [[0, "seed"], [2, "relation"], [4, "aperture"]]) {
      const dueDate = new Date(date);
      dueDate.setUTCDate(dueDate.getUTCDate() + offset);
      packets.push(rawPacket({ id, due: atEastern(dueDate), form, season, chapter, week: weekIndex + 1, question, motif, language }));
      id += 1;
    }
    date.setUTCDate(date.getUTCDate() + 7);
  }
  return packets;
};

const main = async () => {
  const [archive, seasons] = await Promise.all([readJson(archiveUrl), readJson(seasonsUrl)]);
  const season = seasons.seasons.find(({ season_id }) => season_id === seasons.current_season);
  if (!season) throw new Error("Current narrative season is missing.");
  const foundingOpen = archive.packets.some((packet) =>
    (packet.release?.cadence_class || archive.defaults?.release?.cadence_class) === "founding-cycle" && packet.publication?.status !== "published"
  );
  if (foundingOpen) {
    process.stdout.write("The founding cycle remains open; no Weaving packets were materialized.\n");
    return;
  }
  const generated = build(season);
  const generatedById = new Map(generated.map((packet) => [packet.attractor_id, packet]));
  const existing = new Set(archive.packets.map(({ attractor_id }) => attractor_id));
  const additions = generated.filter(({ attractor_id }) => !existing.has(attractor_id));
  const stale = archive.packets.filter((packet) => {
    const declared = generatedById.get(packet.attractor_id);
    return declared && packet.publication?.status !== "published" && JSON.stringify(packet) !== JSON.stringify(declared);
  });
  if (command === "check") {
    if (additions.length || stale.length) throw new Error(`${additions.length} declared Weaving packets are missing and ${stale.length} unpublished packets are stale.`);
    process.stdout.write(`PASS ${generated.length} Weaving packets are materialized.\n`);
    return;
  }
  if (command !== "materialize") throw new Error(`Unknown command: ${command}`);
  if (additions.length || stale.length) {
    archive.packets = archive.packets.map((packet) =>
      generatedById.has(packet.attractor_id) && packet.publication?.status !== "published"
        ? generatedById.get(packet.attractor_id)
        : packet
    );
    archive.packets.push(...additions);
    await writeFile(archiveUrl, `${JSON.stringify(archive, null, 2)}\n`);
  }
  process.stdout.write(`${additions.length || stale.length ? `Materialized ${additions.length} and refreshed ${stale.length}` : "No new"} Weaving packets.\n`);
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
