const navLinks = Array.from(document.querySelectorAll(".site-nav a"));
const sections = navLinks
  .map((link) => document.getElementById(link.hash.slice(1)))
  .filter(Boolean);

const typeLabels = {
  root: "Layer 0",
  logos: "Logos",
  vocabulary: "Vocabulary",
  "living-statement": "Living Statement",
  bridge: "Bridge",
  "field-note": "Field Note",
  "artifact-seed": "Artifact Seed",
  "open-question": "Open Question",
  "export-system": "Export System",
  revision: "Revision",
};

const networkTypeOrder = ["root", "logos", "vocabulary", "living-statement", "bridge", "field-note", "artifact-seed", "open-question", "export-system", "revision"];
const networkTypeNames = {
  root: "Source", logos: "Logoi", vocabulary: "Concepts", "living-statement": "Statements",
  bridge: "Bridges", "field-note": "Notes", "artifact-seed": "Seeds", "open-question": "Questions",
  "export-system": "Protocol", revision: "Revisions",
};

const setActiveLink = (id) => {
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.hash === `#${id}`);
  });
};

const orientationPoints = [
  { selector: "#top", label: "Entering the field" },
  { selector: "#network", label: "Network / Relation made visible" },
  ...Array.from(document.querySelectorAll(".doc-part[data-orientation]")).map((section) => ({
    selector: `#${section.id}`,
    label: section.dataset.orientation,
  })),
];

const updateDocumentFlow = () => {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
  const bar = document.querySelector("#coherence-progress-bar");
  if (bar) bar.style.transform = `scaleX(${progress})`;

  const threshold = window.innerHeight * 0.38;
  const visiblePoints = orientationPoints
    .map((point) => ({ ...point, element: document.querySelector(point.selector) }))
    .filter((point) => point.element && point.element.getBoundingClientRect().top <= threshold);
  const current = visiblePoints[visiblePoints.length - 1];
  setText("#orientation-label", current?.label || "Entering the field");
};

document.querySelectorAll(".doc-part").forEach((part) => {
  part.open = true;
  part.querySelector("summary")?.addEventListener("click", (event) => event.preventDefault());
});

window.addEventListener("scroll", () => requestAnimationFrame(updateDocumentFlow), { passive: true });
window.addEventListener("resize", updateDocumentFlow);

if (sections.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (visible) {
        setActiveLink(visible.target.id);
      }
    },
    {
      rootMargin: "-28% 0px -54% 0px",
      threshold: [0.1, 0.35, 0.6],
    },
  );

  sections.forEach((section) => observer.observe(section));
}

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const slugHref = (node) => node.url || `#${node.id}`;

const relationVerb = (edge, selectedId) => {
  if (edge.from === selectedId) {
    return edge.type;
  }

  return `${edge.type} by`;
};

const getRelations = (nodeId, edges, nodesById) =>
  edges
    .filter((edge) => edge.from === nodeId || edge.to === nodeId)
    .map((edge) => {
      const relatedId = edge.from === nodeId ? edge.to : edge.from;
      return {
        edge,
        node: nodesById.get(relatedId),
      };
    })
    .filter((relation) => relation.node);

const renderTags = (items = []) =>
  items
    .slice(0, 5)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");

const renderNodeCard = (node, relations = []) => `
  <article class="node-card" id="${escapeHtml(node.id)}">
    <p class="entry-label">${escapeHtml(node.label || typeLabels[node.type] || node.type)}</p>
    <h3>${escapeHtml(node.title)}</h3>
    <p>${escapeHtml(node.summary || node.definition || "")}</p>
    <dl>
      <div>
        <dt>Status</dt>
        <dd>${escapeHtml(node.status || "Active")}</dd>
      </div>
      ${
        node.answers
          ? `<div><dt>Answers</dt><dd>${escapeHtml(node.answers)}</dd></div>`
          : ""
      }
    </dl>
    <div class="related-links">
      ${relations
        .slice(0, 4)
        .map(({ node: related }) => `<a href="${escapeHtml(slugHref(related))}">${escapeHtml(related.label || related.title)}</a>`)
        .join("")}
    </div>
  </article>
`;

const renderCompactNode = (node, relations = []) => `
  <article class="compact-node" id="${escapeHtml(node.id)}">
    <div>
      <p class="entry-label">${escapeHtml(node.label || typeLabels[node.type] || node.type)}</p>
      <h3>${escapeHtml(node.title)}</h3>
      <p>${escapeHtml(node.summary || "")}</p>
    </div>
    <div class="node-side">
      <span>${escapeHtml(node.status || "Active")}</span>
      ${
        node.url
          ? `<a href="${escapeHtml(node.url)}">Open</a>`
          : `<a href="#${escapeHtml(node.id)}">Anchor</a>`
      }
    </div>
    ${
      relations.length
        ? `<div class="related-links">${relations
            .slice(0, 4)
            .map(({ node: related }) => `<a href="${escapeHtml(slugHref(related))}">${escapeHtml(related.label || related.title)}</a>`)
            .join("")}</div>`
        : ""
    }
  </article>
`;

const renderRevision = (node) => `
  <article class="revision-entry" id="${escapeHtml(node.id)}">
    <p class="entry-label">${escapeHtml(node.label)}</p>
    <h3>${escapeHtml(node.title)}</h3>
    <p>${escapeHtml(node.summary)}</p>
    <dl>
      <div><dt>Date</dt><dd>${escapeHtml(node.date)}</dd></div>
      ${node.source_export ? `<div><dt>Source Export</dt><dd>${escapeHtml(node.source_export)}</dd></div>` : ""}
      <div><dt>Reason</dt><dd>${escapeHtml(node.reason)}</dd></div>
    </dl>
    <h4>Added</h4>
    <ul>${(node.added || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h4>Modified</h4>
    <ul>${(node.modified || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h4>Removed</h4>
    <ul>${(node.removed || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h4>Relationships</h4>
    <ul>${(node.relationships || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    ${node.notes ? `<h4>Notes</h4><p>${escapeHtml(node.notes)}</p>` : ""}
  </article>
`;

const sampleExportPacket = `export_id: RL-EXPORT-0001
date: 2026-07-09
source: ChatGPT conversation
status: proposed

summary:
  Knowing was established as a temporal instrument within Root Logos.

primary_update:
  type: logos
  title: Knowing and the Experience of Time
  location: Root Logos / Constitutional Grammar / Logos I

changes:
  added:
    - Logos I - Knowing and the Experience of Time
  modified:
    - Root Logos structure
    - Architectural vocabulary
  related:
    - Living Statement 004
    - Field Note 003

revision_entry:
  version: 0.1.0
  date: 2026-07-09
  source_export: RL-EXPORT-0001
  added:
    - Logos I
  relationships:
    - Logos I -> Participation
    - Logos I -> Observation
  reason:
    - Established knowing as a constitutional mechanism of temporal experience.`;

const parseScalar = (value = "") => value.trim().replace(/^["']|["']$/g, "");

const parsePacket = (text) => {
  const root = {};
  const lines = text.split("\n");
  const stack = [{ indent: -1, key: null, value: root }];

  const nextMeaningfulLine = (index) => {
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (lines[cursor].trim()) {
        return lines[cursor].trim();
      }
    }
    return "";
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const indent = line.match(/^\s*/)[0].length;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1];

    if (trimmed.startsWith("- ")) {
      if (Array.isArray(current.value)) {
        current.value.push(parseScalar(trimmed.slice(2)));
      }
      return;
    }

    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      if (typeof current.value === "string") {
        const parent = stack[stack.length - 2]?.value;
        parent[current.key] = `${current.value} ${parseScalar(trimmed)}`.trim();
        current.value = parent[current.key];
      }
      return;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const parent = current.value;

    if (rawValue) {
      parent[key] = parseScalar(rawValue);
      return;
    }

    const next = nextMeaningfulLine(index);
    const container = next.startsWith("- ") ? [] : next.includes(":") ? {} : "";
    parent[key] = container;
    stack.push({ indent, key, value: container });
  });

  return root;
};

const asList = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  return [value];
};

const renderPacketPreview = (packet) => {
  const revision = packet.revision_entry || {};
  const changes = packet.changes || {};
  return `
    <article class="export-card">
      <p class="entry-label">${escapeHtml(packet.status || "proposed")}</p>
      <h3>${escapeHtml(packet.export_id || "Unidentified Export Packet")}</h3>
      <p>${escapeHtml(packet.summary || "No summary supplied.")}</p>
      <dl>
        <div><dt>Date</dt><dd>${escapeHtml(packet.date || "")}</dd></div>
        <div><dt>Source</dt><dd>${escapeHtml(packet.source || "")}</dd></div>
        <div><dt>Primary Type</dt><dd>${escapeHtml(packet.primary_update?.type || "")}</dd></div>
        <div><dt>Location</dt><dd>${escapeHtml(packet.primary_update?.location || "")}</dd></div>
        <div><dt>Revision</dt><dd>${escapeHtml(revision.version || "")}</dd></div>
      </dl>
      <h4>Added</h4>
      <ul>${asList(changes.added || revision.added).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <h4>Modified</h4>
      <ul>${asList(changes.modified || revision.modified).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <h4>Relationships</h4>
      <ul>${asList(changes.related || revision.relationships).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <h4>Reason</h4>
      <ul>${asList(revision.reason).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  `;
};

const renderExportPackets = (packets = []) => {
  const list = document.querySelector("#export-packet-list");
  const input = document.querySelector("#export-input");
  const preview = document.querySelector("#export-preview");

  if (input && !input.value) {
    input.value = sampleExportPacket;
  }

  if (list) {
    list.innerHTML = packets.map(renderPacketPreview).join("");
  }

  let reviewedPacket = null;
  const validatePacket = (packet) => {
    const required = ["export_id", "date", "status", "summary", "primary_update", "changes", "revision_entry"];
    return required.filter((key) => !packet[key]);
  };

  const review = () => {
    if (!input || !preview) {
      return;
    }
    try {
      reviewedPacket = parsePacket(input.value);
      const missing = validatePacket(reviewedPacket);
      preview.innerHTML = renderPacketPreview(reviewedPacket);
      const status = document.querySelector("#import-status");
      if (status) {
        status.className = `import-status ${missing.length ? "is-error" : "is-valid"}`;
        status.textContent = missing.length
          ? `Contract incomplete · missing ${missing.join(", ")}`
          : `Contract valid · ${reviewedPacket.export_id} is ready to stage`;
      }
    } catch {
      preview.innerHTML = '<p class="export-error">This packet could not be parsed for review.</p>';
    }
  };

  document.querySelector("#load-sample-export")?.addEventListener("click", () => {
    if (input) {
      input.value = sampleExportPacket;
    }
    review();
  });

  document.querySelector("#review-export")?.addEventListener("click", review);
  document.querySelector("#stage-export")?.addEventListener("click", () => {
    review();
    const status = document.querySelector("#import-status");
    const missing = reviewedPacket ? validatePacket(reviewedPacket) : ["packet"];
    if (!status || missing.length) return;
    const changes = reviewedPacket.changes || {};
    const count = asList(changes.added).length + asList(changes.modified).length + asList(changes.related).length;
    status.className = "import-status is-staged";
    status.textContent = `Update staged · ${count} graph operations proposed · published data unchanged`;
  });
  review();
};

const renderNetwork = (nodes, edges, nodesById) => {
  const canvas = document.querySelector("#network-canvas");
  const stage = canvas?.parentElement;
  const filters = document.querySelector("#network-filters");
  if (!canvas || !stage || !filters) return;

  const state = { activeTypes: new Set(networkTypeOrder), selected: "root-logos", points: [], raf: 0 };
  const context = canvas.getContext("2d");
  if (!context) return;

  const inspect = (id) => {
    state.selected = id;
    const node = nodesById.get(id);
    if (!node) return;
    const relations = getRelations(id, edges, nodesById);
    setText("#network-node-label", node.label || typeLabels[node.type]);
    setText("#network-node-title", node.title);
    setText("#network-node-summary", node.summary || node.definition);
    document.querySelector("#network-node-meta").innerHTML = `
      <div><dt>Class</dt><dd>${escapeHtml(networkTypeNames[node.type] || node.type)}</dd></div>
      <div><dt>State</dt><dd>${escapeHtml(node.status || "Active")}</dd></div>
      <div><dt>Degree</dt><dd>${relations.length} relations</dd></div>`;
    document.querySelector("#network-node-relations").innerHTML = relations.slice(0, 8).map(({ edge, node: related }) => `
      <button type="button" data-network-node="${escapeHtml(related.id)}">
        <span>${escapeHtml(relationVerb(edge, id))}</span>${escapeHtml(related.title)}
      </button>`).join("") || "<p>No immediate relations recorded.</p>";
    document.querySelectorAll("[data-network-node]").forEach((button) => button.addEventListener("click", () => { inspect(button.dataset.networkNode); draw(); }));
  };

  const layout = (visible, width, height) => visible.map((node, index) => {
    if (node.id === "root-logos") return { node, x: width / 2, y: height / 2, r: 13 };
    const typeIndex = Math.max(0, networkTypeOrder.indexOf(node.type));
    const peers = visible.filter((candidate) => candidate.type === node.type && candidate.id !== "root-logos");
    const peerIndex = peers.findIndex((candidate) => candidate.id === node.id);
    const angle = (peerIndex / Math.max(1, peers.length)) * Math.PI * 2 + typeIndex * 0.57;
    const radius = Math.min(width, height) * (0.22 + (typeIndex % 4) * 0.065);
    return { node, x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius, r: node.type === "logos" ? 9 : 6 };
  });

  const draw = () => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = stage.clientWidth;
    const height = Math.max(540, Math.min(720, window.innerHeight * 0.72));
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
    const visible = nodes.filter((node) => state.activeTypes.has(node.type));
    state.points = layout(visible, width, height);
    const pointById = new Map(state.points.map((point) => [point.node.id, point]));
    const relatedIds = new Set(edges.filter((edge) => edge.from === state.selected || edge.to === state.selected).flatMap((edge) => [edge.from, edge.to]));
    edges.forEach((edge) => {
      const from = pointById.get(edge.from); const to = pointById.get(edge.to);
      if (!from || !to) return;
      const active = edge.from === state.selected || edge.to === state.selected;
      context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y);
      context.strokeStyle = active ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.13)";
      context.lineWidth = active ? 1.4 : 0.7; context.stroke();
    });
    state.points.forEach((point) => {
      const selected = point.node.id === state.selected; const related = relatedIds.has(point.node.id);
      context.beginPath(); context.arc(point.x, point.y, selected ? point.r + 5 : point.r, 0, Math.PI * 2);
      context.fillStyle = selected ? "#fff" : related ? "#b9ffda" : "rgba(255,255,255,.62)"; context.fill();
      if (selected || point.node.type === "root" || point.node.type === "logos") {
        context.font = "11px SFMono-Regular, Menlo, monospace"; context.fillStyle = "rgba(255,255,255,.86)";
        context.textAlign = "center"; context.fillText(point.node.label || point.node.title, point.x, point.y + 25);
      }
    });
    document.querySelector("#network-empty").hidden = visible.length > 0;
    document.querySelector("#network-stats").innerHTML = `<span>${visible.length}<small>visible nodes</small></span><span>${edges.filter((edge) => pointById.has(edge.from) && pointById.has(edge.to)).length}<small>active edges</small></span><span>${networkTypeOrder.length}<small>node classes</small></span>`;
  };

  filters.innerHTML = networkTypeOrder.filter((type) => nodes.some((node) => node.type === type)).map((type) => `<button type="button" class="is-active" data-network-type="${type}">${networkTypeNames[type]}</button>`).join("");
  filters.addEventListener("click", (event) => {
    const button = event.target.closest("button"); if (!button) return;
    const type = button.dataset.networkType;
    state.activeTypes.has(type) ? state.activeTypes.delete(type) : state.activeTypes.add(type);
    button.classList.toggle("is-active", state.activeTypes.has(type)); draw();
  });
  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top;
    const hit = state.points.find((point) => Math.hypot(point.x - x, point.y - y) < Math.max(14, point.r + 6));
    if (hit) { inspect(hit.node.id); draw(); }
  });
  canvas.addEventListener("mousemove", (event) => {
    const rect = canvas.getBoundingClientRect();
    canvas.style.cursor = state.points.some((point) => Math.hypot(point.x - (event.clientX - rect.left), point.y - (event.clientY - rect.top)) < 16) ? "pointer" : "crosshair";
  });
  window.addEventListener("resize", () => { cancelAnimationFrame(state.raf); state.raf = requestAnimationFrame(draw); });
  inspect(state.selected); draw();
};

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element && value) {
    element.textContent = value;
  }
};

const renderRelationshipLedger = (edges, nodesById) => {
  const summary = document.querySelector("#relationship-summary");
  const records = document.querySelector("#relationship-records");
  if (!summary || !records) return;

  const counts = edges.reduce((map, edge) => map.set(edge.type, (map.get(edge.type) || 0) + 1), new Map());
  summary.innerHTML = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, count]) => `<span><strong>${count}</strong>${escapeHtml(type)}</span>`)
    .join("");

  records.innerHTML = edges.map((edge, index) => {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    return `<article class="relationship-record">
      <span class="relationship-number">${String(index + 1).padStart(2, "0")}</span>
      <a href="${escapeHtml(slugHref(from))}">${escapeHtml(from.title)}</a>
      <span class="relationship-verb">${escapeHtml(edge.type)}</span>
      <a href="${escapeHtml(slugHref(to))}">${escapeHtml(to.title)}</a>
    </article>`;
  }).join("");
};

const scoreNode = (node, query) => {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [
    node.title,
    node.label,
    node.summary,
    node.definition,
    node.status,
    ...(node.keywords || []),
  ]
    .join(" ")
    .toLowerCase();

  return terms.reduce((score, term) => {
    if ((node.keywords || []).some((keyword) => keyword.toLowerCase().includes(term))) {
      return score + 5;
    }

    if (String(node.title || "").toLowerCase().includes(term)) {
      return score + 3;
    }

    return haystack.includes(term) ? score + 1 : score;
  }, 0);
};

const renderSearch = (nodes, edges, nodesById, query = "") => {
  const results = document.querySelector("#search-results");
  if (!results) {
    return;
  }

  const matches = nodes
    .map((node) => ({ node, score: query ? scoreNode(node, query) : Number(node.type === "root") }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.node.title.localeCompare(b.node.title))
    .slice(0, 8);

  results.innerHTML = matches.length
    ? matches
        .map(({ node }) => {
          const relations = getRelations(node.id, edges, nodesById);
          return `
            <article class="search-result">
              <p class="entry-label">${escapeHtml(typeLabels[node.type] || node.type)}</p>
              <h3><a href="${escapeHtml(slugHref(node))}">${escapeHtml(node.title)}</a></h3>
              <p>${escapeHtml(node.summary || node.definition || "")}</p>
              <div class="tag-row">${renderTags(node.keywords)}</div>
              <div class="related-links">
                ${relations
                  .slice(0, 3)
                  .map(({ node: related }) => `<a href="${escapeHtml(slugHref(related))}">${escapeHtml(related.label || related.title)}</a>`)
                  .join("")}
              </div>
            </article>
          `;
        })
        .join("")
    : "<p>No constitutional nodes match this concept yet.</p>";
};

const renderGraphSite = ({ meta, nodes, edges }) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const byType = (type) => nodes.filter((node) => node.type === type);
  const relationsFor = (node) => getRelations(node.id, edges, nodesById);

  document.title = meta.title;
  setText("#site-title", meta.title);
  setText(".subtitle", meta.subtitle);
  setText("#current-revision", meta.revision);
  setText("#current-updated", meta.updated);
  setText("#current-status", meta.status);
  setText("#footer-maxim", meta.maxim);
  setText("#pulse-nodes", nodes.length);
  setText("#pulse-relations", edges.length);
  setText("#pulse-revision", meta.revision);

  const root = nodesById.get("root-logos");
  if (root) {
    setText("#root-summary", root.summary);
  }

  document.querySelector("#logos-list").innerHTML = byType("logos")
    .map((node) => renderNodeCard(node, relationsFor(node)))
    .join("");

  document.querySelector("#vocabulary-list").innerHTML = byType("vocabulary")
    .map((node) => renderNodeCard(node, relationsFor(node)))
    .join("");

  document.querySelector("#statement-list").innerHTML = byType("living-statement")
    .map((node) => renderCompactNode(node, relationsFor(node)))
    .join("");

  document.querySelector("#bridge-list").innerHTML = byType("bridge")
    .map((node) => renderCompactNode(node, relationsFor(node)))
    .join("");

  document.querySelector("#field-note-list").innerHTML = byType("field-note")
    .map((node) => renderCompactNode(node, relationsFor(node)))
    .join("");

  document.querySelector("#artifact-seed-list").innerHTML = byType("artifact-seed")
    .map((node) => renderCompactNode(node, relationsFor(node)))
    .join("");

  document.querySelector("#open-question-list").innerHTML = byType("open-question")
    .map((node) => renderCompactNode(node, relationsFor(node)))
    .join("");

  document.querySelector("#revision-list").innerHTML = byType("revision")
    .map(renderRevision)
    .join("");

  renderNetwork(nodes, edges, nodesById);
  renderRelationshipLedger(edges, nodesById);
  renderSearch(nodes, edges, nodesById, "coherence");
  updateDocumentFlow();

  document.querySelector("#concept-search")?.addEventListener("input", (event) => {
    renderSearch(nodes, edges, nodesById, event.target.value.trim());
  });
};

Promise.all([
  fetch("content/constitutional-graph.json").then((response) => {
    if (!response.ok) {
      throw new Error("Unable to load constitutional graph");
    }
    return response.json();
  }),
  fetch("content/export-packets.json").then((response) => {
    if (!response.ok) {
      throw new Error("Unable to load export packets");
    }
    return response.json();
  }),
])
  .then(([graph, packets]) => {
    renderGraphSite(graph);
    renderExportPackets(packets);
  })
  .catch((error) => {
    console.error("Root Logos initialization failed", error);
    const root = document.querySelector(".living-document");
    if (root) {
      root.insertAdjacentHTML(
        "afterbegin",
        '<p class="article-loading">The living document could not be initialized. Please refresh to try again.</p>',
      );
    }
  });
