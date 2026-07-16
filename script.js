const RUNTIME = "https://runtime.rootlogos.com";

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[character]);
const sentence = (value = "") => String(value).replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  selectedObservation: null,
  filter: "all"
};

const fetchJson = async (url) => {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
};

const loadData = async () => {
  const [graphResult, runtimeResult, cyclesResult, memoryResult, localStateResult] = await Promise.allSettled([
    fetchJson("content/constitutional-graph.json"),
    fetchJson(`${RUNTIME}/v1/status`),
    fetchJson(`${RUNTIME}/v1/cycles`),
    fetchJson("cultivation/memory.json"),
    fetchJson("cultivation/state.json")
  ]);

  if (graphResult.status !== "fulfilled") throw graphResult.reason;
  app.graph = graphResult.value;
  app.memory = memoryResult.status === "fulfilled" ? memoryResult.value : null;
  app.cycles = cyclesResult.status === "fulfilled" ? cyclesResult.value.cycles : [];

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
    const ids = app.runtime.cultivation.history.map(({ cultivation_id }) => cultivation_id).reverse();
    const loaded = await Promise.allSettled(ids.map((id) => fetchJson(`cultivation/cycles/${id}.json`)));
    app.cycles = loaded.filter(({ status }) => status === "fulfilled").map(({ value }) => value);
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
  $("#state-revision").textContent = `Revision ${app.runtime.policy.constitutional_revision || app.graph.meta.revision}`;
  $("#state-cycles").textContent = `${app.runtime.cultivation.history?.length || app.cycles.length} cycles`;
  $("#state-memory").textContent = `${app.runtime.hypothesis_count || 0} hypotheses`;
  $("#footer-revision").textContent = String(app.runtime.policy.constitutional_revision || app.graph.meta.revision).replace(/^v/, "");

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
const selectNode = (node) => {
  app.selectedNode = node;
  const related = app.graph.edges.filter(({ from, to }) => from === node.id || to === node.id);
  $("#inspector-index").textContent = String(node.index + 1).padStart(2, "0");
  $("#inspector-type").textContent = sentence(node.type);
  $("#inspector-title").textContent = node.title;
  $("#inspector-summary").textContent = node.summary || node.definition || "No summary preserved.";
  $("#inspector-relations").innerHTML = related.slice(0, 6).map((edge) => `<span>${escapeHtml(edge.type)} · ${escapeHtml(nodeTitle(edge.from === node.id ? edge.to : edge.from))}</span>`).join("");
  $("#field-inspector").classList.add("is-visible");
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
    field = new ConstitutionalField($("#field-canvas"), app.graph);
    selectNode(field.nodeMap.get("root-logos") || field.nodes[0]);
  } catch (error) {
    console.error(error);
    $("#header-state").textContent = "Archive interrupted";
    $("#field-state-label").textContent = "Field unavailable";
    $("#field-state-declaration").textContent = "The constitutional data could not be resolved. The archive remains intact.";
  }
};

initialize();
