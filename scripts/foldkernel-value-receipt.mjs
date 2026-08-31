import { keccak_256 } from "@noble/hashes/sha3.js";

export const valueReceiptVersion = "FoldKernel-Value-Receipt-1.0.0";

export function issueRootLogosValueReceipt({ eventID, artifactDigest, outputKind, periodStart, periodEnd }) {
  requireMatch(eventID, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/, "event ID");
  requireMatch(artifactDigest, /^[0-9a-f]{64}$/, "artifact digest");
  requireMatch(outputKind, /^[a-z0-9][a-z0-9._-]{0,79}$/, "output kind");
  requireDate(periodStart, "period start");
  requireDate(periodEnd, "period end");
  if (periodStart > periodEnd) throw new Error("period end precedes period start");
  const receipt = {
    contractVersion: valueReceiptVersion,
    digestAlgorithm: "keccak-256",
    receiptID: "",
    sourceSystem: "root-logos",
    eventID,
    artifactDigest,
    outputKind,
    periodStart,
    periodEnd,
    state: "evidenced",
    valuationBasis: "none",
    currency: null,
    monetaryCounterpartCents: null,
    valuationEvidenceDigest: null,
    settlementEvidenceDigest: null,
    priorReceiptID: null,
    transferable: false,
    purchasable: false,
    appreciating: false,
    personalData: false,
  };
  receipt.receiptID = receiptDigest(receipt);
  return receipt;
}

function receiptDigest(receipt) {
  const bytes = [];
  for (const value of [receipt.contractVersion, receipt.digestAlgorithm, receipt.sourceSystem, receipt.eventID]) pushText(bytes, value);
  bytes.push(...hexBytes(receipt.artifactDigest));
  for (const value of [receipt.outputKind, receipt.periodStart, receipt.periodEnd, receipt.state, receipt.valuationBasis]) pushText(bytes, value);
  bytes.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
  return Array.from(keccak_256(Uint8Array.from(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function pushText(target, value) {
  const encoded = new TextEncoder().encode(value);
  const size = encoded.length;
  target.push((size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, ...encoded);
}

function hexBytes(value) {
  return value.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
}

function requireMatch(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`invalid FoldKernel value receipt ${label}`);
}

function requireDate(value, label) {
  requireMatch(value, /^\d{4}-\d{2}-\d{2}$/, label);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`invalid FoldKernel value receipt ${label}`);
  }
}
