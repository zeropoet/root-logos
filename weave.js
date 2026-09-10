const byId = (id) => document.getElementById(id);
const getJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(url + " returned " + response.status);
  return response.json();
};
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[character]);
const lineage = {
  52: "Listening after Alan Turing for the relation between procedure and boundary.",
  53: "Listening after Kurt Gödel for the relation between coherence and incompleteness.",
  54: "Listening after Alfred North Whitehead for the relation between identity, event, and becoming.",
  55: "Listening after Christopher Alexander and collaborators for the relation between recurrent structure and inhabitation."
};
const readingBranches = { 52: "RL-READING-0002", 53: "RL-READING-0003", 54: "RL-READING-0004", 55: "RL-READING-0005" };
let readingState;
let readingDocuments = {};
let audioContext;
let activeTone;

const setToneButtons = (branchId = "") => {
  document.querySelectorAll("[data-tone-branch]").forEach((button) => {
    const active = button.dataset.toneBranch === branchId;
    button.classList.toggle("is-playing", active);
    button.setAttribute("aria-pressed", String(active));
    button.textContent = active ? "Stop voice" : (button.id === "reading-voice" ? "Hear this writing’s voice" : "Hear voice");
  });
  const status = byId("reading-voice-state");
  if (status) status.textContent = branchId
    ? "The voice is sounding from its canonical Reading score."
    : "The tonal score is derived from this writing’s weighted relational state.";
};

const stopReadingTone = () => {
  if (activeTone) {
    window.clearTimeout(activeTone.timer);
    activeTone.oscillators.forEach((oscillator) => {
      try { oscillator.stop(); } catch {}
    });
    activeTone = undefined;
  }
  setToneButtons();
};

const playReadingTone = async (branchId) => {
  if (activeTone?.branchId === branchId) return stopReadingTone();
  stopReadingTone();
  const branch = readingState?.branches.find((candidate) => candidate.branch_id === branchId);
  const score = branch?.experiments?.tonal;
  if (!score) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  await audioContext.resume();
  const now = audioContext.currentTime + 0.04;
  const master = audioContext.createGain();
  const compressor = audioContext.createDynamicsCompressor();
  master.gain.setValueAtTime(0.72, now);
  master.connect(compressor).connect(audioContext.destination);
  const oscillators = score.events.map((event, index) => {
    const oscillator = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    const envelope = audioContext.createGain();
    const start = now + event.at;
    const end = start + event.duration;
    oscillator.type = ["sine", "triangle", "sine"][index % 3];
    oscillator.frequency.setValueAtTime(score.root_hz * event.ratio * 2, start);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(720 + index * 110, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, event.amplitude), start + Math.min(0.18, event.duration * 0.22));
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(filter).connect(envelope).connect(master);
    oscillator.start(start);
    oscillator.stop(end + 0.03);
    return oscillator;
  });
  const timer = window.setTimeout(() => {
    if (activeTone?.branchId === branchId) {
      activeTone = undefined;
      setToneButtons();
    }
  }, (score.duration_seconds + 0.1) * 1000);
  activeTone = { branchId, oscillators, timer };
  setToneButtons(branchId);
};

const bindToneButton = (button) => button.addEventListener("click", () => playReadingTone(button.dataset.toneBranch));

const parseReadings = (markdown) => {
  const readings = {};
  markdown.split(/\n## (?=\d{2} — )/).slice(1).forEach((block) => {
    const lines = block.trim().split("\n");
    const match = lines.shift().match(/^(\d{2}) — (.+)$/);
    if (!match) return;
    readings[match[1]] = {
      number: match[1],
      title: match[2],
      paragraphs: lines.join("\n").split(/\n\s*\n/).map((part) => part.trim()).filter((part) => part && !part.startsWith("---"))
    };
  });
  return readings;
};

const renderReading = (reading) => {
  if (!reading) return;
  byId("reading-number").textContent = "Work " + reading.number;
  byId("reading-title").textContent = reading.title;
  byId("reading-lineage").textContent = lineage[reading.number];
  const voiceButton = byId("reading-voice");
  voiceButton.dataset.toneBranch = readingBranches[reading.number];
  if (activeTone?.branchId !== voiceButton.dataset.toneBranch) setToneButtons(activeTone?.branchId);
  byId("reading-prose").innerHTML = reading.paragraphs.map((paragraph) => {
    return "<p>" + escapeHtml(paragraph).replace(/\*([^*]+)\*/g, "<em>$1</em>") + "</p>";
  }).join("");
  document.querySelectorAll("[data-reading]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.reading === reading.number);
  });
};

const setWritingView = (view) => {
  const showGrid = view === "grid";
  byId("writing-reading-view").hidden = showGrid;
  byId("writing-grid-view").hidden = !showGrid;
  document.querySelectorAll("[data-writing-view]").forEach((button) => {
    const active = button.dataset.writingView === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
};

const renderWritingGrid = (registry) => {
  const grid = byId("writing-grid-view");
  grid.innerHTML = registry.works.map((work) => `
    <article class="writing-grid-card">
      <button type="button" data-grid-reading="${escapeHtml(work.work_number)}" aria-label="Read work ${escapeHtml(work.work_number)}, ${escapeHtml(work.title)}">
        <span class="writing-grid-frame"><img src="${escapeHtml(work.first_frame)}" alt="Root Logos work ${escapeHtml(work.work_number)} first-frame point cloud"></span>
        <span class="writing-grid-meta"><i>${String(work.work_number).padStart(2, "0")}</i><b>${escapeHtml(work.title)}</b></span>
        <span class="writing-grid-state">${escapeHtml(work.mint_status === "unminted" ? "Unminted receipt" : work.mint_status)} · ${escapeHtml(work.point_count)} points</span>
      </button>
      <div class="writing-grid-links"><a href="${escapeHtml(work.viewer)}">Living object ↗</a><a href="${escapeHtml(work.receipt)}">Receipt ↗</a></div>
    </article>`).join("");
  grid.querySelectorAll("[data-grid-reading]").forEach((button) => {
    button.addEventListener("click", () => {
      renderReading(readingDocuments[button.dataset.gridReading]);
      setWritingView("reading");
      byId("reading-room-title").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
};

const loadReadings = async () => {
  const response = await fetch("reading/sequence-52-55.md", { cache: "no-store" });
  if (!response.ok) throw new Error("The current reading could not be resolved.");
  const readings = parseReadings(await response.text());
  readingDocuments = readings;
  renderReading(readings["52"]);
  document.querySelectorAll("[data-reading]").forEach((button) => {
    button.addEventListener("click", () => renderReading(readings[button.dataset.reading]));
  });
};

const renderQuestions = (state) => {
  byId("question-list").innerHTML = state.branches.slice().reverse().map((branch) => {
    return "<article><span>" + escapeHtml(branch.branch_id) + " / " + escapeHtml(branch.status) +
      "</span><p>" + escapeHtml(branch.question.text) + "</p></article>";
  }).join("");
  byId("branch-count").textContent = String(state.branches.length).padStart(2, "0");
};

const renderFragments = (data) => {
  const published = data.packets.filter((packet) => packet.publication?.status === "published").slice(-8).reverse();
  byId("fragment-list").innerHTML = published.map((packet) => {
    const date = new Date(packet.publication.published_at).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
    const lines = packet.fragment.map((line) => "<p>" + escapeHtml(line) + "</p>").join("");
    return "<article><header><span>" + escapeHtml(packet.attractor_id) + "</span><time>" + escapeHtml(date) +
      "</time></header><blockquote>" + lines + "</blockquote><a href=\"" + escapeHtml(packet.publication.external_url) +
      "\" target=\"_blank\" rel=\"noreferrer\">Witness fragment ↗</a></article>";
  }).join("");
};

const renderThinking = (state) => {
  byId("cycle-count").textContent = String(state.history.length).padStart(3, "0");
  byId("thinking-state").textContent = state.status === "idle" ? "Listening" : state.status.replaceAll("-", " ");
  const latest = state.history.at(-1);
  byId("thinking-detail").textContent = latest
    ? latest.cultivation_id + " concluded " + latest.status.replaceAll("-", " ") + ". The record remains available for return."
    : "No cultivation cycle has yet been recorded.";
};

const init = async () => {
  const results = await Promise.all([
    getJson("reading/state.json"),
    getJson("content/attractor-packets.json"),
    getJson("cultivation/state.json"),
    getJson("writing/objects/index.json")
  ]);
  readingState = results[0];
  renderQuestions(results[0]);
  renderFragments(results[1]);
  renderThinking(results[2]);
  await loadReadings();
  renderWritingGrid(results[3]);
  bindToneButton(byId("reading-voice"));
  document.querySelectorAll("[data-writing-view]").forEach((button) => {
    button.addEventListener("click", () => setWritingView(button.dataset.writingView));
  });
};

init().catch((error) => {
  console.error(error);
  const loading = document.querySelector(".loading");
  if (loading) loading.textContent = "The public record remains present, but could not be gathered into this view.";
});
