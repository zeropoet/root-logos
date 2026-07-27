(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);

  class LivingWorks {
    constructor(index, corpus = null) {
      this.index = index;
      this.corpus = corpus;
      this.canvas = $("#work-canvas");
      this.context = this.canvas.getContext("2d");
      this.entry = null;
      this.edition = null;
      this.nodes = [];
      this.rotation = 0;
      this.targetRotation = 0;
      this.pointer = null;
      this.audio = null;
      this.master = null;
      this.timer = null;
      this.cursor = 0;
      this.isCorpus = false;
      this.division = "all";
      this.query = "";
      this.bind();
      this.resize();
      this.renderArchive();
      requestAnimationFrame(() => this.draw());
      if (index.works?.length) this.open(index.works[0]);
      else this.renderEmpty();
    }

    bind() {
      window.addEventListener("resize", () => this.resize());
      this.canvas.addEventListener("pointerdown", (event) => {
        this.pointer = { x: event.clientX, rotation: this.targetRotation };
        this.canvas.setPointerCapture(event.pointerId);
      });
      this.canvas.addEventListener("pointermove", (event) => {
        if (!this.pointer) return;
        this.targetRotation = this.pointer.rotation + (event.clientX - this.pointer.x) * .006;
      });
      this.canvas.addEventListener("pointerup", (event) => {
        this.pointer = null;
        this.canvas.releasePointerCapture(event.pointerId);
        this.selectAt(event.offsetX, event.offsetY);
      });
      $("#work-list").addEventListener("click", (event) => {
        const button = event.target.closest("[data-work]");
        const entry = this.index.works.find(({ work_id: id }) => id === button?.dataset.work);
        if (entry) this.open(entry);
      });
      $("#corpus-entry").addEventListener("click", () => this.openCorpus());
      $("#work-search").addEventListener("input", (event) => {
        this.query = event.target.value.trim().toLowerCase();
        this.renderArchive();
      });
      document.querySelector(".work-archive-tools nav").addEventListener("click", (event) => {
        const button = event.target.closest("[data-work-division]");
        if (!button) return;
        this.division = button.dataset.workDivision;
        document.querySelectorAll("[data-work-division]").forEach((item) => item.classList.toggle("is-active", item === button));
        this.renderArchive();
      });
      $("#work-editions").addEventListener("click", (event) => {
        const button = event.target.closest("[data-edition]");
        if (button && this.entry) this.open(this.entry, button.dataset.edition);
      });
      $("#work-listen").addEventListener("click", () => this.audio ? this.stop() : this.start());
      document.addEventListener("visibilitychange", () => { if (document.hidden && this.audio) this.stop(); });
    }

    resize() {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width;
      this.height = rect.height;
      this.canvas.width = Math.round(rect.width * ratio);
      this.canvas.height = Math.round(rect.height * ratio);
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    renderArchive() {
      $("#work-count").textContent = `${String(this.index.works?.length || 0).padStart(2, "0")} work${this.index.works?.length === 1 ? "" : "s"}`;
      if (this.corpus) $("#corpus-entry-detail").textContent = `${this.corpus.canonical_work_count} books / ${this.corpus.measures.passages.toLocaleString()} passages`;
      const visible = (this.index.works || []).filter((work) => {
        const divisionMatch = this.division === "all"
          || work.division === this.division
          || (this.division === "Root Logos" && !work.division);
        const queryMatch = !this.query || `${work.title} ${work.division || "Root Logos"} ${work.translation || ""}`.toLowerCase().includes(this.query);
        return divisionMatch && queryMatch;
      });
      $("#work-list").innerHTML = visible.map((work) => `
        <button type="button" data-work="${escapeHtml(work.work_id)}">
          <span>${work.canonical_order ? String(work.canonical_order).padStart(2, "0") : "RL"}</span>
          <span><b>${escapeHtml(work.title)}</b><small>${escapeHtml(work.kind)} / ${work.editions} edition${work.editions === 1 ? "" : "s"}</small></span>
        </button>`).join("") || "<p class=\"works-loading\">The archive is open. No work has crossed the membrane yet.</p>";
      document.querySelectorAll("#work-list [data-work]").forEach((button) =>
        button.classList.toggle("is-active", button.dataset.work === this.entry?.work_id));
    }

    async open(entry, editionHref = entry.edition) {
      this.stop();
      const response = await fetch(editionHref, { cache: "no-store" });
      if (!response.ok) throw new Error(`Living work ${entry.work_id} could not be opened.`);
      this.entry = entry;
      this.isCorpus = false;
      $("#corpus-entry").classList.remove("is-active");
      this.edition = await response.json();
      this.nodes = this.edition.visual.topology.nodes.map((node, index) => {
        const angle = node.angle ?? (index / Math.max(1, this.edition.visual.topology.nodes.length)) * Math.PI * 2;
        const band = node.band ?? (node.type === "work" ? 0 : node.type === "document" ? .32 : .62 + (index % 3) * .09);
        return { ...node, angle, band, screenX: 0, screenY: 0 };
      });
      $$("#work-list [data-work]").forEach((button) => button.classList.toggle("is-active", button.dataset.work === entry.work_id));
      $("#work-title").textContent = entry.title;
      $("#work-coordinate").textContent = `${entry.kind} / ${entry.translation || entry.author} / current edition`;
      $("#work-statement").textContent = this.edition.reading.statement;
      $("#work-edition").textContent = `Edition ${this.edition.root_logos_revision} / ${this.edition.sound.signature}`;
      $("#work-source").textContent = entry.source_visibility === "private"
        ? `Private witness / ${this.edition.source_hash.slice(0, 12)}`
        : this.edition.source_hash.slice(0, 12);
      $("#work-measures").innerHTML = Object.entries(this.edition.measures).map(([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${Number(value).toLocaleString()}</dd></div>`).join("");
      $("#work-concepts").innerHTML = this.edition.reading.dominant_concepts.map(({ concept, count }) =>
        `<span style="--weight:${clamp(count / this.edition.reading.dominant_concepts[0].count, .25, 1)}">${escapeHtml(concept)}</span>`).join("");
      $("#work-editions").innerHTML = (entry.edition_history || []).map((edition, index) => `
        <button type="button" data-edition="${escapeHtml(edition.href)}" class="${edition.edition_id === this.edition.edition_id ? "is-active" : ""}">
          <span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(edition.root_logos_revision)} · read ${String(index + 1).padStart(2, "0")}
        </button>`).join("");
      $("#work-sound-status").textContent = `${this.edition.sound.tempo} BPM / score ${this.edition.sound.signature} / silent by consent.`;
      $("#work-listen-label").textContent = "Listen to this reading";
      $("#work-inspector-type").textContent = "Work graph";
      $("#work-inspector-title").textContent = "Select a structure";
      $("#work-inspector-body").textContent = "Move through the visual edition to reveal the structures Root Logos found within the work.";
      $("#work-inspector").classList.remove("is-active");
      this.targetRotation = 0;
    }

    openCorpus() {
      if (!this.corpus) return;
      this.stop();
      this.entry = null;
      this.isCorpus = true;
      this.edition = {
        edition_id: `corpus-${this.corpus.sound.signature}`,
        root_logos_revision: "v1.1",
        source_hash: this.corpus.source_witness,
        measures: {
          documents: this.corpus.canonical_work_count,
          sections: this.corpus.measures.passages,
          words: this.corpus.measures.words,
          concepts: this.corpus.nodes.reduce((sum, node) => sum + node.concepts.length, 0),
          relations: this.corpus.measures.cross_work_relations
        },
        visual: this.corpus.visual,
        sound: this.corpus.sound,
        reading: {
          statement: `${this.corpus.title} resolves as ${this.corpus.canonical_work_count} living works, ${this.corpus.measures.passages.toLocaleString()} passage coordinates, and ${this.corpus.measures.cross_work_relations.toLocaleString()} cross-work relations.`,
          dominant_concepts: []
        }
      };
      this.nodes = this.edition.visual.topology.nodes.map((node, index) => {
        const angle = node.angle ?? (index / this.edition.visual.topology.nodes.length) * Math.PI * 2;
        return { ...node, angle, band: node.band ?? 0, screenX: 0, screenY: 0 };
      });
      document.querySelectorAll("#work-list [data-work]").forEach((button) => button.classList.remove("is-active"));
      $("#corpus-entry").classList.add("is-active");
      $("#work-coordinate").textContent = "private corpus witness / whole canonical field";
      $("#work-title").textContent = this.corpus.title;
      $("#work-statement").textContent = this.edition.reading.statement;
      $("#work-edition").textContent = `Corpus reading / ${this.edition.sound.signature}`;
      $("#work-source").textContent = "Private corpus witness";
      $("#work-measures").innerHTML = Object.entries(this.edition.measures).map(([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${Number(value).toLocaleString()}</dd></div>`).join("");
      $("#work-concepts").innerHTML = [
        ["Coherence", "gravity"], ["Living works", "antigravity"], ["Relation", "tensile fabric"]
      ].map(([label, role]) => `<span style="--weight:1">${label} = ${role}</span>`).join("");
      $("#work-editions").innerHTML = "<span class=\"corpus-current\">One aggregate reading / every book retains its own lineage</span>";
      $("#work-sound-status").textContent = `${this.edition.sound.tempo} BPM / corpus score ${this.edition.sound.signature} / silent by consent.`;
      $("#work-listen-label").textContent = "Listen to the whole canon";
      $("#work-inspector-type").textContent = "Governing geometry / equilibrium";
      $("#work-inspector-title").textContent = "Coherence and antigravity";
      $("#work-inspector-body").textContent = `Root Logos compresses toward one corrigible account. Each work presses outward according to its irreducible difference. ${this.corpus.measures.cross_work_relations.toLocaleString()} relations hold the fabric between them without collapse.`;
      $("#work-inspector").classList.add("is-active");
      this.targetRotation = 0;
    }

    renderEmpty() {
      $("#work-title").textContent = "The membrane is open";
      $("#work-statement").textContent = "A complete work may now enter. Its source, visual reading, resonant score, and every later edition will remain navigable here.";
      $("#work-listen").disabled = true;
    }

    selectAt(x, y) {
      const selected = this.nodes.reduce((best, node) => {
        const distance = Math.hypot(x - node.screenX, y - node.screenY);
        return distance < (best?.distance ?? 24) ? { node, distance } : best;
      }, null);
      if (!selected) return;
      const { node } = selected;
      $("#work-inspector-type").textContent = `${node.type} / ${node.coordinate}`;
      $("#work-inspector-title").textContent = node.label;
      const relations = this.edition.visual.topology.edges.filter(({ from, to }) => from === node.id || to === node.id);
      $("#work-inspector-body").textContent = `${relations.length} witnessed relation${relations.length === 1 ? "" : "s"} connect this structure to the current reading. Weight ${node.weight}.`;
      $("#work-inspector").classList.add("is-active");
    }

    draw() {
      const context = this.context;
      context.clearRect(0, 0, this.width, this.height);
      if (this.edition) {
        this.rotation += (this.targetRotation - this.rotation) * .05;
        const centerX = this.width * (this.width < 600 ? .48 : .57);
        const centerY = this.height * .52;
        const radius = Math.min(this.width, this.height) * .37;
        const palette = this.edition.visual.palette;
        if (this.isCorpus) {
          context.save();
          context.translate(centerX, centerY);
          for (let ring = 1; ring <= 4; ring += 1) {
            context.strokeStyle = `rgba(203,183,122,${.11 - ring * .018})`;
            context.lineWidth = ring === 1 ? 1 : .55;
            context.beginPath();
            context.arc(0, 0, radius * (.08 + ring * .055), 0, Math.PI * 2);
            context.stroke();
          }
          context.restore();
        }
        for (const node of this.nodes) {
          const angle = node.angle + this.rotation;
          const perspective = .7 + Math.sin(angle) * .3;
          node.screenX = centerX + Math.cos(angle) * radius * node.band;
          node.screenY = centerY + Math.sin(angle) * radius * node.band * .54;
          node.depth = perspective;
        }
        context.lineWidth = .65;
        for (const edge of this.edition.visual.topology.edges) {
          const from = this.nodes.find(({ id }) => id === edge.from);
          const to = this.nodes.find(({ id }) => id === edge.to);
          if (!from || !to) continue;
          const corpusRelation = this.isCorpus && edge.relation === "shared-derived-language";
          context.strokeStyle = corpusRelation
            ? `rgba(147,185,187,${clamp(.012 + edge.weight * .006, .018, .075)})`
            : `rgba(203,183,122,${this.isCorpus ? .055 : clamp(.025 + edge.weight * .018, .03, .2)})`;
          context.beginPath();
          context.moveTo(from.screenX, from.screenY);
          context.quadraticCurveTo(centerX, centerY, to.screenX, to.screenY);
          context.stroke();
        }
        [...this.nodes].sort((a, b) => a.depth - b.depth).forEach((node, index) => {
          const size = node.type === "work" ? 11 : node.type === "document" ? 5 : clamp(1.5 + Math.sqrt(node.weight), 2, 6);
          context.fillStyle = node.color || palette[index % palette.length];
          context.globalAlpha = clamp(.2 + node.depth * .65, .25, .95);
          context.beginPath();
          context.arc(node.screenX, node.screenY, size * node.depth, 0, Math.PI * 2);
          context.fill();
          const chapterNumber = node.type === "document" ? Number(node.label.match(/\d+/)?.[0]) : null;
          const labelDocument = node.type === "document" && (!chapterNumber || chapterNumber === 1 || chapterNumber % 5 === 0);
          const labelBook = node.type === "book" && (node.canonical_order === 1 || node.canonical_order === 47 || node.canonical_order % 6 === 0);
          const labelConcept = node.type === "concept" && ((this.width >= 600 && node.weight > 3) || (this.width < 600 && node.weight > 12));
          if (node.type === "work" || labelDocument || labelBook || labelConcept) {
            context.globalAlpha = clamp(node.depth - .12, .2, .8);
            context.fillStyle = "#e9e5d8";
            context.font = `${node.type === "work" ? 11 : 8}px ui-monospace, monospace`;
            context.fillText(node.label.toUpperCase(), node.screenX + size + 5, node.screenY + 3);
          }
        });
        context.globalAlpha = 1;
        if (!this.pointer) this.targetRotation += .0007 * this.edition.visual.motion.drift;
      }
      requestAnimationFrame(() => this.draw());
    }

    start() {
      if (!this.edition || !window.AudioContext) return;
      this.audio = new AudioContext();
      this.master = this.audio.createGain();
      this.master.gain.value = .075;
      this.master.connect(this.audio.destination);
      this.cursor = 0;
      $("#work-listen").setAttribute("aria-pressed", "true");
      $("#work-listen").classList.add("is-sounding");
      $("#work-listen-label").textContent = "Close this reading";
      this.schedule();
    }

    schedule() {
      if (!this.audio) return;
      const event = this.edition.sound.events[this.cursor % this.edition.sound.events.length];
      const beat = 60 / this.edition.sound.tempo;
      if (!event.rest) {
        const oscillator = this.audio.createOscillator();
        const gain = this.audio.createGain();
        oscillator.type = event.voice === "ground" ? "sine" : event.voice === "relation" ? "triangle" : "sine";
        oscillator.frequency.value = event.frequency;
        gain.gain.setValueAtTime(0, this.audio.currentTime);
        gain.gain.linearRampToValueAtTime(event.amplitude, this.audio.currentTime + .04);
        gain.gain.exponentialRampToValueAtTime(.0001, this.audio.currentTime + Math.max(.16, beat * event.beats * .88));
        oscillator.connect(gain).connect(this.master);
        oscillator.start();
        oscillator.stop(this.audio.currentTime + beat * event.beats);
      }
      $("#work-sound-status").textContent = event.rest ? "A structural silence holds." : `${event.voice} / ${event.provenance}`;
      this.cursor += 1;
      this.timer = window.setTimeout(() => this.schedule(), beat * event.beats * 1000);
    }

    stop() {
      if (this.timer) clearTimeout(this.timer);
      if (this.audio) this.audio.close().catch(() => {});
      this.timer = null;
      this.audio = null;
      this.master = null;
      $("#work-listen")?.setAttribute("aria-pressed", "false");
      $("#work-listen")?.classList.remove("is-sounding");
      if ($("#work-listen-label")) $("#work-listen-label").textContent = "Listen to this reading";
      if (this.edition) $("#work-sound-status").textContent = `${this.edition.sound.tempo} BPM / score ${this.edition.sound.signature} / silent by consent.`;
    }
  }

  const initialize = async () => {
    try {
      const [indexResponse, corpusResponse] = await Promise.all([
        fetch("works/index.json", { cache: "no-store" }),
        fetch("works/corpora/original-douay-rheims.json", { cache: "no-store" })
      ]);
      if (!indexResponse.ok) throw new Error("The living works index is unavailable.");
      window.rootLogosWorks = new LivingWorks(
        await indexResponse.json(),
        corpusResponse.ok ? await corpusResponse.json() : null
      );
    } catch (error) {
      console.error(error);
      $("#work-title").textContent = "The archive remains closed";
      $("#work-statement").textContent = "Its constitutional contract remains intact, but the current works index could not be resolved.";
    }
  };

  initialize();
})();
