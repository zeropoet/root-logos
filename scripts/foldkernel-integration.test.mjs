#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildFoldKernelProjection,
  contractVersion,
  packageVersion,
  protocolVersion,
  serializeProjection,
} from "./foldkernel-integration.mjs";

const declaration = JSON.parse(await readFile(new URL("../foldkernel-integration.json", import.meta.url)));
assert.equal(declaration.contractVersion, contractVersion);
assert.equal(declaration.foldKernel.protocolVersion, protocolVersion);
assert.equal(declaration.foldKernel.packageRequirement.version, packageVersion);

const projection = await buildFoldKernelProjection();
const eventNames = projection.events.map(({ event }) => event);
assert.deepEqual(eventNames, declaration.eventMeanings.map(({ event }) => event));
assert.equal(projection.authority, "Root Logos");
assert.match(projection.projection_witness, /^sha256:[0-9a-f]{64}$/);
assert.ok(projection.events.every(({ application_witness }) => /^sha256:[0-9a-f]{64}$/.test(application_witness)));
assert.doesNotMatch(JSON.stringify(projection), /convergence_hash|convergenceHash/);

const committed = await readFile(new URL("../content/foldkernel-projection.json", import.meta.url), "utf8");
assert.equal(committed, serializeProjection(projection));
process.stdout.write("PASS Root Logos projects its native state into the exact FoldKernel contract without claiming convergence authority.\n");
