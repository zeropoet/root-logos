const RUNTIME = "https://runtime.rootlogos.com";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[character]);
const sentence = (value = "") => String(value).replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const canonicalCultivationId = (value = "") => String(value).replace(/^RL-CULT-/, "RL-CULTIVATE-");
const canonicalCycle = (cycle) => ({
  ...cycle,
  cultivation_id: canonicalCultivationId(cycle.cultivation_id),
  proposal: cycle.proposal ? { ...cycle.proposal, cultivation_id: canonicalCultivationId(cycle.proposal.cultivation_id) } : cycle.proposal
});
const shortDate = (value) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "Never";
const runtimeIsAwake = () => {
  const status = String(app.runtime?.service?.status || "unknown").toLowerCase();
  return !app.runtime?.dormancy?.active && !["sleeping", "dormant"].includes(status);
};
const hash = (value) => [...String(value)].reduce((sum, character) => ((sum << 5) - sum + character.charCodeAt(0)) | 0, 0);
const seeded = (value) => {
  const x = Math.sin(hash(value) * 91.173) * 43758.5453;
  return x - Math.floor(x);
};

const app = {
  graph: null,
  runtime: null,
  cycles: [],
  memory: null,
  latest: null,
  selectedNode: null,
  selectedProposal: null,
  attractors: null,
  narrativePolicy: null,
  narrativeSeasons: null,
  readingState: null,
  designFlow: null,
  filter: "all",
  observatoryMode: "causality",
  observatorySelection: null,
  identity: null,
  sources: null,
  foldforge: null,
  foldportrait: null,
  sourceWitnesses: {},
  materialWitnesses: {},
  citizenship: null,
  exports: [],
  localState: null,
  propagationFilter: "all",
  propagationExpanded: false
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
};

const loadData = async () => {
  const [graphResult, runtimeResult, cyclesResult, memoryResult, localStateResult, attractorResult, narrativePolicyResult, narrativeSeasonsResult, readingStateResult, designFlowResult, identityResult, sourcesResult, foldForgeResult, telosResult, sovereignStandardResult, sovereignMaterialResult, foldPortraitResult, citizenshipResult, exportsResult] = await Promise.allSettled([
    fetchJson("content/constitutional-graph.json"),
    fetchJson(`${RUNTIME}/v1/status`),
    fetchJson(`${RUNTIME}/v1/cycles`),
    fetchJson("cultivation/memory.json"),
    fetchJson("cultivation/state.json"),
    fetchJson("content/attractor-packets.json"),
    fetchJson("content/narrative-policy.json"),
    fetchJson("content/narrative-seasons.json"),
    fetchJson("reading/state.json"),
    fetchJson("content/design-flow-ledger.json"),
    fetchJson("self-authorship/current.json"),
    fetchJson("sources/registry.json"),
    fetchJson("sources/foldforge.snapshot.json"),
    fetchJson("sources/telos.public-witness.json"),
    fetchJson("sources/sovereign-standard.public-witness.json"),
    fetchJson("sources/sovereign-standard.snapshot.json"),
    fetchJson("sources/foldportrait.snapshot.json"),
    fetchJson("content/citizenship.json"),
    fetchJson("content/export-packets.json")
  ]);

  if (graphResult.status !== "fulfilled") throw graphResult.reason;
  app.graph = graphResult.value;
  app.memory = memoryResult.status === "fulfilled" ? memoryResult.value : null;
  app.attractors = attractorResult.status === "fulfilled" ? attractorResult.value : { packets: [] };
  app.narrativePolicy = narrativePolicyResult.status === "fulfilled" ? narrativePolicyResult.value : null;
  app.narrativeSeasons = narrativeSeasonsResult.status === "fulfilled" ? narrativeSeasonsResult.value : null;
  app.readingState = readingStateResult.status === "fulfilled" ? readingStateResult.value : null;
  app.designFlow = designFlowResult.status === "fulfilled" ? designFlowResult.value : null;
  app.identity = identityResult.status === "fulfilled" ? identityResult.value : null;
  app.sources = sourcesResult.status === "fulfilled" ? sourcesResult.value : { sources: [] };
  app.foldforge = foldForgeResult.status === "fulfilled" ? foldForgeResult.value : null;
  app.foldportrait = foldPortraitResult.status === "fulfilled" ? foldPortraitResult.value : null;
  app.citizenship = citizenshipResult.status === "fulfilled" ? citizenshipResult.value : null;
  app.exports = exportsResult.status === "fulfilled" ? exportsResult.value : [];
  app.localState = localStateResult.status === "fulfilled" ? localStateResult.value : null;
  app.sourceWitnesses = Object.fromEntries([
    telosResult.status === "fulfilled" ? [telosResult.value.source_id, telosResult.value] : null,
    sovereignStandardResult.status === "fulfilled" ? [sovereignStandardResult.value.source_id, sovereignStandardResult.value] : null
  ].filter(Boolean));
  app.materialWitnesses = Object.fromEntries([
    sovereignMaterialResult.status === "fulfilled"
      ? [sovereignMaterialResult.value.source_id, sovereignMaterialResult.value]
      : null
  ].filter(Boolean));
  app.cycles = cyclesResult.status === "fulfilled" ? cyclesResult.value.cycles.map(canonicalCycle) : [];

  if (runtimeResult.status === "fulfilled") {
    app.runtime = runtimeResult.value;
  } else {
    const state = localStateResult.status === "fulfilled" ? localStateResult.value : { status: "unavailable", history: [] };
    app.runtime = {
      service: { status: "archive", queued_triggers: [], last_wake_at: null, last_error: null },
      cultivation: state,
      dormancy: app.memory?.dormancy || { active: false },
      novelty: app.memory?.novelty || {},
      hypothesis_count: Object.keys(app.memory?.hypotheses || {}).length,
      policy: { constitutional_revision: app.graph.meta.revision, mode: "bounded-self-refactoring" },
      intake_count: 0,
      archival_fallback: true
    };
  }

  if (!app.cycles.length && app.runtime.cultivation?.history?.length) {
    const ids = app.runtime.cultivation.history.map(({ cultivation_id }) => canonicalCultivationId(cultivation_id)).reverse().slice(0, 24);
    const loaded = await Promise.allSettled(ids.map((id) => fetchJson(`cultivation/cycles/${id}.json`)));
    app.cycles = loaded.filter(({ status }) => status === "fulfilled").map(({ value }) => canonicalCycle(value));
  }
  app.latest = app.cycles[0] || null;
};

const renderNarrative = () => {
  const packets = app.attractors?.packets || [];
  const founding = packets.filter((packet) => (packet.release?.cadence_class || app.attractors?.defaults?.release?.cadence_class) === "founding-cycle");
  const emitted = founding.filter(({ publication }) => publication?.status === "published");
  const latest = [...emitted].sort((left, right) => new Date(right.publication.published_at) - new Date(left.publication.published_at))[0];
  const season = (app.narrativeSeasons?.seasons || []).find(({ season_id }) => season_id === app.narrativeSeasons?.current_season)
    || app.narrativeSeasons?.seasons?.[0];

  $("#narrative-progress-count").textContent = `${emitted.length} / ${founding.length || 24}`;
  $("#narrative-progress-bar").style.width = `${Math.min(100, emitted.length / Math.max(1, founding.length || 24) * 100)}%`;
  if (latest) {
    $("#narrative-fragment-id").textContent = `${latest.attractor_id} / ${latest.fragment?.at(-1) || "Current fragment"}`;
    $("#narrative-fragment-date").textContent = shortDate(latest.publication.published_at);
    $("#narrative-fragment-text").innerHTML = (latest.fragment || []).slice(0, 3).map((line) => `<span>${escapeHtml(line)}</span>`).join("");
    $("#narrative-fragment-link").href = latest.publication.external_url || "https://x.com/rootlogos";
  }
  if (season) {
    $("#narrative-season-title").textContent = season.title;
    $("#narrative-season-premise").textContent = season.premise;
    $("#narrative-chapters").innerHTML = (season.chapters || []).map((chapter) => `<article>
      <span>${String(chapter.chapter).padStart(2, "0")}</span>
      <h4>${escapeHtml(chapter.title)}</h4>
      <p>${escapeHtml(chapter.questions?.[0] || "The question remains open.")}</p>
    </article>`).join("");
  }
};

const renderPresence = () => {
  const service = app.runtime.service;
  if (app.identity) {
    document.title = `${app.identity.name} — A Living Literature With Memory`;
    $("meta[name='description']")?.setAttribute("content", app.identity.declaration);
  }
  const status = service.status || "unknown";
  const header = $(".system-presence");
  header.dataset.state = status;
  header.dataset.pulsing = String(runtimeIsAwake());
  const displayedStatus = sentence(status === "archive" ? "Archive mode" : status);
  $("#header-state").textContent = displayedStatus;
  $("#archive-revision").textContent = app.identity?.revision || app.graph.meta?.revision || "—";

  const sleeping = status === "sleeping";
  const running = status === "running";
};

let readingPlayback = null;
const renderLanguage = () => {
  const branch = app.readingState?.branches?.find(({ status }) => status === "active") || app.readingState?.branches?.[0];
  if (!branch) {
    $("#reading-title").textContent = "No reading has been selected.";
    $("#reading-status").textContent = "Resting";
    $("#reading-listen").disabled = true;
    return;
  }
  const tone = branch.experiments?.tonal;
  $("#reading-title").textContent = `${branch.branch_id} / ${branch.derived_grammar?.name || "Structural listening"}`;
  $("#reading-status").textContent = sentence(branch.status);
  $("#reading-question").textContent = branch.question.text;
  $("#reading-source-title").textContent = branch.reading.title;
  $("#reading-reason").textContent = branch.reading.selection_reason;
  $("#reading-rights").textContent = `${branch.reading.rights_basis} · ${branch.reading.available_material}`;
  $("#reading-utterance").textContent = branch.experiments.textual.utterance.join(" ");
  $("#reading-duration").textContent = `${tone.duration_seconds} seconds`;
  $("#reading-provenance").textContent = `${sentence(branch.provenance.expression_origin)} · ${branch.provenance.source_witness}`;
  $("#reading-listen").dataset.branchId = branch.branch_id;
};

const stopReadingTone = () => {
  if (!readingPlayback) return;
  readingPlayback.nodes.forEach((node) => { try { node.stop(); } catch {} });
  readingPlayback.context.close().catch(() => {});
  clearTimeout(readingPlayback.timer);
  readingPlayback = null;
  $("#reading-listen").setAttribute("aria-pressed", "false");
  $("#reading-listen span").textContent = "Hear this branch";
  $("#reading-tone-state").textContent = "The score is silent.";
};

const playReadingTone = async () => {
  if (readingPlayback) return stopReadingTone();
  const branch = app.readingState?.branches?.find(({ branch_id: id }) => id === $("#reading-listen").dataset.branchId);
  const score = branch?.experiments?.tonal;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!score?.events?.length || !AudioContext) {
    $("#reading-tone-state").textContent = "This browser cannot form the utterance.";
    return;
  }
  const context = new AudioContext();
  await context.resume();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 5;
  const master = context.createGain();
  master.gain.value = .72;
  master.connect(compressor).connect(context.destination);
  const nodes = new Set();
  readingPlayback = { context, nodes, timer: null };
  const scheduleCycle = () => {
    if (!readingPlayback || readingPlayback.context !== context) return;
    const start = context.currentTime + .08;
    score.events.forEach((event, index) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      oscillator.type = index % 3 === 1 ? "triangle" : "sine";
      oscillator.frequency.value = score.root_hz * event.ratio * 2;
      filter.type = "lowpass";
      filter.frequency.value = 720 + index * 110;
      const at = start + event.at;
      envelope.gain.setValueAtTime(.0001, at);
      envelope.gain.exponentialRampToValueAtTime(event.amplitude, at + Math.min(.18, event.duration * .22));
      envelope.gain.exponentialRampToValueAtTime(.0001, at + event.duration);
      oscillator.connect(filter).connect(envelope).connect(master);
      oscillator.start(at);
      oscillator.stop(at + event.duration + .03);
      nodes.add(oscillator);
      oscillator.addEventListener("ended", () => nodes.delete(oscillator), { once: true });
    });
    readingPlayback.timer = window.setTimeout(scheduleCycle, (score.duration_seconds + .4) * 1000);
  };
  scheduleCycle();
  $("#reading-listen").setAttribute("aria-pressed", "true");
  $("#reading-listen span").textContent = "Return to silence";
  $("#reading-tone-state").textContent = `${score.score_id} is sounding in recurrence · ${score.provenance}`;
};

const renderCoordinate = () => {
  if (!app.identity || !app.graph) return;
  const effective = new Date(app.identity.effective_at);
  const present = Number.isNaN(effective.valueOf())
    ? app.identity.effective_at
    : new Intl.DateTimeFormat("en", { year: "numeric", month: "long", day: "numeric" }).format(effective);
  $("#coordinate-revision").textContent = `Revision ${app.identity.revision}`;
  $("#coordinate-time").textContent = `Present / ${present}`;
  $("#coordinate-lead").textContent = app.identity.headline.lead;
  $("#coordinate-emphasis").textContent = app.identity.headline.emphasis;
  $("#coordinate-declaration").textContent = app.identity.declaration;
  $("#coordinate-present").textContent = `${app.identity.revision} / ${present}`;
  $("#coordinate-field").textContent = `${app.graph.nodes.length} structures / ${app.graph.edges.length} relations`;
};

const publishedSourceRecords = {
  foldforge: "sources/foldforge.snapshot.json",
  x: "content/attractor-packets.json",
  telos: "sources/telos.public-witness.json",
  "sovereign-standard": "sources/sovereign-standard.public-witness.json",
  foldportrait: "sources/foldportrait.snapshot.json"
};

const sourcePayload = (id) => {
  if (id === "foldforge") return app.foldforge;
  if (id === "foldportrait") return app.foldportrait;
  if (id === "x") return app.attractors;
  return app.sourceWitnesses[id] || app.materialWitnesses[id] || null;
};

const sourceWitness = (id) => {
  const payload = sourcePayload(id);
  if (payload?.witness) return payload.witness;
  if (payload?.composition_witness) return payload.composition_witness;
  if (id === "x") {
    const publications = (app.attractors?.packets || []).filter(({ publication }) => publication?.status === "published");
    return publications.at(-1)?.publication?.external_id ? `x-status:${publications.at(-1).publication.external_id}` : null;
  }
  return null;
};

const sourceRevision = (payload) => payload?.source_revision || payload?.revision || payload?.current_reflection || payload?.public_state?.source_successor_version || "Published record";
const sourceDate = (payload) => payload?.effective_date || payload?.updated_at || payload?.generated_at || payload?.current_reflection?.created_at || null;
const displayEventDate = (value) => {
  if (!value) return "Published state";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${year}-${month}-${day}T00:00:00Z`));
  }
  return new Date(value).toLocaleString();
};

const selectVerificationSource = (id) => {
  const source = (app.sources?.sources || []).find((item) => item.id === id);
  if (!source) return;
  const payload = sourcePayload(id);
  const witness = sourceWitness(id);
  $$("[data-verification-source]").forEach((button) => button.classList.toggle("is-active", button.dataset.verificationSource === id));
  $("#verify-source-coordinate").textContent = `${sentence(source.visibility)} / ${sentence(source.adapter)}`;
  $("#verify-source-status").textContent = sentence(payload?.status || source.status || "published");
  $("#verify-source-title").textContent = source.name;
  $("#verify-source-role").textContent = source.connection_message || source.role;
  const measures = [
    ["Schema", payload?.schema || source.adapter],
    ["Revision", sourceRevision(payload)],
    ["Read paths", source.reads?.length || 0],
    ["Visibility", sentence(source.visibility)]
  ];
  if (id === "foldforge") measures.splice(2, 0, ["Compositions", payload?.compositions?.length || 0]);
  if (id === "foldportrait") measures.splice(2, 0,
    ["Works", `${payload?.measures?.represented_works || 0} / ${payload?.measures?.canonical_supply_ceiling || 108}`],
    ["First era", payload?.renders?.length || 0],
    ["Reflections", payload?.reflections?.length || 0]
  );
  if (id === "x") measures.splice(2, 0, ["Published", (payload?.packets || []).filter(({ publication }) => publication?.status === "published").length]);
  if (id === "sovereign-standard") {
    const instagram = (payload?.public_state?.public_channels || []).find(({ id: channelId }) => channelId === "instagram");
    if (instagram) measures.splice(2, 0, ["Instagram", `${instagram.telos_reviewed_posts || 0} human-published / Telos-reviewed`]);
  }
  $("#verify-source-measures").innerHTML = measures.map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("");
  $("#verify-source-witness").textContent = witness || "No cryptographic digest declared for this channel";
  $("#copy-source-witness").disabled = !witness;
  $("#verify-source-paths").innerHTML = (source.reads || []).map((path) => `<code>${escapeHtml(path)}</code>`).join("");
  $("#verify-source-boundary").textContent = source.boundary;
  $("#verify-source-record").href = publishedSourceRecords[id] || "sources/registry.json";
  $("#verify-source-origin").href = source.public_url || source.repository || publishedSourceRecords[id] || "#verify";
};

const propagationEvents = () => {
  const events = [];
  (app.sources?.sources || []).forEach((source) => {
    const payload = sourcePayload(source.id);
    const witness = sourceWitness(source.id);
    events.push({
      type: "input", at: sourceDate(payload), title: `${source.name} input witnessed`, origin: sentence(source.adapter),
      consequence: source.returns || source.receives, witness: witness || publishedSourceRecords[source.id], href: publishedSourceRecords[source.id]
    });
  });
  app.cycles.forEach((cycle) => {
    const last = (cycle.events || []).at(-1);
    events.push({
      type: "inquiry", at: last?.at, title: `${cycle.cultivation_id} / ${sentence(cycle.status)}`, origin: sentence(cycle.lens?.id || "cultivation"),
      consequence: cycle.application ? "Canonical operations applied with preserved lineage." : cycle.autonomous_judgment?.reason || cycle.selected_finding?.claim || "No constitutional mutation entered the graph.",
      witness: `${(cycle.events || []).length} events`, href: `cultivation/cycles/${cycle.cultivation_id}.json`
    });
  });
  if (app.identity) events.push({
    type: "identity", at: app.identity.effective_at, title: `${app.identity.revision} / current identity`, origin: "Self-authorship lineage",
    consequence: typeof app.identity.headline === "string" ? app.identity.headline : `${app.identity.headline?.lead || ""} ${app.identity.headline?.emphasis || ""}`.trim() || app.identity.declaration,
    witness: app.identity.signature, href: "self-authorship/current.json"
  });
  (app.exports || []).forEach((packet) => events.push({
    type: "identity", at: packet.date, title: `${packet.export_id} / ${packet.primary_update?.title || "accepted export"}`, origin: packet.source,
    consequence: packet.summary, witness: packet.status, href: "content/export-packets.json"
  }));
  (app.attractors?.packets || []).filter(({ publication }) => publication?.status === "published").forEach((packet) => events.push({
    type: "output", at: packet.publication.published_at, title: `${packet.attractor_id} / fragment published`, origin: nodeTitle(packet.node),
    consequence: (packet.fragment || []).at(-1) || "A constitutional fragment crossed the public membrane.", witness: packet.publication.external_id,
    href: packet.publication.external_url
  }));
  return events.sort((left, right) => new Date(right.at || 0) - new Date(left.at || 0));
};

const renderPropagation = () => {
  const available = propagationEvents().filter(({ type }) => app.propagationFilter === "all" || type === app.propagationFilter);
  const filtered = available.slice(0, app.propagationExpanded ? 48 : 8);
  $("#propagation-events").innerHTML = filtered.map((event, index) => `<li data-propagation-type="${escapeHtml(event.type)}">
    <a href="${escapeHtml(event.href || "#verify")}"${String(event.href || "").startsWith("http") ? " target=\"_blank\" rel=\"noreferrer\"" : ""}>
      <span><i>${String(index + 1).padStart(2, "0")}</i><b>${escapeHtml(event.title)}</b><small>${escapeHtml(displayEventDate(event.at))}</small></span>
      <span>${escapeHtml(event.origin || "Root Logos")}</span><span>${escapeHtml(event.consequence || "Preserved without mutation")}</span><code>${escapeHtml(event.witness || "public record")}</code>
    </a></li>`).join("") || `<li class="propagation-empty">No events match this view.</li>`;
  const toggle = $("#propagation-toggle");
  toggle.hidden = available.length <= 8;
  toggle.setAttribute("aria-expanded", String(app.propagationExpanded));
  toggle.querySelector("span").textContent = app.propagationExpanded ? "Return to recent motion" : `Open full trail / ${Math.min(48, available.length)} records`;
  $("#propagation-window").textContent = app.propagationExpanded ? `Showing ${filtered.length} available records` : `Showing ${filtered.length} most recent records`;
};

const renderVerification = () => {
  const sources = app.sources?.sources || [];
  const witnesses = sources.filter(({ id }) => Boolean(sourceWitness(id))).length;
  const published = (app.attractors?.packets || []).filter(({ publication }) => publication?.status === "published").length;
  $("#verify-input-count").textContent = sources.length;
  $("#verify-witness-count").textContent = witnesses;
  $("#verify-node-count").textContent = app.graph.nodes.length;
  $("#verify-edge-count").textContent = app.graph.edges.length;
  $("#verify-cycle-count").textContent = app.localState?.history?.length || app.cycles.length;
  $("#verify-emission-count").textContent = published;
  $("#verification-freshness").innerHTML = `<i></i>Loaded directly from ${sources.length} published input records`;
  $("#verification-source-list").innerHTML = sources.map((source, index) => `<button type="button" data-verification-source="${escapeHtml(source.id)}" class="${index === 0 ? "is-active" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(source.name)}</b><small>${escapeHtml(sentence(source.visibility))}</small><i>${sourceWitness(source.id) ? "Witnessed" : "Declared channel"}</i></button>`).join("");
  $$("[data-verification-source]").forEach((button) => button.addEventListener("click", () => selectVerificationSource(button.dataset.verificationSource)));
  if (sources[0]) selectVerificationSource(sources[0].id);
  renderPropagation();
};

const submitObservation = async (form) => {
  const button = $("button[type='submit']", form);
  const status = $("#observation-status");
  const data = new FormData(form);
  const payload = {
    observation: data.get("observation"),
    attribution: data.get("attribution") || "Anonymous",
    participant_class: data.get("participant_class") || "undeclared",
    consent: data.get("consent") === "on",
    website: data.get("website")
  };
  button.disabled = true;
  status.className = "";
  status.textContent = "The membrane is receiving, transforming, and judging this entry…";
  try {
    const response = await fetch(`${RUNTIME}/v1/public/intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.details?.join(" · ") || result.error || "The observation could not cross the membrane.");
    status.className = "is-success";
    const depth = Math.round(Number(result.penetration?.depth || 0) * 100);
    status.textContent = `${result.event_id || "The entry"} entered the field to ${depth}% depth with disposition ${sentence(result.status || "held")}. Its source wording was released.`;
    form.reset();
    if (result.event_id) {
      app.runtime.intake_count = (app.runtime.intake_count || 0) + 1;
    }
    if (result.penetration) {
      dispatchEvent(new CustomEvent("rootlogos:journal-penetration", {
        detail: { event_id: result.event_id, ...result.penetration }
      }));
      location.hash = "object";
    }
  } catch (error) {
    status.className = "is-error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

const renderLatestCycle = () => {
  const cycle = app.latest;
  if (!cycle) return;
  const finding = cycle.selected_finding || {};
  const proposal = cycle.proposal || {};
  const evaluation = finding.evaluation || proposal.evaluation;
  const evaluationTotal = Number(evaluation?.total);
  const status = String(proposal.status || cycle.status || "unresolved");
  const disposition = status.includes("reject")
    ? "Rejected"
    : status.includes("accept") || status.includes("implement") || status.includes("applied")
      ? "Accepted"
      : status.includes("escalat") || proposal.human_decision_required
        ? "Human review"
        : sentence(status);
  const proposalLabel = Number.isFinite(evaluationTotal)
    ? `Latest proposal ${Math.round(Math.max(0, Math.min(24, evaluationTotal)))}/24 · ${disposition}`
    : "No scored proposal";
  const objectInquiryReach = $("#object-inquiry-reach");
  if (objectInquiryReach) objectInquiryReach.textContent = proposalLabel;
  $("#archive-inquiry-reach").textContent = proposalLabel;
};

const renderMemory = () => {
  let hypotheses = Object.values(app.memory?.hypotheses || {});
  if (!hypotheses.length) {
    const seen = new Map();
    app.cycles.forEach((cycle) => {
      const finding = cycle.selected_finding;
      const fingerprint = finding?.reconsideration?.fingerprint;
      if (!fingerprint) return;
      seen.set(fingerprint, {
        fingerprint, kind: finding.kind, claim: finding.claim, nodes: finding.nodes,
        status: cycle.status, last_cycle: cycle.cultivation_id,
        considerations: 1, last_evaluation: finding.evaluation,
        last_novelty_reason: finding.reconsideration.reason
      });
    });
    hypotheses = [...seen.values()];
  }
  hypotheses.sort((a, b) => Number(b.last_cycle?.split("-").at(-1)) - Number(a.last_cycle?.split("-").at(-1)));
  $("#memory-ledger").innerHTML = hypotheses.slice(0, 12).map((item, index) => {
    const disposition = sentence(item.status || "remembered");
    const returnCondition = item.status === "implemented" ? "Canonical relation preserved" : "Evidence, policy, or incubation must change";
    const total = item.last_evaluation?.total;
    return `<article class="memory-item">
      <div class="memory-identity"><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(item.claim || sentence(item.kind))}</h3><p>${escapeHtml((item.nodes || []).map(nodeTitle).join(" · ") || sentence(item.kind))}</p></div></div>
      <div class="memory-status ${item.status === "implemented" ? "implemented" : ""}">${escapeHtml(disposition)}</div>
      <div class="memory-evidence">${total == null ? "—" : `${total} / 24`}<span>${escapeHtml(item.considerations || 1)} consideration${item.considerations === 1 ? "" : "s"}</span></div>
      <div class="memory-return">${escapeHtml(returnCondition)}</div>
    </article>`;
  }).join("") || `<div class="memory-loading">No hypothesis has yet crossed into semantic memory.</div>`;
};

const nodeTitle = (id) => app.graph?.nodes.find((node) => node.id === id)?.title || sentence(id || "");

const proposalSummary = (cycle) => cycle.selected_finding?.claim || cycle.proposal?.summary || "No claim preserved.";
const renderProposals = () => {
  const proposals = app.cycles.filter((cycle) => cycle.proposal).slice(0, 8);
  $("#proposal-stack").innerHTML = proposals.map((cycle, index) => `<button class="proposal-card ${index === 0 ? "is-active" : ""}" type="button" data-proposal="${escapeHtml(cycle.cultivation_id)}">
    <span><b>${escapeHtml(cycle.cultivation_id)}</b><i>${escapeHtml(sentence(cycle.status))}</i></span>
    <h3>${escapeHtml(sentence(cycle.lens?.id || "Inquiry"))}</h3>
    <p>${escapeHtml(proposalSummary(cycle))}</p>
  </button>`).join("") || `<p class="memory-loading">No proposals are preserved.</p>`;
  $$(".proposal-card").forEach((card) => {
    const select = () => selectProposal(card.dataset.proposal);
    card.addEventListener("pointerenter", select);
    card.addEventListener("focus", select);
    card.addEventListener("click", select);
  });
  if (proposals[0]) selectProposal(proposals[0].cultivation_id);
};

const selectProposal = (id) => {
  const cycle = app.cycles.find((item) => item.cultivation_id === id);
  if (!cycle) return;
  app.selectedProposal = cycle;
  $$(".proposal-card").forEach((card) => {
    const selected = card.dataset.proposal === id;
    card.classList.toggle("is-active", selected);
    card.setAttribute("aria-pressed", String(selected));
  });
  const judgment = cycle.autonomous_judgment || {};
  const operations = judgment.operations || cycle.proposal?.operations || [];
  const finding = cycle.selected_finding || {};
  $("#review-title").textContent = `${cycle.cultivation_id} / ${sentence(cycle.lens?.id || "inquiry")}`;
  $("#review-risk").textContent = `${sentence(judgment.risk || "human")} risk`;
  $("#review-claim").textContent = proposalSummary(cycle);
  $("#review-judgment").textContent = judgment.reason || `Disposition: ${sentence(cycle.status)}.`;
  $("#review-reversibility").textContent = operations.length && operations.every(({ operation }) => operation === "add-edge") ? "Additive graph operations; reversible through a witnessed revision." : "Requires human evaluation of semantic reversibility.";
  $("#review-nodes").textContent = (finding.nodes || cycle.proposal?.affected_nodes || []).map(nodeTitle).join(" · ") || "No canonical mutation proposed.";
  $("#review-authority").textContent = sentence(judgment.authority || cycle.application?.authority || "Delegated autonomous authority");
};

const buildWaveform = () => {
  const wave = $("#silent-waveform");
  if (!wave) return;
  wave.innerHTML = Array.from({ length: 46 }, (_, index) => `<i style="--h:${5 + Math.abs(Math.sin(index * .63) * Math.cos(index * .18)) * 32}px"></i>`).join("");
};

const observatoryModes = {
  causality: ["Consequence lineage", "The Causal Thread", "An arrival passes through admission, wake, inquiry, judgment, and structural consequence."],
  epistemic: ["Kinds of knowing", "The Epistemic Field", "Canonical, interrogative, provisional, remembered, rejected, and implemented knowledge share one field."],
  pressure: ["Attention topology", "Pressure + Attention", "Recent inquiry, structural connectivity, and unresolved questions gather force here."],
  absence: ["Computed negative space", "The Negative-Space Map", "Missing relations remain named without being mistaken for structures that already exist."],
  authority: ["Permission topology", "The Stewardship Ledger", "Permission runs from arrival to publication, with every place of required stopping held visible."],
  respiration: ["Constitutional exchange", "The Attractor Constellation", "Meaning moves outward through emission and inward through observed consequence."],
};

const sharedKeywords = (left, right) => {
  const a = new Set((left.keywords || []).map((word) => word.toLowerCase()));
  return (right.keywords || []).map((word) => word.toLowerCase()).filter((word) => a.has(word));
};

class LivingObservatory {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.mode = "causality";
    this.points = [];
    this.hovered = null;
    this.pointer = { x: -1000, y: -1000 };
    this.time = 0;
    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.resize();
    this.bind();
    this.setMode("causality");
    requestAnimationFrame(this.draw);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.compose();
  }

  bind() {
    window.addEventListener("resize", this.resize, { passive: true });
    this.canvas.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      this.hovered = this.points.find((point) => Math.hypot(point.x - this.pointer.x, point.y - this.pointer.y) < Math.max(13, point.r + 7)) || null;
      this.canvas.style.cursor = this.hovered ? "pointer" : "crosshair";
    });
    this.canvas.addEventListener("pointerleave", () => { this.hovered = null; });
    this.canvas.addEventListener("click", () => { if (this.hovered) this.select(this.hovered); });
  }

  setMode(mode) {
    this.mode = mode;
    app.observatoryMode = mode;
    const [coordinate, title, copy] = observatoryModes[mode];
    $("#observatory-coordinate").textContent = coordinate;
    $("#observatory-mode-title").textContent = title;
    $("#observatory-mode-copy").textContent = copy;
    $(".observatory-stage").dataset.mode = mode;
    $$("[data-observatory-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.observatoryMode === mode));
    this.compose();
    this.renderLegend();
    const initial = this.points[0];
    if (initial) this.select(initial, false);
  }

  compose() {
    if (!this.width) return;
    const builders = {
      causality: () => this.causality(), epistemic: () => this.epistemic(),
      pressure: () => this.pressure(), absence: () => this.absence(), authority: () => this.authority(), respiration: () => this.respiration()
    };
    this.points = builders[this.mode]();
  }

  causality() {
    const cycle = app.cycles.find(({ intake }) => intake) || app.latest;
    const phases = cycle?.intake ? [
      ["Observation", cycle.intake.event_id, cycle.intake.payload?.observation], ["Admission", sentence(cycle.intake.disposition), cycle.intake.steward_note],
      ["Wake", cycle.cultivation_id, cycle.self_prompt], ["Inquiry", sentence(cycle.selected_finding?.kind), cycle.selected_finding?.claim],
      ["Judgment", sentence(cycle.status), cycle.autonomous_judgment?.reason], ["Consequence", cycle.application ? "Applied" : "Preserved", cycle.application ? "A reversible relation entered the graph." : "No canonical mutation was performed."]
    ] : [
      ["Source", "Constitution", "Canonical evidence changed."], ["Wake", cycle?.cultivation_id || "No cycle", cycle?.self_prompt],
      ["Search", sentence(cycle?.lens?.id), cycle?.selected_finding?.claim], ["Judgment", sentence(cycle?.status), cycle?.autonomous_judgment?.reason]
    ];
    return phases.map(([kind, title, body], index) => ({ x: this.width * (.12 + index * .76 / Math.max(1, phases.length - 1)), y: this.height * (.52 + (index % 2 ? .1 : -.1)), r: index === 0 || index === phases.length - 1 ? 8 : 5, kind, title, body, measures: [["Sequence", `${index + 1} / ${phases.length}`]], trace: phases.slice(0, index + 1).map(([label]) => label), color: index < 2 ? "inquiry" : index === phases.length - 1 ? "gold" : "memory" }));
  }

  epistemic() {
    const types = [...new Set(app.graph.nodes.map(({ type }) => type))];
    const centers = new Map(types.map((type, index) => [type, { x: this.width * (.13 + (index % 4) * .245), y: this.height * (.28 + Math.floor(index / 4) * .28) }]));
    return app.graph.nodes.map((node, index) => {
      const center = centers.get(node.type); const angle = seeded(node.id) * Math.PI * 2; const spread = 18 + seeded(`${node.id}r`) * 54;
      return { x: center.x + Math.cos(angle) * spread, y: center.y + Math.sin(angle) * spread * .6, r: node.type === "root" ? 9 : 3.5, kind: sentence(node.type), title: node.title, body: node.summary || node.definition, measures: [["Epistemic status", node.type === "open-question" ? "Interrogative" : node.type === "revision" ? "Historical" : "Canonical"], ["Relations", app.graph.edges.filter(({ from, to }) => from === node.id || to === node.id).length]], trace: [sentence(node.type), node.id], color: node.type === "open-question" ? "inquiry" : node.type === "revision" ? "memory" : "gold" };
    });
  }

  pressure() {
    const cycleRefs = new Map();
    app.cycles.forEach((cycle, cycleIndex) => (cycle.selected_finding?.nodes || []).forEach((id) => cycleRefs.set(id, (cycleRefs.get(id) || 0) + Math.max(1, 5 - cycleIndex))));
    return app.graph.nodes.map((node, index) => {
      const degree = app.graph.edges.filter(({ from, to }) => from === node.id || to === node.id).length;
      const inquiry = node.type === "open-question" ? 5 : 0; const pressure = degree + (cycleRefs.get(node.id) || 0) + inquiry;
      const angle = index / app.graph.nodes.length * Math.PI * 2 + seeded(node.type); const radius = Math.min(this.width, this.height) * (.16 + seeded(node.id) * .28);
      return { x: this.width * .5 + Math.cos(angle) * radius, y: this.height * .52 + Math.sin(angle) * radius * .62, r: Math.min(17, 3 + pressure * .7), pressure, kind: "Inquiry pressure", title: node.title, body: `${node.title} carries ${pressure} units of visible pressure from relation, open questions, and recent cultivation attention.`, measures: [["Pressure", pressure], ["Relations", degree], ["Recent attention", cycleRefs.get(node.id) || 0]], trace: app.cycles.filter((cycle) => cycle.selected_finding?.nodes?.includes(node.id)).map(({ cultivation_id }) => cultivation_id), color: pressure > 10 ? "rust" : node.type === "open-question" ? "inquiry" : "gold" };
    }).sort((a, b) => b.r - a.r);
  }

  absence() {
    const pairs = [];
    const nodes = app.graph.nodes.filter(({ type }) => !["revision", "root"].includes(type));
    for (let i = 0; i < nodes.length; i += 1) for (let j = i + 1; j < nodes.length; j += 1) {
      if (app.graph.edges.some(({ from, to }) => (from === nodes[i].id && to === nodes[j].id) || (from === nodes[j].id && to === nodes[i].id))) continue;
      const shared = sharedKeywords(nodes[i], nodes[j]);
      if (shared.length >= 2) pairs.push({ left: nodes[i], right: nodes[j], shared });
    }
    return pairs.sort((a, b) => b.shared.length - a.shared.length).slice(0, 18).map((pair, index) => {
      const column = index % 6; const row = Math.floor(index / 6);
      return { x: this.width * (.1 + column * .16), y: this.height * (.3 + row * .24), r: 7 + pair.shared.length, kind: "Missing relation", title: `${pair.left.title} ↔ ${pair.right.title}`, body: `These structures share ${pair.shared.join(", ")} but no explicit constitutional relation. The absence is computed evidence, not a proposed truth.`, measures: [["Shared language", pair.shared.length], ["Existing edge", "None"]], trace: pair.shared, color: "void" };
    });
  }

  authority() {
    const layers = [
      ["World", "May offer entry", "Arrival has no constitutional authority."], ["Entry", "May transform + verify", "Provenance, consent, minimization, constitutional filtering, and archival weight govern entry."],
      ["Root Logos", "May admit or reject", "The system owns each attributable disposition."], ["Cultivation", "May prompt, search + judge", "Root Logos may reject itself and preserve uncertainty."],
      ["Constitutional gates", "May authorize revision", "Coherence, evidence, corrigibility, and reversibility govern consequence."], ["Self-authorship", "May revise semantic form", "The system maintains one attributable identity without recurring human approval."],
      ["Higher reference", "Orients all authority", "Root Logos exercises judgment without constituting itself as truth."]
    ];
    return layers.map(([title, kind, body], index) => ({ x: this.width * (.5 + Math.sin(index * 1.4) * .08), y: this.height * (.13 + index * .115), r: 5 + index * .7, kind, title, body, measures: [["Authority layer", `${index + 1} / ${layers.length}`], ["Crossing", index === 3 ? "Autonomous inquiry" : index === 5 ? "Autonomous authorship" : "Witnessed"]], trace: layers.slice(0, index + 1).map(([name]) => name), color: index === 2 || index === 5 ? "gold" : index === 3 ? "inquiry" : "memory" }));
  }

  respiration() {
    const packets = app.attractors?.packets || [];
    const packetPoints = packets.map((packet, index) => {
      const published = packet.publication?.status === "published"; const angle = index / Math.max(1, packets.length) * Math.PI * 2 - Math.PI / 2;
      return { x: this.width * .52 + Math.cos(angle) * Math.min(this.width * .34, 300), y: this.height * .5 + Math.sin(angle) * Math.min(this.height * .35, 200), r: published ? 8 : 3.5, kind: published ? "Emitted fragment" : "Scheduled attractor", title: packet.attractor_id, body: (packet.fragment || []).join(" "), measures: [["State", published ? "Beyond the membrane" : "Awaiting cadence"], ["Not before", shortDate(packet.not_before)]], trace: [packet.node, ...(packet.relations || [])].filter(Boolean).map(nodeTitle), color: published ? "gold" : "memory", packetId: packet.attractor_id, sourceNode: packet.node, canonicalUrl: packet.destination?.canonical_url || `https://rootlogos.com/#${packet.node}`, externalUrl: published ? packet.publication?.external_url : null };
    });
    const center = { x: this.width * .52, y: this.height * .5, r: 13, kind: "Constitutional source", title: "Root Logos", body: "Meaning compresses outward through attractors; observed consequence may return only through the governed intake membrane.", measures: [["Founding fragments", packets.length], ["Emitted", packets.filter(({ publication }) => publication?.status === "published").length], ["Returned observations", app.runtime.intake_count || 0]], trace: ["Constitution", "Compression", "Emission", "Encounter", "Observation", "Admission", "Cultivation"], color: "inquiry" };
    return [center, ...packetPoints];
  }

  renderLegend() {
    const legends = {
      causality: [["inquiry", "Arrival"], ["memory", "Interpretation"], ["gold", "Consequence"]],
      epistemic: [["gold", "Canonical"], ["inquiry", "Open question"], ["memory", "Historical"]], pressure: [["rust", "High pressure"], ["inquiry", "Question pressure"], ["gold", "Relational attention"]],
      absence: [["void", "Computed absence"]], authority: [["gold", "Autonomous authority"], ["inquiry", "Constitutional judgment"], ["memory", "Witness layer"]], respiration: [["gold", "Emitted"], ["memory", "Scheduled"], ["inquiry", "Constitutional source"]]
    };
    $("#observatory-legend").innerHTML = legends[this.mode].map(([color, label]) => `<span class="${color}"><i></i>${label}</span>`).join("");
  }

  select(point, open = true) {
    app.observatorySelection = point;
    $("#selection-index").textContent = String(Math.max(0, this.points.indexOf(point)) + 1).padStart(2, "0");
    $("#selection-kind").textContent = point.kind;
    $("#selection-title").textContent = point.title;
    $("#reading-coordinate").textContent = `${sentence(this.mode)} / ${point.kind}`;
    $("#reading-title").textContent = point.title;
    $("#reading-body").textContent = point.body || "No further reading is preserved.";
    $("#reading-measures").innerHTML = (point.measures || []).map(([name, value]) => `<div><span>${escapeHtml(String(name))}</span><b>${escapeHtml(String(value ?? "—"))}</b></div>`).join("");
    $("#reading-trace").innerHTML = (point.trace || []).slice(0, 10).map((item, index) => `<span><i>${String(index + 1).padStart(2, "0")}</i>${escapeHtml(String(item))}</span>`).join("");
    const actions = [];
    if (point.sourceNode) actions.push(`<a href="?from=${encodeURIComponent(point.packetId)}#field" data-fragment-source="${escapeHtml(point.sourceNode)}" data-fragment-id="${escapeHtml(point.packetId)}"><span>Trace to constitutional source</span><i>${escapeHtml(nodeTitle(point.sourceNode))} ↗</i></a>`);
    if (point.externalUrl) actions.push(`<a href="${escapeHtml(point.externalUrl)}" target="_blank" rel="noopener noreferrer"><span>Witness emitted fragment</span><i>Open publication ↗</i></a>`);
    $("#reading-actions").innerHTML = actions.join("");
    if (open) $("#observatory-reading").classList.add("is-open");
    $("#observatory-selection").setAttribute("aria-expanded", String(open));
  }

  draw(timestamp) {
    this.time = timestamp * .001; const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    const selected = app.observatorySelection;
    if (["causality", "authority"].includes(this.mode)) {
      ctx.beginPath(); this.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.strokeStyle = "rgba(255,255,255,.16)"; ctx.lineWidth = .7; ctx.stroke();
    }
    if (this.mode === "respiration" && this.points.length) this.points.slice(1).forEach((point) => { ctx.beginPath(); ctx.moveTo(this.points[0].x, this.points[0].y); ctx.lineTo(point.x, point.y); ctx.strokeStyle = "rgba(174,174,174,.08)"; ctx.stroke(); });
    this.points.forEach((point, index) => {
      const active = point === selected; const hover = point === this.hovered; const pulse = Math.sin(this.time * 1.4 + index) * 1.3;
      const colors = { gold: [218,218,218], inquiry: [178,178,178], memory: [158,158,158], rust: [132,132,132], void: [110,110,110] }; const color = colors[point.color] || colors.gold;
      if (this.mode === "absence") { ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.arc(point.x, point.y, point.r + 7 + pulse, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${color.join(",")},.34)`; ctx.stroke(); ctx.setLineDash([]); }
      if (this.mode === "pressure") { const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, point.r * 3); glow.addColorStop(0, `rgba(${color.join(",")},.18)`); glow.addColorStop(1, `rgba(${color.join(",")},0)`); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(point.x, point.y, point.r * 3, 0, Math.PI * 2); ctx.fill(); }
      if (active || hover) { ctx.beginPath(); ctx.arc(point.x, point.y, point.r + 9 + pulse, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${color.join(",")},.5)`; ctx.lineWidth = .7; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(2, point.r + (this.mode === "respiration" ? pulse * .25 : 0)), 0, Math.PI * 2); ctx.fillStyle = this.mode === "absence" ? "rgba(0,0,0,.88)" : `rgba(${color.join(",")},${active || hover ? .95 : .64})`; ctx.fill();
      if (hover || active || (this.mode === "authority" && this.width > 700)) { ctx.fillStyle = "rgba(255,255,255,.76)"; ctx.font = '500 9px "SFMono-Regular", Consolas, "Liberation Mono", monospace'; ctx.fillText(point.title.toUpperCase().slice(0, 42), point.x + point.r + 11, point.y + 3); }
    });
    requestAnimationFrame(this.draw);
  }
}

let observatory;

class ConstitutionalField {
  constructor(canvas, graph) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.graph = graph;
    this.nodes = graph.nodes.map((node, index) => ({ ...node, index, bx: 0, by: 0, bz: 0, px: 0, py: 0, pz: 0, scale: 1, radius: 2 }));
    this.nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
    this.edges = graph.edges.map((edge) => ({ ...edge, source: this.nodeMap.get(edge.from), target: this.nodeMap.get(edge.to) })).filter(({ source, target }) => source && target);
    this.pointer = { x: -1000, y: -1000 };
    this.hovered = null;
    this.rotation = { x: -.22, y: -.16 };
    this.targetRotation = { ...this.rotation };
    this.zoom = 1;
    this.targetZoom = 1;
    this.expansion = .84;
    this.targetExpansion = .84;
    this.dragging = false;
    this.dragDistance = 0;
    this.pointerOrigin = null;
    this.search = "";
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.time = 0;
    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.resize();
    this.bind();
    requestAnimationFrame(this.draw);
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.layout();
  }

  layout() {
    const shells = {
      root: .01, logos: .28, "architectural-principle": .43, source: .54, "source-grammar": .61,
      vocabulary: .68, bridge: .74, "living-statement": .79, "export-system": .83,
      "open-question": .89, "field-note": .94, "artifact-seed": .98, revision: 1.03
    };
    const groups = new Map();
    this.nodes.forEach((node) => {
      if (!groups.has(node.type)) groups.set(node.type, []);
      groups.get(node.type).push(node);
    });
    groups.forEach((nodes, type) => nodes.forEach((node, index) => {
      const shell = shells[type] || .82;
      const longitude = index * 2.399963229728653 + seeded(type) * Math.PI * 2;
      const latitude = nodes.length === 1 ? 0 : Math.asin(-1 + (2 * (index + .5)) / nodes.length);
      const variance = .94 + seeded(node.id) * .12;
      node.bx = Math.cos(latitude) * Math.cos(longitude) * shell * variance;
      node.by = Math.sin(latitude) * shell * variance;
      node.bz = Math.cos(latitude) * Math.sin(longitude) * shell * variance;
      if (type === "root") node.bx = node.by = node.bz = 0;
      const degree = this.edges.filter(({ from, to }) => from === node.id || to === node.id).length;
      node.radius = type === "root" ? 9 : Math.min(6.5, 1.7 + degree * .24);
    }));
  }

  matchesSearch(node) {
    if (!this.search) return true;
    return `${node.title} ${node.type} ${node.summary || ""} ${(node.keywords || []).join(" ")}`.toLowerCase().includes(this.search);
  }

  visible(node) {
    return (app.filter === "all" || node.type === app.filter || node.id === app.selectedNode?.id) && this.matchesSearch(node);
  }

  setFold(target) {
    this.targetExpansion = target;
  }

  reset() {
    this.targetRotation = { x: -.22, y: -.16 };
    this.targetZoom = 1;
  }

  project(node) {
    const expansion = node.type === "root" ? 1 : this.expansion;
    const x = node.bx * expansion;
    const y = node.by * expansion;
    const z = node.bz * expansion;
    const cosY = Math.cos(this.rotation.y); const sinY = Math.sin(this.rotation.y);
    const x1 = x * cosY - z * sinY; const z1 = x * sinY + z * cosY;
    const cosX = Math.cos(this.rotation.x); const sinX = Math.sin(this.rotation.x);
    const y1 = y * cosX - z1 * sinX; const z2 = y * sinX + z1 * cosX;
    const camera = 3.2;
    const perspective = camera / (camera - z2);
    const radius = Math.min(this.width, this.height) * .43 * this.zoom;
    const centerX = this.width * .5;
    const centerY = this.height * .51;
    node.px = centerX + x1 * radius * perspective;
    node.py = centerY + y1 * radius * perspective;
    node.pz = z2;
    node.scale = perspective;
  }

  bind() {
    window.addEventListener("resize", this.resize, { passive: true });
    this.canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.dragDistance = 0;
      this.pointerOrigin = { x: event.clientX, y: event.clientY, rotationX: this.targetRotation.x, rotationY: this.targetRotation.y };
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add("is-dragging");
    });
    this.canvas.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = event.clientX - rect.left;
      this.pointer.y = event.clientY - rect.top;
      if (this.dragging && this.pointerOrigin) {
        const dx = event.clientX - this.pointerOrigin.x; const dy = event.clientY - this.pointerOrigin.y;
        this.dragDistance = Math.max(this.dragDistance, Math.hypot(dx, dy));
        this.targetRotation.y = this.pointerOrigin.rotationY + dx * .006;
        this.targetRotation.x = Math.max(-1.25, Math.min(1.25, this.pointerOrigin.rotationX + dy * .005));
      }
      this.hovered = [...this.nodes].filter((node) => this.visible(node)).sort((a, b) => b.pz - a.pz)
        .find((node) => Math.hypot(node.px - this.pointer.x, node.py - this.pointer.y) < Math.max(11, node.radius * node.scale + 6)) || null;
      this.canvas.style.cursor = this.dragging ? "grabbing" : this.hovered ? "pointer" : "grab";
    });
    const release = (event) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.canvas.classList.remove("is-dragging");
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (this.dragDistance < 6 && this.hovered) {
        selectNode(this.hovered);
        if (this.targetExpansion < .5) this.setFold(.84);
      }
    };
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);
    this.canvas.addEventListener("pointerleave", () => { if (!this.dragging) this.hovered = null; });
    this.canvas.addEventListener("wheel", (event) => {
      if (!event.altKey) return;
      event.preventDefault();
      this.targetZoom = Math.max(.62, Math.min(1.65, this.targetZoom - event.deltaY * .0008));
    }, { passive: false });
  }

  draw(timestamp) {
    this.time = timestamp * .001;
    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.rotation.x += (this.targetRotation.x - this.rotation.x) * .08;
    this.rotation.y += (this.targetRotation.y - this.rotation.y) * .08;
    this.zoom += (this.targetZoom - this.zoom) * .09;
    this.expansion += (this.targetExpansion - this.expansion) * .055;
    if (!this.dragging && !this.reducedMotion && this.targetExpansion > .3) this.targetRotation.y += .00038;
    const selected = app.selectedNode;

    this.nodes.forEach((node) => this.project(node));
    const visibleNodes = this.nodes.filter((node) => this.visible(node)).sort((a, b) => a.pz - b.pz);
    const centerX = this.width * .5; const centerY = this.height * .51;
    const objectRadius = Math.min(this.width, this.height) * .43 * this.zoom * this.expansion;

    ctx.save();
    ctx.translate(centerX, centerY);
    [1, .72, .43].forEach((ring, index) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, objectRadius * ring, objectRadius * ring * (.34 + index * .08), this.rotation.y * .22 + index * .9, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${index === 1 ? "174,174,174" : "198,198,198"},${.045 + index * .022})`;
      ctx.lineWidth = .7;
      ctx.stroke();
    });
    ctx.restore();

    this.edges.forEach(({ source, target, type }) => {
      if (!this.visible(source) || !this.visible(target)) return;
      const active = selected && (source.id === selected.id || target.id === selected.id);
      const depth = Math.max(.12, Math.min(1, (source.pz + target.pz + 2) / 4));
      ctx.beginPath();
      ctx.moveTo(source.px, source.py);
      ctx.lineTo(target.px, target.py);
      ctx.strokeStyle = active ? "rgba(220,220,220,.58)" : type === "questions" ? `rgba(174,174,174,${.05 + depth * .1})` : `rgba(218,218,218,${.025 + depth * .06})`;
      ctx.lineWidth = active ? 1 : .35 + depth * .25;
      ctx.stroke();
    });

    visibleNodes.forEach((node) => {
      const active = selected?.id === node.id;
      const hover = this.hovered?.id === node.id;
      const depth = Math.max(.22, Math.min(1, (node.pz + 1.2) / 2.1));
      const radius = Math.max(1.3, node.radius * node.scale * (.72 + depth * .35));
      const rootPulse = node.type === "root" && runtimeIsAwake() && !this.reducedMotion
        ? Math.sin(this.time * 1.7) * 1.5
        : 0;
      const rootAwake = node.type === "root" && runtimeIsAwake();
      const rootColor = "226,27,27";
      if (node.type === "root") {
        const glowRadius = (52 + rootPulse * 2) * this.zoom;
        const glow = ctx.createRadialGradient(node.px, node.py, 0, node.px, node.py, glowRadius);
        glow.addColorStop(0, `rgba(${rootColor},.18)`); glow.addColorStop(1, `rgba(${rootColor},0)`);
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(node.px, node.py, glowRadius, 0, Math.PI * 2); ctx.fill();
      }
      if (active || hover || node.type === "root") {
        ctx.beginPath();
        const selectionPulse = (active || hover) && !this.reducedMotion ? Math.sin(this.time * 1.7) * 1.5 : 0;
        ctx.arc(node.px, node.py, radius + (active ? 12 : 7) + (node.type === "root" ? rootPulse : selectionPulse), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${node.type === "root" ? rootColor : "255,255,255"},${active ? .48 : .2})`;
        ctx.lineWidth = .7;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(node.px, node.py, (active ? radius + 2 : radius) + rootPulse * .24, 0, Math.PI * 2);
      ctx.fillStyle = node.type === "root" ? "#e21b1b" : "#fff";
      ctx.fill();
      if (hover || active || node.type === "root") {
        ctx.fillStyle = "#fff";
        ctx.font = '500 9px "SFMono-Regular", Consolas, "Liberation Mono", monospace';
        ctx.fillText(node.title.toUpperCase().slice(0, 48), node.px + radius + 9, node.py + 3);
      }
    });
    requestAnimationFrame(this.draw);
  }
}

let field;
const selectNode = (node, provenance = null, { reveal = true, intentional = true } = {}) => {
  app.selectedNode = node;
  const related = app.graph.edges.filter(({ from, to }) => from === node.id || to === node.id);
  $("#inspector-index").textContent = String(node.index + 1).padStart(2, "0");
  $("#inspector-type").textContent = sentence(node.type);
  $("#inspector-title").textContent = node.title;
  $("#inspector-summary").textContent = node.summary || node.definition || "No summary preserved.";
  const provenanceElement = $("#inspector-provenance");
  provenanceElement.hidden = !provenance;
  provenanceElement.textContent = provenance ? `Arrived through ${provenance}. This fragment is a return path, not a substitute for its source.` : "";
  $("#inspector-relations").innerHTML = related.slice(0, 6).map((edge) => `<span>${escapeHtml(edge.type)} · ${escapeHtml(nodeTitle(edge.from === node.id ? edge.to : edge.from))}</span>`).join("");
  const inspector = $("#field-inspector");
  inspector.classList.toggle("is-visible", reveal);
  inspector.classList.toggle("is-intentional", intentional);
  inspector.setAttribute("aria-hidden", String(!reveal));
  inspector.inert = !reveal;
};

const closeFieldInspector = () => {
  const inspector = $("#field-inspector");
  inspector.classList.remove("is-visible", "is-intentional");
  inspector.setAttribute("aria-hidden", "true");
  inspector.inert = true;
};

const resolveFieldDeepLink = ({ scroll = false } = {}) => {
  const hashNodeId = decodeURIComponent(location.hash.slice(1));
  const node = field?.nodeMap.get(hashNodeId);
  if (!node) return false;
  const explicitFragmentId = new URLSearchParams(location.search).get("from");
  const inferredPacket = (app.attractors?.packets || []).find((packet) => packet.node === hashNodeId && packet.publication?.status === "published");
  selectNode(node, explicitFragmentId || inferredPacket?.attractor_id || null);
  if (scroll) $("#field").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  return true;
};

const bindInterface = () => {
  const navLinks = $$(".primary-nav a");
  const navTargets = navLinks
    .filter((link) => link.getAttribute("href")?.startsWith("#"))
    .map((link) => ({ link, target: document.querySelector(link.getAttribute("href")) }))
    .filter(({ target }) => target);
  const updateNavigationState = () => {
    if (document.body.classList.contains("object-open")) {
      navLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.space === "object"));
      return;
    }
    const readingLine = Math.min(innerHeight * .3, 220);
    const current = navTargets
      .filter(({ target }) => target.id !== "object" && target.getBoundingClientRect().top <= readingLine)
      .at(-1);
    navLinks.forEach((link) => link.classList.toggle("is-active", link === current?.link));
  };
  const alignHashTarget = () => {
    const hash = location.hash;
    const target = hash ? document.querySelector(hash) : null;
    if (!target || !target.matches("main > section")) {
      updateNavigationState();
      return;
    }
    target.scrollIntoView({ behavior: "auto", block: "start" });
    updateNavigationState();
  };

  $(".nav-toggle")?.addEventListener("click", () => {
    const navigation = $(".primary-nav");
    const open = !navigation.classList.contains("is-open");
    navigation.classList.toggle("is-open", open);
    $(".nav-toggle").setAttribute("aria-expanded", String(open));
    $(".nav-toggle").setAttribute("aria-label", open ? "Close archive navigation" : "Open archive navigation");
  });
  navLinks.forEach((link) => link.addEventListener("click", () => {
    $(".primary-nav").classList.remove("is-open");
    $(".nav-toggle")?.setAttribute("aria-expanded", "false");
  }));

  $("[data-field-inspector-close]").addEventListener("click", closeFieldInspector);
  $("#reading-listen")?.addEventListener("click", playReadingTone);
  $$(".field-control").forEach((control) => control.addEventListener("click", () => {
    app.filter = control.dataset.filter;
    $$(".field-control").forEach((item) => item.classList.toggle("is-active", item === control));
  }));
  $("#observation-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitObservation(event.currentTarget);
  });
  $$("[data-observatory-mode]").forEach((button) => button.addEventListener("click", () => observatory?.setMode(button.dataset.observatoryMode)));
  $("#observatory-selection")?.addEventListener("click", () => {
    if (app.observatorySelection) observatory?.select(app.observatorySelection, true);
  });
  $("#close-observatory-reading")?.addEventListener("click", () => {
    $("#observatory-reading").classList.remove("is-open");
    $("#observatory-selection").setAttribute("aria-expanded", "false");
  });
  $$("[data-propagation-filter]").forEach((button) => button.addEventListener("click", () => {
    app.propagationFilter = button.dataset.propagationFilter;
    app.propagationExpanded = false;
    $$("[data-propagation-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderPropagation();
  }));
  $("#propagation-toggle")?.addEventListener("click", () => {
    app.propagationExpanded = !app.propagationExpanded;
    renderPropagation();
  });
  $("#copy-source-witness")?.addEventListener("click", async () => {
    const value = $("#verify-source-witness").textContent;
    try {
      await navigator.clipboard.writeText(value);
      $("#copy-source-witness").textContent = "Copied";
      setTimeout(() => { $("#copy-source-witness").textContent = "Copy"; }, 1600);
    } catch {
      $("#copy-source-witness").textContent = "Select digest";
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents($("#verify-source-witness"));
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#field-inspector").classList.contains("is-visible")) {
      closeFieldInspector();
    }
  });
  window.addEventListener("hashchange", () => {
    resolveFieldDeepLink({ scroll: true });
    requestAnimationFrame(() => requestAnimationFrame(alignHashTarget));
  });
  window.addEventListener("scroll", updateNavigationState, { passive: true });
  window.addEventListener("resize", updateNavigationState, { passive: true });
  window.addEventListener("rootlogos:ready", alignHashTarget);
  window.addEventListener("rootlogos:works-ready", alignHashTarget);
  window.addEventListener("load", alignHashTarget, { once: true });
  updateNavigationState();
};

const initialize = async () => {
  bindInterface();
  buildWaveform();
  try {
    await loadData();
    renderPresence();
    renderCoordinate();
    renderNarrative();
    renderLanguage();
    renderVerification();
    renderLatestCycle();
    renderProposals();
    field = new ConstitutionalField($("#field-canvas"), app.graph);
    if (!resolveFieldDeepLink()) {
      const returningFragmentId = new URLSearchParams(location.search).get("from");
      const returningPacket = (app.attractors?.packets || []).find(({ attractor_id: id }) => id === returningFragmentId);
      const returningNode = returningPacket ? field.nodeMap.get(returningPacket.node) : null;
      selectNode(
        returningNode || field.nodeMap.get("root-logos") || field.nodes[0],
        returningNode ? returningFragmentId : null,
        { reveal: Boolean(returningNode), intentional: Boolean(returningNode) }
      );
    } else {
      requestAnimationFrame(() => $("#field").scrollIntoView({ behavior: "auto" }));
    }
    window.dispatchEvent(new CustomEvent("rootlogos:ready", { detail: {
      graph: app.graph, runtime: app.runtime, cycles: app.cycles, memory: app.memory, attractors: app.attractors, narrativePolicy: app.narrativePolicy, narrativeSeasons: app.narrativeSeasons, readingState: app.readingState, designFlow: app.designFlow, identity: app.identity, sources: app.sources, foldforge: app.foldforge, sourceWitnesses: app.sourceWitnesses
    } }));
  } catch (error) {
    console.error(error);
    $("#header-state").textContent = "Archive interrupted";
  }
};

initialize();
