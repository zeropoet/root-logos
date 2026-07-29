#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export const CWCS_SCHEMA = "root-logos-canonical-work-coordinate-system/v1";
const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
const segment = (value) => encodeURIComponent(String(value));
const ordinal = (value) => String(value).padStart(4, "0");
const baseFor = (edition) =>
  `root://work/${segment(edition.work_id)}/edition/${segment(edition.edition_id)}`;

export const applyCanonicalWorkCoordinates = (edition) => {
  const base = baseFor(edition);
  const counts = new Map();
  const nodeCoordinates = new Map();
  const nodes = edition.visual.topology.nodes.map((node) => {
    const type = ["work", "document", "concept"].includes(node.type) ? node.type : "node";
    const index = type === "work" ? 1 : (counts.get(type) || 0) + 1;
    counts.set(type, index);
    const coordinate = type === "work" ? `${base}/work` : `${base}/${type}/${ordinal(index)}`;
    nodeCoordinates.set(node.id, coordinate);
    return {
      ...node,
      canonical_coordinate: coordinate,
      source_coordinate_witness: node.coordinate
        ? `sha256:${digest(node.coordinate)}`
        : null
    };
  });
  const edges = edition.visual.topology.edges.map((edge, index) => ({
    ...edge,
    canonical_coordinate: `${base}/relation/${ordinal(index + 1)}`,
    from_coordinate: nodeCoordinates.get(edge.from),
    to_coordinate: nodeCoordinates.get(edge.to)
  }));
  return {
    ...edition,
    coordinate_system: {
      schema: CWCS_SCHEMA,
      base,
      origin: `${base}/work`,
      reference_frame: "immutable-edition-relative",
      temporal_coordinate: edition.created_at,
      axes: {
        structural: ["work", "document"],
        semantic: ["concept"],
        relational: ["relation"]
      },
      address_grammar: {
        work: `${base}/work`,
        document: `${base}/document/{document-ordinal}`,
        section: `${base}/document/{document-ordinal}/section/{section-ordinal}`,
        passage: `${base}/document/{document-ordinal}/section/{section-ordinal}/passage/{passage-ordinal}`,
        token_range: `${base}/document/{document-ordinal}/section/{section-ordinal}/passage/{passage-ordinal}/token/{start}:{end}`
      },
      ordinal_policy: "One-based, zero-padded, and ordered by witnessed source traversal.",
      projection: "SVG and canvas positions are non-canonical render projections.",
      privacy: "Public coordinates expose derived ordinals and opaque witnesses, never source prose."
    },
    visual: {
      ...edition.visual,
      topology: { nodes, edges }
    }
  };
};

export const validateCanonicalWorkCoordinates = (edition) => {
  const expectedBase = baseFor(edition);
  if (edition.coordinate_system?.schema !== CWCS_SCHEMA) throw new Error(`${edition.edition_id} has no CWCS v1 frame.`);
  if (edition.coordinate_system.base !== expectedBase || edition.coordinate_system.origin !== `${expectedBase}/work`) {
    throw new Error(`${edition.edition_id} has an invalid CWCS origin.`);
  }
  if (!edition.coordinate_system.address_grammar?.token_range?.endsWith("/token/{start}:{end}")) {
    throw new Error(`${edition.edition_id} does not declare the complete CWCS structural grammar.`);
  }
  const coordinates = new Set();
  const nodes = edition.visual?.topology?.nodes || [];
  for (const node of nodes) {
    if (!node.canonical_coordinate?.startsWith(`${expectedBase}/`)) {
      throw new Error(`${edition.edition_id}:${node.id} escapes its edition coordinate frame.`);
    }
    if (coordinates.has(node.canonical_coordinate)) throw new Error(`${edition.edition_id} repeats a CWCS coordinate.`);
    coordinates.add(node.canonical_coordinate);
  }
  for (const edge of edition.visual?.topology?.edges || []) {
    if (!edge.canonical_coordinate?.startsWith(`${expectedBase}/relation/`)) {
      throw new Error(`${edition.edition_id} has an invalid relation coordinate.`);
    }
    if (!coordinates.has(edge.from_coordinate) || !coordinates.has(edge.to_coordinate)) {
      throw new Error(`${edition.edition_id} has a relation outside its CWCS node frame.`);
    }
    if (coordinates.has(edge.canonical_coordinate)) throw new Error(`${edition.edition_id} repeats a CWCS coordinate.`);
    coordinates.add(edge.canonical_coordinate);
  }
  return edition;
};

const isMain = import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const root = resolve(new URL("..", import.meta.url).pathname);
  const worksRoot = join(root, "works");
  const indexPath = join(worksRoot, "index.json");
  const checkOnly = process.argv.includes("--check");
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  let changed = 0;

  for (const entry of index.works || []) {
    if (!entry.edition || /(?:Catholic|Protestant) Canon/.test(entry.collection || "")) continue;
    const prior = JSON.parse(await readFile(join(root, entry.edition), "utf8"));
    if (prior.coordinate_system?.schema === CWCS_SCHEMA) {
      validateCanonicalWorkCoordinates(prior);
      continue;
    }
    if (checkOnly) throw new Error(`${entry.title} does not carry CWCS v1 coordinates.`);

    const createdAt = new Date().toISOString();
    const editionId = `${entry.work_id}--${String(prior.root_logos_revision).replace(/[^\w.-]+/g, "-")}-cwcs-${digest(prior.edition_id).slice(0, 10)}`;
    const edition = applyCanonicalWorkCoordinates({
      ...prior,
      edition_id: editionId,
      created_at: createdAt,
      parent_edition: prior.edition_id,
      transformation: `${prior.transformation}+canonical-work-coordinates/v1`,
      reading_context: {
        kind: "canonical-work-coordinate-system",
        prior_reading_context: prior.reading_context || null,
        source_edition: prior.edition_id
      }
    });
    validateCanonicalWorkCoordinates(edition);
    const editionDir = join(worksRoot, entry.work_id, "editions", editionId);
    const href = `works/${entry.work_id}/editions/${editionId}/edition.json`;
    await mkdir(editionDir, { recursive: true });
    await writeFile(join(editionDir, "edition.json"), `${JSON.stringify(edition, null, 2)}\n`);

    const manifestPath = join(worksRoot, entry.work_id, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const record = {
      edition_id: editionId,
      root_logos_revision: prior.root_logos_revision,
      transformation: edition.transformation,
      created_at: createdAt,
      href
    };
    manifest.current_edition = editionId;
    manifest.editions = [...(manifest.editions || []), record];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    Object.assign(entry, {
      current_edition: editionId,
      editions: Number(entry.editions || 0) + 1,
      updated_at: createdAt,
      edition_history: manifest.editions,
      edition: href
    });
    changed += 1;
  }
  if (changed) {
    index.updated_at = new Date().toISOString();
    await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  }
  process.stdout.write(`${changed ? `${changed} Library works entered` : "Every current Library work inhabits"} CWCS v1.\n`);
}
