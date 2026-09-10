const byId = (id) => document.getElementById(id);
const fieldDestinations = { ArrowLeft: "https://telos.zeropoet.xyz/", ArrowRight: "https://ovel.zeropoet.xyz/" };
addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.target.closest("a,button,input,textarea,select,[contenteditable]")) return;
  if (!fieldDestinations[event.key]) return;
  event.preventDefault();
  location.assign(fieldDestinations[event.key]);
}, true);
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
  byId("reading-prose").innerHTML = reading.paragraphs.map((paragraph) => {
    return "<p>" + escapeHtml(paragraph).replace(/\*([^*]+)\*/g, "<em>$1</em>") + "</p>";
  }).join("");
  document.querySelectorAll("[data-reading]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.reading === reading.number);
  });
};

const loadReadings = async () => {
  const response = await fetch("reading/sequence-52-55.md", { cache: "no-store" });
  if (!response.ok) throw new Error("The current reading could not be resolved.");
  const readings = parseReadings(await response.text());
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
    getJson("cultivation/state.json")
  ]);
  renderQuestions(results[0]);
  renderFragments(results[1]);
  renderThinking(results[2]);
  await loadReadings();
};

init().catch((error) => {
  console.error(error);
  const loading = document.querySelector(".loading");
  if (loading) loading.textContent = "The public record remains present, but could not be gathered into this view.";
});
