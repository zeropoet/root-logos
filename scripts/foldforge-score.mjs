import { createHash } from "node:crypto";

const digest = (value) => createHash("sha256").update(String(value)).digest("hex");

export const foldForgeCompositionSourceWitness = (snapshot) => snapshot.composition_witness
  || `sha256:${digest(JSON.stringify({
    compositions: (snapshot.compositions || []).map(({ id, title, version, witness }) => ({ id, title, version, witness })),
    language: snapshot.language_composition?.semantic_witness || null,
    terms: snapshot.language_composition?.terms || []
  }))}`;

const compositionIdentity = (snapshot) => ({
  source_id: "foldforge",
  source_witness: foldForgeCompositionSourceWitness(snapshot),
  language_witness: snapshot.language_composition?.semantic_witness || null,
  grammars: (snapshot.compositions || []).map(({ id, title, version, witness }) => ({
    id, title, version, witness
  }))
});

const foldForgeEvents = ({ score, workId, snapshot }) => {
  const terms = snapshot.language_composition?.terms || [];
  const root = Math.max(32, Number(score.root_hz || 55));
  const scale = [1, 1.125, 1.25, 1.333333, 1.5, 1.666667, 1.875, 2];
  return terms.map(({ term, rank, works, traces }, index) => {
    const seed = Number.parseInt(digest(`${foldForgeCompositionSourceWitness(snapshot)}:${workId}:${term}`).slice(0, 8), 16);
    return {
      voice: "foldforge",
      waveform: index % 3 === 0 ? "triangle" : "sine",
      provenance: `sources/foldforge.snapshot.json#language_composition/terms/${index}`,
      composition_source: "foldforge",
      composition_id: snapshot.language_composition?.grammar?.id || "FF-COMP-0002",
      composition_witness: snapshot.language_composition?.semantic_witness || foldForgeCompositionSourceWitness(snapshot),
      term,
      rank,
      recurrence: works,
      traces,
      frequency: Number((root * scale[seed % scale.length] * (2 ** (1 + seed % 2))).toFixed(4)),
      beats: rank % 4 === 0 ? 1.5 : rank % 3 === 0 ? 1 : .5,
      rest: rank % 7 === 0,
      amplitude: Number(Math.min(.075, .018 + Math.log2(Math.max(2, works)) * .006).toFixed(4))
    };
  });
};

export const applyFoldForgeComposition = ({ score, workId, snapshot }) => {
  if (!score || !snapshot?.language_composition) return score;
  const sourceWitness = foldForgeCompositionSourceWitness(snapshot);
  if (score.composition_inheritance?.source_witness === sourceWitness) return score;
  const base = (score.events || []).filter(({ composition_source: source }) => source !== "foldforge");
  const additions = foldForgeEvents({ score, workId, snapshot });
  const interval = Math.max(1, Math.ceil(base.length / Math.max(1, additions.length)));
  const events = [];
  let additionIndex = 0;
  base.forEach((event, index) => {
    events.push(event);
    if ((index + 1) % interval === 0 && additionIndex < additions.length) {
      events.push(additions[additionIndex]);
      additionIndex += 1;
    }
  });
  events.push(...additions.slice(additionIndex));
  const inheritance = compositionIdentity(snapshot);
  const signature = digest(JSON.stringify({
    prior: score.signature,
    work_id: workId,
    inheritance,
    events: events.map(({ voice, frequency, beats, rest, provenance }) => ({ voice, frequency, beats, rest, provenance }))
  })).slice(0, 12);
  return {
    ...score,
    schema: String(score.schema || "root-logos-work-score/v1").replace(/\/v1$/, "/v2"),
    signature,
    composition_inheritance: inheritance,
    events: events.map((event, index) => ({ ...event, index }))
  };
};

export const foldForgeCompositionIdentity = compositionIdentity;
