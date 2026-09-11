const byId = (id) => document.getElementById(id);
const getJson = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
};
const getText = async (url) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.text();
};
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[character]);
const renderInline = (value) => escapeHtml(value)
  .replace(/\*([^*]+)\*/g, "<em>$1</em>")
  .replace(/`([^`]+)`/g, "<code>$1</code>");

const renderBlock = (block) => {
  if (block.startsWith("## ")) return `<h3>${renderInline(block.slice(3))}</h3>`;
  const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.every((line) => line.startsWith("- "))) {
    return `<ul>${lines.map((line) => `<li>${renderInline(line.slice(2))}</li>`).join("")}</ul>`;
  }
  return `<p>${renderInline(lines.join(" "))}</p>`;
};

const parseWriting = (markdown, workNumber) => {
  const blocks = markdown.split(/\n## (?=\d{2,} — )/).slice(1);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const heading = lines.shift()?.match(/^(\d{2,}) — (.+)$/);
    if (!heading || Number(heading[1]) !== Number(workNumber)) continue;
    return lines.join("\n").split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter((part) => part && part !== "---")
      .map(renderBlock)
      .join("");
  }
  return "<p>The writing remains witnessed, but its readable source could not be resolved here.</p>";
};

const statusLabel = (work, volume) => {
  const receipt = work.mint_status === "unminted" ? "receipt pending" : `${work.mint_status} receipt`;
  return volume ? `${receipt} · volume ${String(volume.ordinal).padStart(2, "0")}` : `${receipt} · current`;
};

const renderStream = async (registry, catalog) => {
  const works = await Promise.all(registry.works.slice().reverse().map(async (work) => {
    const current = await getJson(work.current);
    const [markdown, receipt] = await Promise.all([getText(current.writing), getJson(current.receipt)]);
    const volume = catalog.volumes.find((candidate) => candidate.work_numbers.includes(work.work_number));
    return { work, volume, receipt, prose: parseWriting(markdown, work.work_number) };
  }));

  byId("writing-stream").innerHTML = works.map(({ work, volume, receipt, prose }, index) => `
    <article class="writing-entry${index === 0 ? " is-current" : ""}" data-work="${work.work_number}">
      <button class="writing-command" type="button" aria-expanded="false" aria-controls="writing-${work.work_number}">
        <span class="prompt" aria-hidden="true">›</span>
        <span class="number">${String(work.work_number).padStart(2, "0")}</span>
        <strong>${escapeHtml(work.title)}</strong>
        <span class="state">${escapeHtml(statusLabel(work, volume))}</span>
        <span class="open-state" aria-hidden="true">+</span>
      </button>
      <div class="writing-body" id="writing-${work.work_number}" hidden>
        <p class="question">${escapeHtml(work.question)}</p>
        <div class="prose">${prose}</div>
        <footer>
          <span>${work.point_count} witnessed points</span>
          ${receipt.mint?.status === "minted" ? `<a href="${escapeHtml(receipt.mint.explorer)}" target="_blank" rel="noreferrer">Receipt ${String(receipt.mint.token_id).padStart(2, "0")} <span aria-hidden="true">↗</span></a>` : ""}
        </footer>
      </div>
    </article>`).join("");

  document.querySelectorAll(".writing-command").forEach((button) => {
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      const body = byId(button.getAttribute("aria-controls"));
      button.setAttribute("aria-expanded", String(!expanded));
      body.hidden = expanded;
      button.querySelector(".open-state").textContent = expanded ? "+" : "−";
    });
  });
  const requested = new URLSearchParams(location.search).get("work");
  const requestedButton = requested && document.querySelector(`[data-work="${CSS.escape(requested)}"] .writing-command`);
  if (requestedButton) {
    requestedButton.click();
    requestedButton.scrollIntoView({ block: "start" });
  }
  byId("stream-state").textContent = `${registry.works.length} writings / ${catalog.volumes.length} volume${catalog.volumes.length === 1 ? "" : "s"} / live`;
};

const init = async () => {
  const [registry, catalog] = await Promise.all([
    getJson("writing/objects/index.json"),
    getJson("books/catalog.json")
  ]);
  await renderStream(registry, catalog);
};

init().catch((error) => {
  console.error(error);
  byId("stream-state").textContent = "public record available / stream unresolved";
  byId("writing-stream").innerHTML = '<p class="loading"><span aria-hidden="true">!</span> the current stream could not be gathered into this view</p>';
});
