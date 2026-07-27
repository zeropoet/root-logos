(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
  const influenceAxes = [
    { selector: ".organ-receive", words: ["came", "said", "heard", "saw", "voice", "world", "people"] },
    { selector: ".organ-transform", words: ["made", "became", "turned", "formed", "changed", "work", "hand"] },
    { selector: ".organ-judge", words: ["law", "truth", "justice", "right", "evil", "good", "judge"] },
    { selector: ".organ-compose", words: ["words", "song", "memory", "name", "spake", "wrote", "book"] },
    { selector: ".organ-rewrite", words: ["return", "new", "again", "life", "death", "time", "way"] }
  ];
  const BIBLE_COLLECTION = "Original Douay-Rheims Catholic Canon";
  const isBibleBook = ({ collection }) => collection === BIBLE_COLLECTION;

  const influenceScores = (concepts = [], seed = "") => {
    const conceptMap = new Map(concepts.map(({ concept, count }) => [String(concept).toLowerCase(), Number(count) || 0]));
    return influenceAxes.map(({ words }, axis) =>
      words.reduce((sum, word) => sum + (conceptMap.get(word) || 0), 0) + ((seed.length + axis * 3) % 5) * .001
    );
  };

  const renderIdentityInfluence = async (index, corpus) => {
    const canvas = $("#identity-influence-canvas");
    const loop = canvas?.closest(".identity-loop");
    if (!canvas || !loop) return;
    const corpusItems = (corpus?.nodes || []).map((node) => ({
      id: node.id,
      title: node.title,
      concepts: node.concepts,
      color: node.division === "Old Testament" ? "#c8c8c8" : "#a9a9a9"
    }));
    const independent = (index.works || []).filter(({ collection }) =>
      collection !== "Original Douay-Rheims Catholic Canon"
    );
    const independentItems = (await Promise.all(independent.map(async (work) => {
      try {
        const response = await fetch(work.edition, { cache: "no-store" });
        if (!response.ok) return null;
        const edition = await response.json();
        return {
          id: work.work_id,
          title: work.title,
          concepts: edition.reading?.dominant_concepts || [],
          color: work.collection ? "#989898" : "#858585"
        };
      } catch {
        return null;
      }
    }))).filter(Boolean);
    const items = [...corpusItems, ...independentItems].map((item, index) => {
      const scores = influenceScores(item.concepts, item.id);
      return { ...item, axis: scores.indexOf(Math.max(...scores)), order: index };
    });
    influenceAxes.forEach(({ selector }, axis) => {
      const pressure = items.filter((item) => item.axis === axis).length;
      const organ = $(selector);
      if (organ) {
        organ.dataset.pressure = `${pressure} reading${pressure === 1 ? "" : "s"} exert pressure`;
        organ.title = `${pressure} completed readings currently exert their strongest derived pressure here.`;
      }
    });
    const draw = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const loopRect = loop.getBoundingClientRect();
      const center = { x: rect.width / 2, y: rect.height / 2 };
      const orbit = Math.min(rect.width, rect.height) * (rect.width < 600 ? .28 : .43);
      const targets = influenceAxes.map(({ selector }) => {
        const target = $(selector)?.getBoundingClientRect();
        return target
          ? { x: target.left - loopRect.left + target.width / 2, y: target.top - loopRect.top + target.height / 2 }
          : center;
      });
      items.forEach((item, index) => {
        const angle = index / Math.max(1, items.length) * Math.PI * 2 - Math.PI / 2;
        const modulation = .82 + (index % 5) * .045;
        const point = {
          x: center.x + Math.cos(angle) * orbit * modulation,
          y: center.y + Math.sin(angle) * orbit * modulation
        };
        const target = targets[item.axis];
        context.strokeStyle = `${item.color}18`;
        context.lineWidth = .55;
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.quadraticCurveTo(center.x, center.y, target.x, target.y);
        context.stroke();
        context.fillStyle = item.color;
        context.globalAlpha = .48 + (index % 4) * .1;
        context.beginPath();
        context.arc(point.x, point.y, index >= corpusItems.length ? 3.2 : 1.7, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
    };
    draw();
    window.addEventListener("resize", draw);
  };

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
      this.isLibrary = false;
      this.bind();
      this.resize();
      this.renderArchive();
      requestAnimationFrame(() => this.draw());
      if (index.works?.length) this.openLibrary();
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
        if (event.target.closest("[data-corpus]")) {
          this.openCorpus();
          return;
        }
        const button = event.target.closest("[data-work]");
        const entry = this.index.works.find(({ work_id: id }) => id === button?.dataset.work);
        if (entry) this.open(entry);
      });
      $("#library-entry").addEventListener("click", () => this.openLibrary());
      $("#work-listen").addEventListener("click", () => this.audio ? this.stop() : this.start());
      $("#work-node-detail-close").addEventListener("click", () => this.hideDetail());
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
      const independent = (this.index.works || []).filter((work) => !isBibleBook(work));
      const selectableWorks = independent.length + (this.corpus ? 1 : 0);
      const collections = new Set(independent.map(({ collection }) => collection || "Root Logos"));
      if (this.corpus) collections.add(this.corpus.title);
      $("#work-count").textContent = `${String(selectableWorks).padStart(2, "0")} coherent voice${selectableWorks === 1 ? "" : "s"}`;
      $("#library-entry-detail").textContent = `${selectableWorks} coherent works / ${collections.size} living fields`;
      const visible = (this.index.works || []).filter((work) => {
        if (isBibleBook(work)) return false;
        return true;
      }).sort((a, b) => Number(a.library_order ?? 9999) - Number(b.library_order ?? 9999));
      const entries = visible.map((work) => ({ ...work, public_order: work.library_order }));
      if (this.corpus) entries.push({
        is_corpus: true,
        public_order: 1,
        title: "Original Douay-Rheims",
        kind: `${this.corpus.canonical_work_count} books / ${this.corpus.measures.passages.toLocaleString()} passages`
      });
      entries.sort((a, b) => Number(a.public_order ?? 9999) - Number(b.public_order ?? 9999));
      $("#work-list").innerHTML = entries.map((work) => work.is_corpus ? `
        <button type="button" class="corpus-entry" id="corpus-entry" data-corpus="true">
          <span>01</span><span><b>${escapeHtml(work.title)}</b><small>${escapeHtml(work.kind)}</small></span>
        </button>` : `
        <button type="button" data-work="${escapeHtml(work.work_id)}">
          <span>${String(work.library_order ?? "—").padStart(2, "0")}</span>
          <span><b>${escapeHtml(work.title)}</b><small>${escapeHtml(work.kind)} / ${work.editions} edition${work.editions === 1 ? "" : "s"}</small></span>
        </button>`).join("") || "<p class=\"works-loading\">The archive is open. No work has crossed the membrane yet.</p>";
      document.querySelectorAll("#work-list [data-work]").forEach((button) =>
        button.classList.toggle("is-active", button.dataset.work === this.entry?.work_id));
    }

    async open(entry, editionHref = entry.edition) {
      this.stop();
      this.hideDetail();
      const response = await fetch(editionHref, { cache: "no-store" });
      if (!response.ok) throw new Error(`Living work ${entry.work_id} could not be opened.`);
      this.entry = entry;
      this.isCorpus = false;
      this.isLibrary = false;
      $("#library-entry").classList.remove("is-active");
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
      this.resetSoundStatus("score");
      this.targetRotation = 0;
    }

    openLibrary() {
      this.stop();
      this.hideDetail();
      this.entry = null;
      this.isCorpus = false;
      this.isLibrary = true;
      const works = (this.index.works || [])
        .filter((work) => !isBibleBook(work))
        .sort((a, b) => Number(a.library_order ?? 9999) - Number(b.library_order ?? 9999));
      if (this.corpus) {
        works.push({
          work_id: this.corpus.corpus_id,
          title: this.corpus.title,
          kind: "coherent corpus",
          collection: this.corpus.title,
          current_edition: `corpus-${this.corpus.sound.signature}`,
          editions: 1,
          library_order: 1
        });
      }
      const collectionNames = [...new Set(works.map(({ collection }) => collection || "Root Logos"))];
      const collectionColors = ["#d2d2d2", "#b8b8b8", "#9e9e9e", "#848484", "#6a6a6a"];
      const nodes = [{ id: "library", type: "work", label: "Root Logos Library", coordinate: "library:field", band: 0, weight: works.length, color: "#e8e8e8" }];
      const edges = [];
      collectionNames.forEach((collection, collectionIndex) => {
        const members = works.filter((work) => (work.collection || "Root Logos") === collection);
        const centerAngle = collectionIndex / collectionNames.length * Math.PI * 2 - Math.PI / 2;
        const collectionId = `collection-${collectionIndex}`;
        nodes.push({
          id: collectionId, type: "collection", label: collection, coordinate: `collection:${members.length}`,
          band: .43, angle: centerAngle, weight: members.length, color: collectionColors[collectionIndex % collectionColors.length]
        });
        edges.push({ from: "library", to: collectionId, relation: "contains", weight: members.length });
        members.forEach((work, memberIndex) => {
          const spread = Math.min(1.15, .18 + members.length * .035);
          const angle = centerAngle + (memberIndex - (members.length - 1) / 2) / Math.max(1, members.length - 1) * spread;
          nodes.push({
            id: work.work_id, type: "book", label: work.title,
            coordinate: `${work.collection || "Root Logos"}:${work.canonical_order || memberIndex + 1}`,
            band: .75 + (memberIndex % 4) * .055, angle, weight: work.editions,
            collection, division: work.division, color: collectionColors[collectionIndex % collectionColors.length]
          });
          edges.push({ from: collectionId, to: work.work_id, relation: "contains", weight: 1 });
        });
      });
      const seed = works.reduce((value, work) => {
        for (const character of `${work.work_id}:${work.current_edition}`) value = (value * 31 + character.charCodeAt(0)) >>> 0;
        return value;
      }, 2166136261);
      const events = works.slice(0, 96).map((work, index) => ({
        voice: "library",
        frequency: Number((82.41 * Math.pow(2, ((seed + index * 7) % 25) / 12)).toFixed(2)),
        amplitude: .025 + (work.editions || 1) * .004,
        beats: index % 5 === 0 ? 2 : 1,
        provenance: `${work.collection || "Root Logos"} / ${work.title}`
      }));
      this.edition = {
        edition_id: `library-${seed.toString(16)}`,
        root_logos_revision: "v1.1",
        source_hash: seed.toString(16).padStart(12, "0"),
        measures: { works: works.length, collections: collectionNames.length, editions: works.reduce((sum, work) => sum + work.editions, 0), witnessed_relations: edges.length },
        visual: { palette: collectionColors, motion: { drift: .65 }, topology: { nodes, edges } },
        sound: { tempo: 53, signature: seed.toString(16).padStart(12, "0"), events },
        reading: { statement: `${works.length} living works now occupy ${collectionNames.length} independently bounded fields. Collection is witnessed as containment; relation between fields remains open until derived.` }
      };
      this.nodes = nodes.map((node, index) => ({ ...node, angle: node.angle ?? index / nodes.length * Math.PI * 2, screenX: 0, screenY: 0 }));
      document.querySelectorAll("#work-list [data-work]").forEach((button) => button.classList.remove("is-active"));
      $("#library-entry").classList.add("is-active");
      $("#corpus-entry").classList.remove("is-active");
      $("#work-coordinate").textContent = "living library / collection architecture";
      $("#work-title").textContent = "The Library Field";
      $("#work-statement").textContent = this.edition.reading.statement;
      this.resetSoundStatus("library score");
      this.targetRotation = 0;
    }

    openCorpus() {
      if (!this.corpus) return;
      this.stop();
      this.hideDetail();
      this.entry = null;
      this.isCorpus = true;
      this.isLibrary = false;
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
      $("#library-entry").classList.remove("is-active");
      $("#corpus-entry").classList.add("is-active");
      $("#work-coordinate").textContent = "private corpus witness / whole canonical field";
      $("#work-title").textContent = this.corpus.title;
      $("#work-statement").textContent = this.edition.reading.statement;
      this.resetSoundStatus("corpus score");
      this.targetRotation = 0;
    }

    renderEmpty() {
      $("#work-title").textContent = "The membrane is open";
      $("#work-statement").textContent = "A complete work may now enter. Its source, visual reading, resonant score, and every later edition will remain navigable here.";
    }

    selectAt(x, y) {
      const selected = this.nodes.reduce((best, node) => {
        const distance = Math.hypot(x - node.screenX, y - node.screenY);
        return distance < (best?.distance ?? 24) ? { node, distance } : best;
      }, null);
      if (!selected) return;
      const { node } = selected;
      const relations = this.edition.visual.topology.edges.filter(({ from, to }) => from === node.id || to === node.id);
      $("#work-node-detail-type").textContent = `${node.type} / ${node.coordinate}`;
      $("#work-node-detail-title").textContent = node.label;
      $("#work-node-detail-body").textContent = `${relations.length} witnessed relation${relations.length === 1 ? "" : "s"} connect this structure to the selected model.`;
      const detail = $("#work-node-detail");
      detail.style.left = `${clamp(x + 24, 20, Math.max(20, this.width - 360))}px`;
      detail.style.top = `${clamp(y - 36, 82, Math.max(82, this.height - 230))}px`;
      detail.hidden = false;
    }

    hideDetail() {
      $("#work-node-detail").hidden = true;
    }

    draw() {
      const context = this.context;
      context.clearRect(0, 0, this.width, this.height);
      if (this.edition) {
        this.rotation += (this.targetRotation - this.rotation) * .05;
        const centerX = this.width * (this.width < 600 ? .48 : .585);
        const centerY = this.height * .54;
        const radius = Math.min(this.width, this.height) * (this.width < 600 ? .34 : .325);
        const palette = this.edition.visual.palette;
        context.save();
        context.translate(centerX, centerY);
        context.lineWidth = .55;
        for (let horizon = 1; horizon <= 5; horizon += 1) {
          const scale = horizon / 5;
          context.strokeStyle = `rgba(174,174,174,${.055 - horizon * .006})`;
          context.beginPath();
          context.ellipse(0, 0, radius * scale, radius * scale * .54, 0, 0, Math.PI * 2);
          context.stroke();
        }
        for (let bearing = 0; bearing < 12; bearing += 1) {
          const angle = bearing / 12 * Math.PI * 2 + this.rotation * .18;
          context.strokeStyle = "rgba(226,220,197,.027)";
          context.beginPath();
          context.moveTo(Math.cos(angle) * radius * .09, Math.sin(angle) * radius * .09 * .54);
          context.lineTo(Math.cos(angle) * radius * 1.18, Math.sin(angle) * radius * 1.18 * .54);
          context.stroke();
        }
        context.strokeStyle = "rgba(198,198,198,.12)";
        context.beginPath();
        context.moveTo(-radius * 1.24, 0);
        context.lineTo(radius * 1.24, 0);
        context.stroke();
        context.restore();
        if (this.isCorpus) {
          context.save();
          context.translate(centerX, centerY);
          for (let ring = 1; ring <= 4; ring += 1) {
            context.strokeStyle = `rgba(198,198,198,${.11 - ring * .018})`;
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
            ? `rgba(174,174,174,${clamp(.012 + edge.weight * .006, .018, .075)})`
            : `rgba(198,198,198,${this.isCorpus ? .055 : clamp(.025 + edge.weight * .018, .03, .2)})`;
          context.beginPath();
          context.moveTo(from.screenX, from.screenY);
          context.quadraticCurveTo(centerX, centerY, to.screenX, to.screenY);
          context.stroke();
        }
        const documentOrdinals = new Map(
          this.nodes.filter(({ type }) => type === "document").map((node, index) => [node.id, index])
        );
        [...this.nodes].sort((a, b) => a.depth - b.depth).forEach((node, index) => {
          const size = node.type === "work" ? 11 : node.type === "document" ? 5 : clamp(1.5 + Math.sqrt(node.weight), 2, 6);
          context.fillStyle = "#ffffff";
          context.globalAlpha = clamp(.2 + node.depth * .65, .25, .95);
          context.beginPath();
          context.arc(node.screenX, node.screenY, size * node.depth, 0, Math.PI * 2);
          context.fill();
          const chapterNumber = node.type === "document" ? Number(node.label.match(/\d+/)?.[0]) : null;
          const documentOrdinal = documentOrdinals.get(node.id) ?? 0;
          const labelDocument = node.type === "document" && (
            chapterNumber ? chapterNumber === 1 || chapterNumber % 5 === 0 : documentOrdinal === 0 || documentOrdinal % 8 === 0
          );
          const labelBook = node.type === "book" && (node.canonical_order === 1 || node.canonical_order === 47 || node.canonical_order % 6 === 0);
          const labelCollection = node.type === "collection";
          const labelConcept = node.type === "concept" && ((this.width >= 600 && node.weight > 3) || (this.width < 600 && node.weight > 12));
          if (node.type === "work" || labelCollection || labelDocument || labelBook || labelConcept) {
            context.globalAlpha = clamp(node.depth - .12, .2, .8);
            context.fillStyle = "#e8e8e8";
            context.font = `${node.type === "work" ? 11 : node.type === "collection" ? 9 : 8}px "SFMono-Regular", Consolas, "Liberation Mono", monospace`;
            const label = node.label.length > 30 ? `${node.label.slice(0, 27)}…` : node.label;
            context.fillText(label.toUpperCase(), node.screenX + size + 5, node.screenY + 3);
          }
        });
        context.globalAlpha = 1;
        if (!this.pointer) this.targetRotation += .0007 * this.edition.visual.motion.drift;
      }
      requestAnimationFrame(() => this.draw());
    }

    resetSoundStatus(scope) {
      $("#work-listen").setAttribute("aria-pressed", "false");
      $("#work-listen-label").textContent = "Listen";
      $("#work-sound-status").textContent = `${this.edition.sound.tempo} BPM / ${scope} ${this.edition.sound.signature}`;
      $("#work-sound-signal").dataset.state = "silent";
    }

    start() {
      if (!this.edition || !window.AudioContext) return;
      this.audio = new AudioContext();
      this.master = this.audio.createGain();
      this.master.gain.value = .043;
      this.master.connect(this.audio.destination);
      this.cursor = 0;
      $("#work-listen").setAttribute("aria-pressed", "true");
      $("#work-listen-label").textContent = "Stop";
      this.schedule();
    }

    schedule() {
      if (!this.audio) return;
      const event = this.edition.sound.events[this.cursor % this.edition.sound.events.length];
      const beat = 60 / this.edition.sound.tempo;
      if (!event.rest) {
        const oscillator = this.audio.createOscillator();
        const envelope = this.audio.createGain();
        oscillator.type = ["ground", "antigravity"].includes(event.voice) ? "triangle" : "sine";
        oscillator.frequency.value = event.frequency;
        const peak = clamp(Number(event.amplitude || .05), .018, .1);
        envelope.gain.setValueAtTime(.0001, this.audio.currentTime);
        envelope.gain.exponentialRampToValueAtTime(peak, this.audio.currentTime + .08);
        envelope.gain.exponentialRampToValueAtTime(.0001, this.audio.currentTime + Math.max(.2, beat * event.beats * .9));
        oscillator.connect(envelope).connect(this.master);
        oscillator.start();
        oscillator.stop(this.audio.currentTime + beat * event.beats);
      }
      $("#work-sound-signal").dataset.state = event.rest ? "rest" : "sounding";
      $("#work-sound-signal").style.setProperty("--event-duration", `${Math.max(.3, beat * event.beats)}s`);
      $("#work-sound-status").textContent = event.rest ? "Structural rest" : `${event.voice} / ${event.provenance}`;
      this.cursor += 1;
      this.timer = window.setTimeout(() => this.schedule(), beat * event.beats * 1000);
    }

    stop() {
      if (this.timer) clearTimeout(this.timer);
      if (this.audio) this.audio.close().catch(() => {});
      this.timer = null;
      this.audio = null;
      this.master = null;
      if (this.edition) {
        const scope = this.isLibrary ? "library score" : this.isCorpus ? "corpus score" : "score";
        this.resetSoundStatus(scope);
      }
    }

  }

  const initialize = async () => {
    try {
      const [indexResponse, corpusResponse] = await Promise.all([
        fetch("works/index.json", { cache: "no-store" }),
        fetch("works/corpora/original-douay-rheims.json", { cache: "no-store" })
      ]);
      if (!indexResponse.ok) throw new Error("The living works index is unavailable.");
      const index = await indexResponse.json();
      const corpus = corpusResponse.ok ? await corpusResponse.json() : null;
      window.rootLogosWorks = new LivingWorks(index, corpus);
      renderIdentityInfluence(index, corpus);
    } catch (error) {
      console.error(error);
      $("#work-title").textContent = "The archive remains closed";
      $("#work-statement").textContent = "Its constitutional contract remains intact, but the current works index could not be resolved.";
    }
  };

  initialize();
})();
