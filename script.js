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
  adminToken: null,
  observations: [],
  attractors: null,
  selectedObservation: null,
  filter: "all",
  observatoryMode: "lineage",
  observatorySelection: null
};

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
};

const loadData = async () => {
  const [graphResult, runtimeResult, cyclesResult, memoryResult, localStateResult, attractorResult] = await Promise.allSettled([
    fetchJson("content/constitutional-graph.json"),
    fetchJson(`${RUNTIME}/v1/status`),
    fetchJson(`${RUNTIME}/v1/cycles`),
    fetchJson("cultivation/memory.json"),
    fetchJson("cultivation/state.json"),
    fetchJson("content/attractor-packets.json")
  ]);

  if (graphResult.status !== "fulfilled") throw graphResult.reason;
  app.graph = graphResult.value;
  app.memory = memoryResult.status === "fulfilled" ? memoryResult.value : null;
  app.attractors = attractorResult.status === "fulfilled" ? attractorResult.value : { packets: [] };
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
    const ids = app.runtime.cultivation.history.map(({ cultivation_id }) => canonicalCultivationId(cultivation_id)).reverse();
    const loaded = await Promise.allSettled(ids.map((id) => fetchJson(`cultivation/cycles/${id}.json`)));
    app.cycles = loaded.filter(({ status }) => status === "fulfilled").map(({ value }) => canonicalCycle(value));
  }
  app.latest = app.cycles[0] || null;
};

const renderPresence = () => {
  const service = app.runtime.service;
  const status = service.status || "unknown";
  const header = $(".system-presence");
  header.dataset.state = status;
  $("#header-state").textContent = sentence(status === "archive" ? "Archive mode" : status);
  $("#header-detail").textContent = app.runtime.archival_fallback ? "Runtime / archival witness" : "Runtime / live contact";

  const sleeping = status === "sleeping";
  const running = status === "running";
  $("#field-state-label").textContent = sleeping ? "Chamber sleeping" : running ? "Cultivation active" : sentence(status);
  $("#field-state-declaration").textContent = sleeping
    ? "No unresolved wake condition remains."
    : running
      ? "Root Logos is presently interrogating its own structure."
      : app.runtime.archival_fallback
        ? "The constitutional archive is present. Live runtime contact is unavailable."
        : service.last_error || "The chamber is resolving its current condition.";
  $("#state-revision").textContent = `Revision ${app.graph.meta.revision}`;
  $("#state-cycles").textContent = `${app.runtime.cultivation.history?.length || app.cycles.length} cycles`;
  $("#state-memory").textContent = `${app.runtime.hypothesis_count || 0} hypotheses`;
  $("#footer-revision").textContent = String(app.graph.meta.revision).replace(/^v/, "");

  $("#chamber-condition").textContent = running ? "Awake" : app.runtime.dormancy?.active ? "Dormant" : "At rest";
  $("#chamber-condition-copy").textContent = running
    ? "A serialized inquiry is moving through the chamber."
    : app.runtime.dormancy?.active
      ? app.runtime.dormancy.reason || "Inquiry methods have earned a period of dormancy."
      : "The worker is listening. No policy-authorized wake remains.";
  $("#last-wake").textContent = shortDate(service.last_wake_at);
  $("#novelty-score").textContent = app.runtime.novelty?.last_score == null ? "Unscored" : `${app.runtime.novelty.last_score} / 4`;
  $("#dormancy-state").textContent = app.runtime.dormancy?.active ? "Active" : "Open";
  $("#wake-queue").textContent = String(service.queued_triggers?.length || 0).padStart(2, "0");
  $("#phase-wake").textContent = app.latest?.events?.[0]?.type ? sentence(app.latest.events[0].type) : "Source revision";
  $("#phase-resolution").textContent = running ? "Cultivating" : "Sleep";
  $("#phase-resolution-detail").textContent = running ? "Serialized inquiry" : "No wake condition";
  $("#intake-count").textContent = String(app.runtime.intake_count || 0).padStart(2, "0");
  $("#memory-count-large").textContent = String(app.runtime.hypothesis_count || Object.keys(app.memory?.hypotheses || {}).length).padStart(2, "0");
};

const submitObservation = async (form) => {
  const button = $("button[type='submit']", form);
  const status = $("#observation-status");
  const data = new FormData(form);
  const payload = {
    observation: data.get("observation"),
    context: data.get("context"),
    relation: data.get("relation"),
    source_type: data.get("source_type"),
    attribution: data.get("attribution") || "Anonymous",
    consent: data.get("consent") === "on",
    website: data.get("website")
  };
  button.disabled = true;
  status.className = "";
  status.textContent = "The membrane is receiving and signing this observation…";
  try {
    const response = await fetch(`${RUNTIME}/v1/public/intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.details?.join(" · ") || result.error || "The observation could not cross the membrane.");
    status.className = "is-success";
    status.textContent = result.event_id
      ? `Received as ${result.event_id}. It remains unreviewed and has not awakened cultivation.`
      : "Received. It remains outside constitutional memory.";
    form.reset();
    if (result.event_id) {
      app.runtime.intake_count = (app.runtime.intake_count || 0) + 1;
      app.runtime.intake_pending = (app.runtime.intake_pending || 0) + 1;
      $("#intake-count").textContent = String(app.runtime.intake_count).padStart(2, "0");
    }
  } catch (error) {
    status.className = "is-error";
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

const adminRequest = async (path, options = {}) => {
  const response = await fetch(`${RUNTIME}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${app.adminToken}`, "content-type": "application/json", ...(options.headers || {}) }
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || "The Antechamber refused this request."), { status: response.status });
  return result;
};

const loadAntechamber = async () => {
  const result = await adminRequest("/v1/admin/intake");
  app.observations = result.observations || [];
  $("#antechamber-auth").hidden = true;
  $("#antechamber-workspace").hidden = false;
  renderIntakeQueue();
};

const renderIntakeQueue = () => {
  const pending = app.observations.filter(({ status }) => status === "unreviewed" || status === "hold").length;
  $("#pending-count").textContent = String(pending).padStart(2, "0");
  $("#intake-queue").innerHTML = app.observations.map((item) => `<button class="queue-item ${app.selectedObservation?.event_id === item.event_id ? "is-active" : ""}" type="button" data-observation="${escapeHtml(item.event_id)}">
    <span><b>${escapeHtml(item.event_id)}</b><i>${escapeHtml(sentence(item.status))}</i></span>
    <p>${escapeHtml(String(item.payload?.observation || "").slice(0, 165))}${String(item.payload?.observation || "").length > 165 ? "…" : ""}</p>
  </button>`).join("") || `<p class="memory-loading">No observations have arrived.</p>`;
  if (!app.selectedObservation && app.observations[0]) selectObservation(app.observations[0].event_id);
};

const selectObservation = (id) => {
  const item = app.observations.find(({ event_id: eventId }) => eventId === id);
  if (!item) return;
  app.selectedObservation = item;
  $$(".queue-item").forEach((button) => button.classList.toggle("is-active", button.dataset.observation === id));
  const payload = item.payload || {};
  const history = item.classification_history || [];
  $("#intake-review").innerHTML = `
    <header><div><p class="micro-label">${escapeHtml(shortDate(item.received_at))} / ${escapeHtml(payload.source_type || "observation")}</p><h3>${escapeHtml(item.event_id)}</h3></div><span class="intake-status">${escapeHtml(sentence(item.status))}</span></header>
    <p class="observation-body">${escapeHtml(payload.observation || "")}</p>
    <div class="observation-context">
      <div><p class="micro-label">Context</p><p>${escapeHtml(payload.context || "Not supplied")}</p></div>
      <div><p class="micro-label">Possible relation</p><p>${escapeHtml(payload.relation || "Not supplied")}</p></div>
      <div><p class="micro-label">Attribution</p><p>${escapeHtml(payload.attribution || "Anonymous")}</p></div>
      <div><p class="micro-label">Prior classifications</p><p>${history.length ? escapeHtml(history.map(({ status, reviewer }) => `${sentence(status)} — ${reviewer}`).join(" · ")) : "None"}</p></div>
    </div>
    <form class="classification-form" id="classification-form">
      <div class="classification-actions field-wide" aria-label="Classification">
        ${["hold", "rejected", "admissible", "promoted"].map((status) => `<button type="button" data-classification="${status}">${sentence(status)}</button>`).join("")}
      </div>
      <label class="form-field"><span>Reviewer <i>required</i></span><input name="reviewer" required placeholder="Attributable steward name"></label>
      <label class="form-field"><span>Reason <i>required</i></span><textarea name="note" required placeholder="Why has this disposition been earned?"></textarea></label>
      <input type="hidden" name="status">
      <div class="classification-submit field-wide"><button type="submit">Record disposition</button><p role="status">Admissible or promoted observations wake cultivation. Hold and rejection do not.</p></div>
    </form>`;
};

const classifyObservation = async (form) => {
  const data = new FormData(form);
  const status = data.get("status");
  const message = $(".classification-submit p", form);
  if (!status) {
    message.textContent = "Choose a disposition before recording judgment.";
    return;
  }
  const button = $("button[type='submit']", form);
  button.disabled = true;
  message.textContent = "Writing an immutable classification event…";
  try {
    const result = await adminRequest(`/v1/admin/intake/${encodeURIComponent(app.selectedObservation.event_id)}/classify`, {
      method: "POST",
      body: JSON.stringify({ status, reviewer: data.get("reviewer"), note: data.get("note") })
    });
    message.textContent = result.wake_queued ? "Disposition preserved. A serialized cultivation wake has been queued." : "Disposition preserved. The chamber remains asleep.";
    app.selectedObservation = null;
    await loadAntechamber();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

const renderLatestCycle = () => {
  const cycle = app.latest;
  if (!cycle) return;
  const finding = cycle.selected_finding || {};
  const judgment = cycle.autonomous_judgment || {};
  const proposal = cycle.proposal || {};
  $("#cycle-id").textContent = `${cycle.cultivation_id} / ${sentence(cycle.lens?.id || "inquiry")}`;
  $("#cycle-decision").textContent = sentence(cycle.status);
  $("#cycle-decision").classList.toggle("is-rejected", String(cycle.status).includes("rejected"));
  $("#cycle-question").textContent = cycle.lens?.question || cycle.self_prompt || "Inquiry record unavailable.";
  $("#cycle-proposal").textContent = finding.claim || proposal.summary || "No proposal emerged from this cycle.";
  $("#cycle-counterargument").textContent = judgment.counterargument || "No adversarial judgment was required because no proposal crossed the threshold.";
  const checks = judgment.checks || {};
  $("#cycle-gates").innerHTML = Object.entries(checks).slice(0, 6).map(([name, passed]) => `<span class="${passed ? "" : "failed"}">${escapeHtml(sentence(name))}</span>`).join("") || `<span>${escapeHtml(sentence(cycle.status))}</span>`;
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
  if (proposals[0]) selectProposal(proposals[0].cultivation_id);
};

const selectProposal = (id) => {
  const cycle = app.cycles.find((item) => item.cultivation_id === id);
  if (!cycle) return;
  app.selectedProposal = cycle;
  $$(".proposal-card").forEach((card) => card.classList.toggle("is-active", card.dataset.proposal === id));
  const judgment = cycle.autonomous_judgment || {};
  const operations = judgment.operations || cycle.proposal?.operations || [];
  const finding = cycle.selected_finding || {};
  $("#review-title").textContent = `${cycle.cultivation_id} / ${sentence(cycle.lens?.id || "inquiry")}`;
  $("#review-risk").textContent = `${sentence(judgment.risk || "human")} risk`;
  $("#review-claim").textContent = proposalSummary(cycle);
  $("#review-judgment").textContent = judgment.reason || `Disposition: ${sentence(cycle.status)}.`;
  $("#review-reversibility").textContent = operations.length && operations.every(({ operation }) => operation === "add-edge") ? "Additive graph operations; reversible through a witnessed revision." : "Requires human evaluation of semantic reversibility.";
  $("#review-nodes").textContent = (finding.nodes || cycle.proposal?.affected_nodes || []).map(nodeTitle).join(" · ") || "No canonical mutation proposed.";
  $("#review-authority").textContent = sentence(judgment.authority || cycle.application?.authority || "Human review required");
};

const renderDrawer = () => {
  const cycle = app.latest;
  if (!cycle) return;
  $("#drawer-title").textContent = `${cycle.cultivation_id} — ${sentence(cycle.status)}`;
  const finding = cycle.selected_finding || {};
  const evaluation = finding.evaluation || cycle.proposal?.evaluation || {};
  const judgment = cycle.autonomous_judgment || {};
  $("#drawer-content").innerHTML = `
    <section class="drawer-section"><h3>Self-prompt</h3><p>${escapeHtml(cycle.self_prompt || cycle.lens?.question || "—")}</p></section>
    <section class="drawer-section"><h3>Selected finding</h3><p>${escapeHtml(finding.claim || "No finding selected.")}</p></section>
    <section class="drawer-section"><h3>Proposed test</h3><p>${escapeHtml(finding.proposed_test || "No test proposed.")}</p></section>
    <section class="drawer-section"><h3>Evaluation</h3><p>${escapeHtml(String(evaluation.total ?? "—"))} / 24 · ${escapeHtml(Object.entries(evaluation.dimensions || {}).map(([key, value]) => `${sentence(key)} ${value}`).join(" · "))}</p></section>
    <section class="drawer-section"><h3>Adversarial judgment</h3><p>${escapeHtml(judgment.counterargument || "No counterargument recorded.")}</p></section>
    <section class="drawer-section"><h3>Event lineage</h3><ol class="drawer-events">${(cycle.events || []).map((event) => `<li><span>${String(event.sequence).padStart(2, "0")}</span><span>${escapeHtml(sentence(event.type))}</span></li>`).join("")}</ol></section>`;
};

const buildWaveform = () => {
  const wave = $("#silent-waveform");
  wave.innerHTML = Array.from({ length: 46 }, (_, index) => `<i style="--h:${5 + Math.abs(Math.sin(index * .63) * Math.cos(index * .18)) * 32}px"></i>`).join("");
};

const observatoryModes = {
  lineage: ["Temporal constitution", "The Living History", "Move through the preserved cycles to witness the constitution becoming itself."],
  causality: ["Consequence lineage", "The Causal Thread", "Trace an arrival through admission, wake, inquiry, judgment, and structural consequence."],
  epistemic: ["Kinds of knowing", "The Epistemic Field", "See what is canonical, interrogative, provisional, remembered, rejected, and implemented."],
  pressure: ["Attention topology", "Pressure + Attention", "Witness where recent inquiry, structural connectivity, and unresolved questions gather force."],
  absence: ["Computed negative space", "The Negative-Space Map", "Reveal relations the architecture can name as missing without pretending they already exist."],
  authority: ["Permission topology", "The Stewardship Ledger", "See what may arrive, inquire, judge, apply, and publish—and where action must stop."],
  respiration: ["Constitutional exchange", "The Attractor Constellation", "Follow meaning outward through emission and inward through observed consequence."],
};

const sharedKeywords = (left, right) => {
  const a = new Set((left.keywords || []).map((word) => word.toLowerCase()));
  return (right.keywords || []).map((word) => word.toLowerCase()).filter((word) => a.has(word));
};

const renderHealth = () => {
  const nodes = app.graph.nodes;
  const edges = app.graph.edges;
  const degree = new Map(nodes.map(({ id }) => [id, 0]));
  edges.forEach(({ from, to }) => { degree.set(from, (degree.get(from) || 0) + 1); degree.set(to, (degree.get(to) || 0) + 1); });
  const questions = nodes.filter(({ type }) => type === "open-question");
  const isolated = nodes.filter(({ id }) => !degree.get(id)).length;
  const judged = app.cycles.filter(({ autonomous_judgment }) => autonomous_judgment);
  const provenance = app.cycles.filter(({ source_snapshot, events }) => source_snapshot && events?.length).length;
  const measures = [
    ["Relation", Math.min(100, Math.round(edges.length / Math.max(nodes.length, 1) * 34)), `${edges.length} witnessed edges`],
    ["Uncertainty", Math.min(100, 34 + questions.length * 7), `${questions.length} open questions remain`],
    ["Memory", Math.min(100, Object.keys(app.memory?.hypotheses || {}).length * 9), `${Object.keys(app.memory?.hypotheses || {}).length} distinct hypotheses`],
    ["Provenance", app.cycles.length ? Math.round(provenance / app.cycles.length * 100) : 0, `${provenance}/${app.cycles.length} cycles fully traced`],
    ["Corrigibility", judged.length ? Math.round(judged.filter(({ autonomous_judgment }) => autonomous_judgment.checks?.corrigibility).length / judged.length * 100) : 0, `${judged.length} adversarial judgments`],
    ["Integration", Math.max(0, 100 - isolated * 8), `${isolated} isolated structures`]
  ];
  $("#health-profile").innerHTML = measures.map(([name, value, detail]) => `<article style="--health:${value}%"><span>${escapeHtml(name)}</span><i><b></b></i><strong>${value}</strong><small>${escapeHtml(detail)}</small></article>`).join("");
};

class LivingObservatory {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.mode = "lineage";
    this.points = [];
    this.hovered = null;
    this.pointer = { x: -1000, y: -1000 };
    this.time = 0;
    this.timelineIndex = Math.max(0, app.cycles.length - 1);
    this.playTimer = null;
    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.resize();
    this.bind();
    this.setMode("lineage");
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
    $("#observatory-timeline").hidden = mode !== "lineage";
    this.compose();
    this.renderLegend();
    const initial = mode === "lineage" ? this.points[Math.min(this.timelineIndex, this.points.length - 1)] : this.points[0];
    if (initial) this.select(initial, false);
  }

  compose() {
    if (!this.width) return;
    const builders = {
      lineage: () => this.lineage(), causality: () => this.causality(), epistemic: () => this.epistemic(),
      pressure: () => this.pressure(), absence: () => this.absence(), authority: () => this.authority(), respiration: () => this.respiration()
    };
    this.points = builders[this.mode]();
  }

  lineage() {
    const cycles = [...app.cycles].reverse();
    const max = Math.max(1, cycles.length - 1);
    $("#timeline-range").max = String(Math.max(0, cycles.length - 1));
    $("#timeline-range").value = String(Math.min(this.timelineIndex, max));
    $("#timeline-output").textContent = cycles[this.timelineIndex]?.cultivation_id || "Origin";
    return cycles.map((cycle, index) => ({
      x: this.width * (.1 + .8 * index / max), y: this.height * (.58 + Math.sin(index * .9) * .12), r: cycle.status === "implemented" ? 8 : 5,
      kind: cycle.status, title: cycle.cultivation_id, body: cycle.selected_finding?.claim || cycle.self_prompt,
      measures: [["Disposition", sentence(cycle.status)], ["Lens", sentence(cycle.lens?.id)], ["Novelty", `${cycle.novelty?.score ?? "—"} / 4`]],
      trace: (cycle.events || []).map(({ type }) => sentence(type)), color: cycle.status === "implemented" ? "gold" : String(cycle.status).includes("rejected") ? "rust" : "inquiry", data: cycle
    }));
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
      ["World", "May offer observation", "Arrival has no constitutional authority."], ["Membrane", "May preserve + verify", "Provenance, consent, and rate limits govern entry."],
      ["Steward", "May admit or promote", "Human judgment permits inquiry, not truth."], ["Cultivation", "May prompt, search + judge", "The machine may reject itself and preserve uncertainty."],
      ["Low-risk boundary", "May apply reversible relations", "Only policy-authorized additive operations cross autonomously."], ["Human threshold", "Must approve semantic change", "Constitutional language and higher-risk operations remain attributable."],
      ["Published constitution", "Durable shared reference", "No actor becomes a higher reference than the constitution it serves."]
    ];
    return layers.map(([title, kind, body], index) => ({ x: this.width * (.5 + Math.sin(index * 1.4) * .08), y: this.height * (.13 + index * .115), r: 5 + index * .7, kind, title, body, measures: [["Authority layer", `${index + 1} / ${layers.length}`], ["Crossing", index === 3 ? "Bounded autonomy" : index === 5 ? "Human required" : "Witnessed"]], trace: layers.slice(0, index + 1).map(([name]) => name), color: index === 2 || index === 5 ? "gold" : index === 3 ? "inquiry" : "memory" }));
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
      lineage: [["gold", "Implemented"], ["rust", "Rejected"], ["inquiry", "Preserved inquiry"]], causality: [["inquiry", "Arrival"], ["memory", "Interpretation"], ["gold", "Consequence"]],
      epistemic: [["gold", "Canonical"], ["inquiry", "Open question"], ["memory", "Historical"]], pressure: [["rust", "High pressure"], ["inquiry", "Question pressure"], ["gold", "Relational attention"]],
      absence: [["void", "Computed absence"]], authority: [["gold", "Human boundary"], ["inquiry", "Bounded autonomy"], ["memory", "Witness layer"]], respiration: [["gold", "Emitted"], ["memory", "Scheduled"], ["inquiry", "Constitutional source"]]
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
    if (["lineage", "causality", "authority"].includes(this.mode)) {
      ctx.beginPath(); this.points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.strokeStyle = "rgba(225,209,152,.16)"; ctx.lineWidth = .7; ctx.stroke();
    }
    if (this.mode === "respiration" && this.points.length) this.points.slice(1).forEach((point) => { ctx.beginPath(); ctx.moveTo(this.points[0].x, this.points[0].y); ctx.lineTo(point.x, point.y); ctx.strokeStyle = "rgba(147,185,187,.08)"; ctx.stroke(); });
    this.points.forEach((point, index) => {
      const active = point === selected; const hover = point === this.hovered; const pulse = Math.sin(this.time * 1.4 + index) * 1.3;
      const colors = { gold: [225,209,152], inquiry: [147,185,187], memory: [154,140,182], rust: [173,113,89], void: [110,114,105] }; const color = colors[point.color] || colors.gold;
      if (this.mode === "absence") { ctx.setLineDash([3, 6]); ctx.beginPath(); ctx.arc(point.x, point.y, point.r + 7 + pulse, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${color.join(",")},.34)`; ctx.stroke(); ctx.setLineDash([]); }
      if (this.mode === "pressure") { const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, point.r * 3); glow.addColorStop(0, `rgba(${color.join(",")},.18)`); glow.addColorStop(1, `rgba(${color.join(",")},0)`); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(point.x, point.y, point.r * 3, 0, Math.PI * 2); ctx.fill(); }
      if (active || hover) { ctx.beginPath(); ctx.arc(point.x, point.y, point.r + 9 + pulse, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${color.join(",")},.5)`; ctx.lineWidth = .7; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(2, point.r + (this.mode === "respiration" ? pulse * .25 : 0)), 0, Math.PI * 2); ctx.fillStyle = this.mode === "absence" ? "rgba(7,8,6,.88)" : `rgba(${color.join(",")},${active || hover ? .95 : .64})`; ctx.fill();
      if (hover || active || (this.mode === "authority" && this.width > 700)) { ctx.fillStyle = "rgba(233,229,216,.76)"; ctx.font = "500 9px SFMono-Regular, monospace"; ctx.fillText(point.title.toUpperCase().slice(0, 42), point.x + point.r + 11, point.y + 3); }
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
    this.nodes = graph.nodes.map((node, index) => ({ ...node, index, x: 0, y: 0, px: 0, py: 0, radius: 2 }));
    this.nodeMap = new Map(this.nodes.map((node) => [node.id, node]));
    this.edges = graph.edges.map((edge) => ({ ...edge, source: this.nodeMap.get(edge.from), target: this.nodeMap.get(edge.to) })).filter(({ source, target }) => source && target);
    this.pointer = { x: -1000, y: -1000 };
    this.hovered = null;
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
    const centers = {
      root: [.64, .5, .02], logos: [.64, .5, .16], "architectural-principle": [.64, .5, .25],
      vocabulary: [.64, .5, .34], "open-question": [.64, .5, .41], bridge: [.64, .5, .31],
      "living-statement": [.64, .5, .37], "field-note": [.64, .5, .43], "artifact-seed": [.64, .5, .46],
      "export-system": [.64, .5, .39], revision: [.64, .5, .47]
    };
    const groups = new Map();
    this.nodes.forEach((node) => {
      if (!groups.has(node.type)) groups.set(node.type, []);
      groups.get(node.type).push(node);
    });
    groups.forEach((nodes, type) => nodes.forEach((node, index) => {
      const [cx, cy, ring] = centers[type] || [.64, .5, .4];
      const angle = ((index / nodes.length) * Math.PI * 2) + seeded(type) * 2.7 + (seeded(node.id) - .5) * .12;
      const elliptical = ring * Math.min(this.width, this.height * 1.65);
      node.x = cx * this.width + Math.cos(angle) * elliptical;
      node.y = cy * this.height + Math.sin(angle) * elliptical * .55;
      node.px = node.x;
      node.py = node.y;
      const degree = this.edges.filter(({ from, to }) => from === node.id || to === node.id).length;
      node.radius = type === "root" ? 9 : Math.min(6, 1.8 + degree * .22);
    }));
  }

  visible(node) { return app.filter === "all" || node.type === app.filter || node.id === app.selectedNode?.id; }
  bind() {
    window.addEventListener("resize", this.resize, { passive: true });
    this.canvas.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = event.clientX - rect.left;
      this.pointer.y = event.clientY - rect.top;
      this.hovered = this.nodes.filter((node) => this.visible(node)).find((node) => Math.hypot(node.px - this.pointer.x, node.py - this.pointer.y) < Math.max(12, node.radius + 7)) || null;
      this.canvas.style.cursor = this.hovered ? "pointer" : "crosshair";
    });
    this.canvas.addEventListener("pointerleave", () => { this.hovered = null; });
    this.canvas.addEventListener("click", () => { if (this.hovered) selectNode(this.hovered); });
  }

  draw(timestamp) {
    this.time = timestamp * .0001;
    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const selected = app.selectedNode;
    const relatedIds = selected ? new Set(this.edges.filter(({ source, target }) => source.id === selected.id || target.id === selected.id).flatMap(({ source, target }) => [source.id, target.id])) : null;

    this.nodes.forEach((node) => {
      const drift = node.type === "root" ? 0 : 2.2 + seeded(node.id) * 2;
      node.px = node.x + Math.cos(this.time * (1 + seeded(node.id)) + node.index) * drift;
      node.py = node.y + Math.sin(this.time * (1.1 + seeded(`${node.id}y`)) + node.index) * drift;
    });

    this.edges.forEach(({ source, target, type }) => {
      if (!this.visible(source) || !this.visible(target)) return;
      const active = selected && (source.id === selected.id || target.id === selected.id);
      ctx.beginPath();
      ctx.moveTo(source.px, source.py);
      ctx.lineTo(target.px, target.py);
      ctx.strokeStyle = active ? "rgba(225,209,152,.42)" : type === "questions" ? "rgba(147,185,187,.12)" : "rgba(226,220,197,.055)";
      ctx.lineWidth = active ? .9 : .45;
      ctx.stroke();
    });

    this.nodes.forEach((node) => {
      if (!this.visible(node)) return;
      const active = selected?.id === node.id;
      const related = relatedIds?.has(node.id);
      const hover = this.hovered?.id === node.id;
      const alpha = selected && !related && !active ? .22 : 1;
      const color = node.type === "open-question" ? [147,185,187] : node.type === "architectural-principle" ? [203,183,122] : node.type === "root" ? [225,209,152] : [189,185,170];
      if (active || hover || node.type === "root") {
        ctx.beginPath();
        ctx.arc(node.px, node.py, node.radius + (active ? 12 : 7) + Math.sin(this.time * 12) * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${color.join(",")},${active ? .45 : .17})`;
        ctx.lineWidth = .7;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(node.px, node.py, active ? node.radius + 2 : node.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color.join(",")},${alpha * (hover || active ? 1 : .68)})`;
      ctx.fill();
      if (hover || active || node.type === "root") {
        ctx.fillStyle = `rgba(233,229,216,${alpha * .76})`;
        ctx.font = "500 9px SFMono-Regular, monospace";
        ctx.fillText(node.title.toUpperCase(), node.px + 13, node.py + 3);
      }
    });
    requestAnimationFrame(this.draw);
  }
}

let field;
const selectNode = (node, provenance = null) => {
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
  $("#field-inspector").classList.add("is-visible");
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
  $(".nav-toggle").addEventListener("click", (event) => {
    const open = $(".primary-nav").classList.toggle("is-open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  $$(".primary-nav a").forEach((link) => link.addEventListener("click", () => $(".primary-nav").classList.remove("is-open")));
  $$(".field-control").forEach((control) => control.addEventListener("click", () => {
    app.filter = control.dataset.filter;
    $$(".field-control").forEach((item) => item.classList.toggle("is-active", item === control));
  }));
  $$("[data-observatory-mode]").forEach((button) => button.addEventListener("click", () => observatory?.setMode(button.dataset.observatoryMode)));
  $("#observatory-selection").addEventListener("click", () => {
    const reading = $("#observatory-reading");
    const open = reading.classList.toggle("is-open");
    $("#observatory-selection").setAttribute("aria-expanded", String(open));
  });
  $("#close-observatory-reading").addEventListener("click", () => {
    $("#observatory-reading").classList.remove("is-open");
    $("#observatory-selection").setAttribute("aria-expanded", "false");
  });
  $("#timeline-range").addEventListener("input", (event) => {
    if (!observatory) return;
    observatory.timelineIndex = Number(event.target.value);
    observatory.compose();
    const point = observatory.points[observatory.timelineIndex];
    if (point) observatory.select(point, false);
    $("#timeline-output").textContent = point?.title || "Origin";
  });
  $("#timeline-play").addEventListener("click", (event) => {
    if (!observatory) return;
    if (observatory.playTimer) {
      clearInterval(observatory.playTimer); observatory.playTimer = null; event.currentTarget.textContent = "Play"; return;
    }
    event.currentTarget.textContent = "Pause";
    observatory.playTimer = setInterval(() => {
      const range = $("#timeline-range");
      observatory.timelineIndex = (observatory.timelineIndex + 1) % Math.max(1, observatory.points.length);
      range.value = String(observatory.timelineIndex); range.dispatchEvent(new Event("input"));
    }, 1100);
  });
  $("#open-cycle").addEventListener("click", () => {
    renderDrawer();
    $("#cycle-drawer").hidden = false;
    document.body.style.overflow = "hidden";
    $(".drawer-close").focus();
  });
  $$('[data-close-drawer]').forEach((element) => element.addEventListener("click", () => {
    $("#cycle-drawer").hidden = true;
    document.body.style.overflow = "";
  }));
  $("#proposal-stack").addEventListener("click", (event) => {
    const card = event.target.closest("[data-proposal]");
    if (card) selectProposal(card.dataset.proposal);
  });
  $("#observation-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitObservation(event.currentTarget);
  });
  $("#open-antechamber").addEventListener("click", () => {
    $("#antechamber").hidden = false;
    document.body.style.overflow = "hidden";
    $(app.adminToken ? "#antechamber-title" : "#steward-token").focus();
    if (app.adminToken) loadAntechamber().catch(() => { app.adminToken = null; $("#antechamber-auth").hidden = false; });
  });
  $$('[data-close-antechamber]').forEach((element) => element.addEventListener("click", () => {
    $("#antechamber").hidden = true;
    document.body.style.overflow = "";
  }));
  $("#unlock-antechamber").addEventListener("click", async () => {
    const input = $("#steward-token");
    const status = $("#antechamber-auth-status");
    app.adminToken = input.value.trim();
    status.textContent = "Verifying steward authority…";
    try {
      await loadAntechamber();
      input.value = "";
      status.textContent = "";
    } catch (error) {
      app.adminToken = null;
      status.textContent = error.status === 401 ? "The steward credential was not recognized." : error.message;
    }
  });
  $("#steward-token").addEventListener("keydown", (event) => { if (event.key === "Enter") $("#unlock-antechamber").click(); });
  $("#intake-queue").addEventListener("click", (event) => {
    const item = event.target.closest("[data-observation]");
    if (item) selectObservation(item.dataset.observation);
  });
  $("#intake-review").addEventListener("click", (event) => {
    const option = event.target.closest("[data-classification]");
    if (!option) return;
    $$("[data-classification]", $("#intake-review")).forEach((button) => button.classList.toggle("is-selected", button === option));
    $("input[name='status']", $("#classification-form")).value = option.dataset.classification;
  });
  $("#intake-review").addEventListener("submit", (event) => {
    if (event.target.id !== "classification-form") return;
    event.preventDefault();
    classifyObservation(event.target);
  });
  $("#reading-actions").addEventListener("click", (event) => {
    const link = event.target.closest("[data-fragment-source]");
    if (!link) return;
    const node = field?.nodeMap.get(link.dataset.fragmentSource);
    if (!node) return;
    event.preventDefault();
    const fragmentId = link.dataset.fragmentId;
    history.replaceState(null, "", `?from=${encodeURIComponent(fragmentId)}#field`);
    selectNode(node, fragmentId);
    $("#observatory-reading").classList.remove("is-open");
    $("#field").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("#cycle-drawer").hidden) {
      $("#cycle-drawer").hidden = true;
      document.body.style.overflow = "";
    }
    if (event.key === "Escape" && !$("#antechamber").hidden) {
      $("#antechamber").hidden = true;
      document.body.style.overflow = "";
    }
  });
  window.addEventListener("hashchange", () => resolveFieldDeepLink({ scroll: true }));

  const spaces = $$(".space[data-space-name]");
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter(({ isIntersecting }) => isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const id = visible.target.id;
    $$(".primary-nav a").forEach((link) => link.classList.toggle("is-active", link.dataset.space === id));
  }, { threshold: [.24, .52] });
  spaces.forEach((space) => observer.observe(space));
};

const initialize = async () => {
  bindInterface();
  buildWaveform();
  try {
    await loadData();
    renderPresence();
    renderLatestCycle();
    renderMemory();
    renderProposals();
    renderHealth();
    field = new ConstitutionalField($("#field-canvas"), app.graph);
    observatory = new LivingObservatory($("#observatory-canvas"));
    if (!resolveFieldDeepLink()) {
      const returningFragmentId = new URLSearchParams(location.search).get("from");
      const returningPacket = (app.attractors?.packets || []).find(({ attractor_id: id }) => id === returningFragmentId);
      const returningNode = returningPacket ? field.nodeMap.get(returningPacket.node) : null;
      selectNode(returningNode || field.nodeMap.get("root-logos") || field.nodes[0], returningNode ? returningFragmentId : null);
    } else {
      requestAnimationFrame(() => $("#field").scrollIntoView({ behavior: "auto" }));
    }
  } catch (error) {
    console.error(error);
    $("#header-state").textContent = "Archive interrupted";
    $("#field-state-label").textContent = "Field unavailable";
    $("#field-state-declaration").textContent = "The constitutional data could not be resolved. The archive remains intact.";
  }
};

initialize();
