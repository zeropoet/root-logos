(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
  const BIBLE_COLLECTION = "Original Douay-Rheims Catholic Canon";
  const isBibleBook = ({ collection }) => collection === BIBLE_COLLECTION;

  class LivingWorks {
    constructor(index, corpus = null, sourceRelations = [], topology = null, editionScores = new Map()) {
      this.index = index;
      this.corpus = corpus;
      this.sourceRelations = sourceRelations;
      this.topology = topology;
      this.editionScores = editionScores;
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
      this.volume = null;
      this.timer = null;
      this.cursor = 0;
      this.detailPinned = false;
      this.isCorpus = false;
      this.isLibrary = false;
      this.layoutMode = "orbital";
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
        if (this.pointer) {
          this.targetRotation = this.pointer.rotation + (event.clientX - this.pointer.x) * .006;
          return;
        }
        this.previewAt(event.offsetX, event.offsetY);
      });
      this.canvas.addEventListener("pointerup", (event) => {
        this.pointer = null;
        this.canvas.releasePointerCapture(event.pointerId);
        this.selectAt(event.offsetX, event.offsetY);
      });
      this.canvas.addEventListener("pointerleave", () => {
        if (!this.detailPinned) this.hideDetail();
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
      $("#library-entry").addEventListener("click", () => {
        this.openLibrary();
        this.start();
      });
      $("#work-listen").addEventListener("click", () => this.audio ? this.stop() : this.start());
      $("#work-title").addEventListener("click", () => {
        if (!this.audio) this.start();
      });
      $("#work-title").addEventListener("keydown", (event) => {
        if (!["Enter", " "].includes(event.key) || this.audio) return;
        event.preventDefault();
        this.start();
      });
      window.addEventListener("rootlogos:living-voice-foreground", () => {
        if (this.audio) this.stop();
      });
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
      this.arrangeWork(entry.kind);
      $$("#work-list [data-work]").forEach((button) => button.classList.toggle("is-active", button.dataset.work === entry.work_id));
      $("#work-title").textContent = entry.title;
      $("#work-coordinate").textContent = `${entry.kind} / ${entry.translation || entry.author} / current edition`;
      const sourceRelation = this.sourceRelations.find(({ work_id }) => work_id === entry.work_id);
      $("#work-statement").textContent = [
        this.edition.reading.statement,
        sourceRelation?.library_statement
      ].filter(Boolean).join(" ");
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
      const streams = works.map((work) => ({
        work,
        events: work.work_id === this.corpus?.corpus_id
          ? this.corpus.sound.events
          : this.editionScores.get(work.work_id)?.events || []
      })).filter(({ events }) => events.length);
      const eventCount = Math.min(96, Math.max(12, streams.reduce((sum, { events }) => sum + events.length, 0)));
      const events = Array.from({ length: eventCount }, (_, index) => {
        const stream = streams[index % streams.length];
        const sourceEvent = stream.events[Math.floor(index / streams.length) % stream.events.length];
        return {
          ...sourceEvent,
          provenance: `${stream.work.title} / ${sourceEvent.provenance}`,
          library_work_id: stream.work.work_id
        };
      });
      const compositionInheritance = streams
        .map(({ events, work }) => this.editionScores.get(work.work_id)?.composition_inheritance || (work.work_id === this.corpus?.corpus_id ? this.corpus.sound.composition_inheritance : null))
        .find(Boolean) || null;
      this.edition = {
        edition_id: `library-${seed.toString(16)}`,
        root_logos_revision: "v1.1",
        source_hash: seed.toString(16).padStart(12, "0"),
        measures: { works: works.length, collections: collectionNames.length, editions: works.reduce((sum, work) => sum + work.editions, 0), witnessed_relations: edges.length },
        visual: { palette: collectionColors, motion: { drift: .65 }, topology: { nodes, edges } },
        sound: { schema: "root-logos-library-score/v2", tempo: 53, signature: seed.toString(16).padStart(12, "0"), composition_inheritance: compositionInheritance, events },
        reading: { statement: `${works.length} living works now occupy ${collectionNames.length} independently bounded fields. Collection is witnessed as containment; relation between fields remains open until derived.` }
      };
      this.nodes = nodes.map((node, index) => ({ ...node, angle: node.angle ?? index / nodes.length * Math.PI * 2, screenX: 0, screenY: 0 }));
      this.layoutMode = "orbital";
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
      this.layoutMode = "orbital";
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
      const selected = this.nodeAt(x, y);
      if (!selected) return;
      this.showDetail(selected.node, x, y, true);
    }

    previewAt(x, y) {
      if (this.detailPinned) return;
      const selected = this.nodeAt(x, y, 30);
      if (!selected) {
        this.hideDetail();
        return;
      }
      this.showDetail(selected.node, x, y, false);
    }

    nodeAt(x, y, threshold = 24) {
      return this.nodes.reduce((best, node) => {
        const distance = Math.hypot(x - node.screenX, y - node.screenY);
        return distance < (best?.distance ?? threshold) ? { node, distance } : best;
      }, null);
    }

    arrangeWork(kind = "") {
      const concepts = this.nodes.filter(({ type }) => type === "concept");
      const documents = this.nodes.filter(({ type }) => type === "document");
      const work = this.nodes.find(({ type }) => type === "work");
      const place = (node, x, y, z = 0) => Object.assign(node, { layoutX: x, layoutY: y, layoutZ: z });

      if (kind === "constitution") {
        this.layoutMode = "authority-tree";
        if (work) place(work, 0, .88, 0);
        documents.forEach((node, index) => place(node, (index - (documents.length - 1) / 2) * .24, .56, index % 2 ? .12 : -.12));
        concepts.forEach((node, index) => {
          const columns = 8;
          const tier = Math.floor(index / columns);
          const column = index % columns;
          const members = Math.min(columns, concepts.length - tier * columns);
          place(node, (column - (members - 1) / 2) * .23, .27 - tier * .29, Math.sin(index * 2.17) * .34);
        });
        return;
      }

      if (kind === "whitepaper") {
        this.layoutMode = "dependency-lattice";
        if (work) place(work, -.96, 0, 0);
        documents.forEach((node, index) => place(node, -.72, (index - (documents.length - 1) / 2) * .34, index % 2 ? .16 : -.16));
        concepts.forEach((node, index) => {
          const rows = 6;
          const column = Math.floor(index / rows);
          const row = index % rows;
          place(node, -.43 + column * .27, (row - (rows - 1) / 2) * .25, Math.sin(column * 1.31 + row * 2.03) * .38);
        });
        return;
      }

      if (kind === "epic-poetry") {
        this.layoutMode = "narrative-spiral";
        if (work) place(work, 0, 0, 0);
        documents.forEach((node, index) => {
          const angle = index / Math.max(1, documents.length) * Math.PI * 4.5;
          const reach = .16 + index / Math.max(1, documents.length) * .78;
          place(node, Math.cos(angle) * reach, -.72 + index / Math.max(1, documents.length) * 1.44, Math.sin(angle) * reach);
        });
        concepts.forEach((node, index) => {
          const angle = index / Math.max(1, concepts.length) * Math.PI * 7;
          const reach = .32 + index / Math.max(1, concepts.length) * .62;
          place(node, Math.cos(angle) * reach, -.68 + index / Math.max(1, concepts.length) * 1.36, Math.sin(angle) * reach);
        });
        return;
      }

      if (kind.includes("commentary")) {
        this.layoutMode = "nested-commentary";
        if (work) place(work, 0, 0, 0);
        documents.forEach((node, index) => {
          const angle = index / Math.max(1, documents.length) * Math.PI * 2;
          place(node, Math.cos(angle) * .22, Math.sin(angle) * .22, Math.sin(angle * 2) * .14);
        });
        concepts.forEach((node, index) => {
          const ring = 1 + (index % 3);
          const angle = index / Math.max(1, concepts.length) * Math.PI * 6;
          const reach = .24 + ring * .2;
          place(node, Math.cos(angle) * reach, Math.sin(angle) * reach * .78, Math.sin(angle * 1.7) * .34);
        });
        return;
      }

      this.layoutMode = "orbital";
    }

    showDetail(node, x, y, pinned) {
      this.detailPinned = pinned;
      const relations = this.edition.visual.topology.edges.filter(({ from, to }) => from === node.id || to === node.id);
      $("#work-node-detail-type").textContent = `${node.type} / ${node.coordinate}`;
      $("#work-node-detail-title").textContent = node.label;
      $("#work-node-detail-body").textContent = `${relations.length} witnessed relation${relations.length === 1 ? "" : "s"} connect this structure to the selected model.${pinned ? " Detail pinned." : " Select to hold."}`;
      const detail = $("#work-node-detail");
      detail.dataset.state = pinned ? "pinned" : "preview";
      detail.style.left = `${clamp(x + 24, 20, Math.max(20, this.width - 360))}px`;
      detail.style.top = `${clamp(y - 36, 82, Math.max(82, this.height - 230))}px`;
      detail.hidden = false;
    }

    hideDetail() {
      this.detailPinned = false;
      $("#work-node-detail").hidden = true;
    }

    draw() {
      const context = this.context;
      context.clearRect(0, 0, this.width, this.height);
      if (this.edition) {
        this.rotation += (this.targetRotation - this.rotation) * .05;
        const centerX = this.width * .5;
        const centerY = this.height * .54;
        const radius = Math.min(this.width, this.height) * (this.width < 600 ? .34 : .325);
        const palette = this.edition.visual.palette;
        const structured = this.layoutMode !== "orbital" && !this.isCorpus && !this.isLibrary;
        context.save();
        context.translate(centerX, centerY);
        context.lineWidth = .55;
        if (structured && this.layoutMode === "dependency-lattice") {
          for (let station = 0; station < 7; station += 1) {
            const x = radius * (-.96 + station * .3);
            context.strokeStyle = station === 0 ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.035)";
            context.beginPath();
            context.moveTo(x, -radius * .82);
            context.lineTo(x, radius * .82);
            context.stroke();
          }
          for (let lane = -3; lane <= 3; lane += 1) {
            context.strokeStyle = "rgba(255,255,255,.025)";
            context.beginPath();
            context.moveTo(-radius * 1.04, lane * radius * .18);
            context.lineTo(radius * .92, lane * radius * .18);
            context.stroke();
          }
        } else if (structured && this.layoutMode === "authority-tree") {
          context.strokeStyle = "rgba(255,255,255,.12)";
          context.beginPath();
          context.moveTo(0, radius * .96);
          context.lineTo(0, -radius * .96);
          context.stroke();
          for (let tier = 0; tier < 5; tier += 1) {
            const y = radius * (.58 - tier * .29);
            context.strokeStyle = "rgba(255,255,255,.035)";
            context.beginPath();
            context.moveTo(-radius, y);
            context.lineTo(radius, y);
            context.stroke();
          }
        } else {
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
          if (structured) {
            const yaw = this.rotation * .72;
            const cosine = Math.cos(yaw);
            const sine = Math.sin(yaw);
            const x = node.layoutX || 0;
            const z = node.layoutZ || 0;
            const rotatedX = x * cosine - z * sine;
            const depth = x * sine + z * cosine;
            node.screenX = centerX + rotatedX * radius;
            node.screenY = centerY + (node.layoutY || 0) * radius * .72 + depth * radius * .07;
            node.depth = clamp(.72 + (depth + 1) * .15, .55, 1.05);
          } else {
            const angle = node.angle + this.rotation;
            const perspective = .7 + Math.sin(angle) * .3;
            node.screenX = centerX + Math.cos(angle) * radius * node.band;
            node.screenY = centerY + Math.sin(angle) * radius * node.band * .54;
            node.depth = perspective;
          }
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
          if (structured) {
            const direction = this.layoutMode === "dependency-lattice" ? 1 : -1;
            const controlX = (from.screenX + to.screenX) / 2;
            const controlY = (from.screenY + to.screenY) / 2 + direction * Math.min(24, Math.abs(to.screenX - from.screenX) * .08);
            context.quadraticCurveTo(controlX, controlY, to.screenX, to.screenY);
          } else {
            context.quadraticCurveTo(centerX, centerY, to.screenX, to.screenY);
          }
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
      $("#work-sound-signal").dataset.playing = "false";
    }

    start() {
      if (!this.edition || !window.AudioContext) return;
      this.audio = new AudioContext();
      this.master = this.audio.createGain();
      this.volume = this.audio.createGain();
      this.master.gain.value = .018;
      this.volume.gain.value = .72;
      this.master.connect(this.volume).connect(this.audio.destination);
      this.cursor = 0;
      $("#work-listen").setAttribute("aria-pressed", "true");
      $("#work-listen-label").textContent = "Stop";
      $("#work-sound-signal").dataset.playing = "true";
      document.documentElement.dataset.libraryVoice = "sounding";
      window.dispatchEvent(new CustomEvent("rootlogos:library-voice-start"));
      this.schedule();
    }

    schedule() {
      if (!this.audio) return;
      const event = this.edition.sound.events[this.cursor % this.edition.sound.events.length];
      const beat = 60 / this.edition.sound.tempo;
      if (!event.rest) {
        const oscillator = this.audio.createOscillator();
        const envelope = this.audio.createGain();
        oscillator.type = event.waveform || (["ground", "antigravity", "foldforge"].includes(event.voice) ? "triangle" : "sine");
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
      $("#work-sound-status").textContent = event.rest ? "Structural rest / sovereign hum continues" : `${event.voice} / ${event.provenance}`;
      this.cursor += 1;
      this.timer = window.setTimeout(() => this.schedule(), beat * event.beats * 1000);
    }

    stop() {
      if (this.timer) clearTimeout(this.timer);
      if (this.audio) this.audio.close().catch(() => {});
      this.timer = null;
      this.audio = null;
      this.master = null;
      this.volume = null;
      document.documentElement.dataset.libraryVoice = "silent";
      window.dispatchEvent(new CustomEvent("rootlogos:library-voice-stop"));
      if (this.edition) {
        const scope = this.isLibrary ? "library score" : this.isCorpus ? "corpus score" : "score";
        this.resetSoundStatus(scope);
      }
    }

  }

  const initialize = async () => {
    try {
      const [indexResponse, corpusResponse, telosResponse, topologyResponse] = await Promise.all([
        fetch("works/index.json", { cache: "no-store" }),
        fetch("works/corpora/original-douay-rheims.json", { cache: "no-store" }),
        fetch("sources/telos.public-witness.json", { cache: "no-store" }).catch(() => null),
        fetch("content/constitutional-graph.json", { cache: "no-store" })
      ]);
      if (!indexResponse.ok) throw new Error("The living works index is unavailable.");
      const index = await indexResponse.json();
      const corpus = corpusResponse.ok ? await corpusResponse.json() : null;
      const telos = telosResponse?.ok ? await telosResponse.json() : null;
      const topology = topologyResponse.ok ? await topologyResponse.json() : null;
      const publicEntries = (index.works || []).filter(({ collection, edition }) => !isBibleBook({ collection }) && edition);
      const editionScores = new Map((await Promise.all(publicEntries.map(async (entry) => {
        try {
          const response = await fetch(entry.edition, { cache: "no-store" });
          const edition = response.ok ? await response.json() : null;
          return edition ? [entry.work_id, edition.sound] : null;
        } catch {
          return null;
        }
      }))).filter(Boolean));
      window.rootLogosWorks = new LivingWorks(index, corpus, telos?.work_relations || [], topology, editionScores);
      window.dispatchEvent(new CustomEvent("rootlogos:works-ready"));
    } catch (error) {
      console.error(error);
      $("#work-title").textContent = "The archive remains closed";
      $("#work-statement").textContent = "Its constitutional contract remains intact, but the current works index could not be resolved.";
    }
  };

  initialize();
})();
