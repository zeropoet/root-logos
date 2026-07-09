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

const graphTiers = [
  ["root-logos"],
  ["logos-1", "logos-2", "logos-3"],
  ["knowing", "participation", "observation", "freedom", "substrate", "coherence"],
  ["living-statement-001", "living-statement-002", "living-statement-003", "living-statement-004"],
  ["bridge-001", "bridge-002", "field-note-peace-home", "seed-topology-recorder", "seed-neuro-hug"],
  ["export-mechanism", "export-packet", "revision-0.1"],
];

const setActiveLink = (id) => {
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.hash === `#${id}`);
  });
};

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

  const review = () => {
    if (!input || !preview) {
      return;
    }
    try {
      preview.innerHTML = renderPacketPreview(parsePacket(input.value));
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
  review();
};

const setText = (selector, value) => {
  const element = document.querySelector(selector);
  if (element && value) {
    element.textContent = value;
  }
};

const renderGraph = (nodesById) => {
  const board = document.querySelector("#graph-board");
  if (!board) {
    return;
  }

  board.innerHTML = graphTiers
    .map(
      (tier, index) => `
        <div class="graph-tier" data-tier="${index}">
          ${tier
            .map((id) => nodesById.get(id))
            .filter(Boolean)
            .map(
              (node) => `
                <button class="graph-node" type="button" data-node="${escapeHtml(node.id)}">
                  <span>${escapeHtml(node.label || typeLabels[node.type])}</span>
                  ${escapeHtml(node.title)}
                </button>
              `,
            )
            .join("")}
        </div>
      `,
    )
    .join("");
};

const renderInspector = (node, edges, nodesById) => {
  const title = document.querySelector("#node-title");
  const description = document.querySelector("#node-description");
  const meta = document.querySelector("#node-meta");
  const relationships = document.querySelector("#node-relationships");

  if (!node || !title || !description || !meta || !relationships) {
    return;
  }

  const relations = getRelations(node.id, edges, nodesById);
  title.textContent = node.title;
  description.textContent = node.definition || node.summary || "";
  meta.innerHTML = `
    <div><dt>Type</dt><dd>${escapeHtml(typeLabels[node.type] || node.type)}</dd></div>
    <div><dt>Status</dt><dd>${escapeHtml(node.status || "Active")}</dd></div>
    ${node.answers ? `<div><dt>Answers</dt><dd>${escapeHtml(node.answers)}</dd></div>` : ""}
  `;
  relationships.innerHTML = relations.length
    ? relations
        .map(
          ({ edge, node: related }) => `
            <a href="${escapeHtml(slugHref(related))}">
              <span>${escapeHtml(relationVerb(edge, node.id))}</span>
              ${escapeHtml(related.title)}
            </a>
          `,
        )
        .join("")
    : "<p>No relationships recorded yet.</p>";

  document.querySelectorAll(".graph-node").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.node === node.id);
  });
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

  renderGraph(nodesById);
  renderInspector(root, edges, nodesById);
  renderSearch(nodes, edges, nodesById, "coherence");

  document.querySelectorAll(".graph-node").forEach((button) => {
    button.addEventListener("click", () => {
      renderInspector(nodesById.get(button.dataset.node), edges, nodesById);
    });
  });

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
  .catch(() => {
    const root = document.querySelector(".living-document");
    if (root) {
      root.insertAdjacentHTML(
        "afterbegin",
        '<p class="article-loading">The constitutional graph could not be loaded.</p>',
      );
    }
  });
