# Root Logos

Root Logos is a living constitutional grammar and public network-creation field.

The site is not organized as a blog, feed, dashboard, or publication archive.
It is one continuously readable, versioned knowledge system whose public surface
and documentary record are views of the same constitutional network:
Logoi, vocabulary, Living Statements, Constitutional Bridges, Field Notes,
Artifact Seeds, Open Questions, Export Packets, and published revisions.

## Current Shape

- `index.html` renders the public Root Logos interface: interactive network field,
  constitutional relationship ledger, document, search, export review, open
  questions, and revision history.
- `content/constitutional-graph.json` is the typed graph that defines canonical
  concepts, documents, relationships, questions, seeds, and revisions.
- `content/export-packets.json` stores proposed conversation-to-revision export
  packets.
- `script.js` loads the graph and export packets, renders the continuous document,
  powers Network Field inspection, ambient orientation, concept search, the
  relationship ledger, packet validation, and staged update previews.
- `styles.css` contains the black-and-white visual system, typography roles,
  continuous document flow, Network Field, export review UI, and article styling.
- `documents/` contains public archive-document pages.
- `statements/` contains Living Statement, Constitutional Bridge, and Field Note
  article pages.
- `article.js` renders canonical Markdown into article mastheads, metadata, and
  body copy.
- `content/*.md` contains the canonical article/document source text.
- `assets/` contains the Root Logos mark, favicon, touch icon, and social image.

## Constitutional Network

The graph treats each meaningful element as a typed node rather than merely a
page. Current node types include:

- `root`
- `logos`
- `architectural-principle`
- `vocabulary`
- `living-statement`
- `bridge`
- `field-note`
- `artifact-seed`
- `open-question`
- `export-system`
- `revision`

Edges describe relationships such as `contains`, `defines`, `supports`,
`references`, `connects`, `matures into`, `complements`, `proposes`, and
`modifies`.

This keeps the architecture ready for semantic search, relationship navigation,
promotion history, AI-assisted editing, and future revision tooling. The JSON is
canonical; neither the canvas nor the document creates independent relationship
state.

## One Living Document

The public interface is a single reading field rather than a collection of
destinations. A reader moves from declaration to visual relation, constitutional
language, derived work, the relationship ledger, inquiry, revision protocol, and
history without changing routes or managing an outline.

- The header supplies ambient conceptual orientation instead of section menus.
- The progress line shows movement through the whole document.
- The document pulse reports the live node, relationship, and revision counts.
- Constitutional parts remain open and continuous.
- The Network Field is the only visual graph representation.
- Selected-node details sit in a horizontal node horizon beneath the field so
  topology retains the full available width.
- The Relationship Ledger is the exact textual record of every canonical edge.

The visual network and documentary ledger are deliberately different expressions
of the same data: one supports perception; the other supports inspection.

## Architectural Principles

Architectural Principles are reflexive claims: they govern Root Logos itself as
well as the reality it describes. They appear within the Constitutional Grammar
and as a distinct node class in the Network Field.

The first is **The Reflexive Architecture Principle**:

> The grammar must remain subject to its own claims.

Every principle entering Root Logos is therefore also a test of its boundaries,
methods, authorship, preservation, and evolution. Revision and export are not
outside this governance; they are among its primary subjects.

## Export Mechanism

Root Logos evolves through conversation, but it survives through revision.

Export packets are the translation layer between living dialogue and durable
constitutional updates. A packet records:

- what insight emerged
- where it belongs in the architecture
- what existing documents it modifies
- what relationships were created or clarified
- what revision should appear on `rootlogos.com`

The site supports manual YAML-like packet review in the `Exports` portion of the
living document. Packets are validated against the import contract and can be
staged as a graph delta. Staging never mutates the published data: a packet can
propose a change, but the accepted repository revision remains the constitution.

The current browser workflow is intentionally non-destructive:

1. Load or paste a packet.
2. Validate its required constitutional fields.
3. Inspect additions, modifications, removals, and relationships.
4. Stage the proposed graph operations.
5. Accept the change only through a reviewed repository revision.

## Network Field

Revision 0.2 makes the constitutional network the primary public encounter. The
canvas renders the canonical JSON graph, supports node-class filtering, and lets
visitors trace immediate relations without replacing the accessible document
views below it. The former secondary knowledge-graph panel is now a relationship
ledger generated from the same edge data, leaving the Network Field as the one
authoritative visual representation. `Network Creation` and `Network Node` are
now canonical nodes.

The interface is intentionally continuous rather than route-like. Ambient
orientation, a coherence progress line, and a live document pulse allow the
reader to move from visual relation into language without managing a set of
separate destinations.

## Revision 0.3 — Conscious Participation

Revision 0.3 establishes Constitutional Bridge III as the movement from
Awareness through Participation and Responsibility into Stewardship. Awareness,
Responsibility, and Stewardship are canonical vocabulary nodes rather than
prose-only concepts.

Two Field Notes accompany that bridge:

- `FN-004` names architecture as the structure that carries intention after the
  euphoria of beginning recedes.
- `FN-005` names silence as a medium in which the sustaining rhythm beneath noise
  becomes audible.

Together they connect conscious participation to both durable construction and
an inhabitable peace: architecture sustains the work, while silence permits joy
and meaning to return without being forced.

## Canonical Documents

- `000` Root Logos
- `001` Toward a Moral Constitution for Human-Machine Civilization
- `002` The Invisible Substrate
- `CB-I` Participatory Sovereignty
- `003` Constitutional Naturalization
- `CB-II` Freedom Through Non-Possession
- `CB-III` Conscious Participation
- `004` Participation Without Possession

## Canonical Field Notes

- `FN-003` Peace Becoming Home
- `FN-004` Architecture Beyond Euphoria
- `FN-005` The Music in Silence

## Design System

The current identity is strict black and white.

Typography roles:

- Display serif for constitutional titles and major headings.
- Serif body text for reading.
- Monospace for navigation, metadata, labels, revision data, and export/code-like
  surfaces.
- System UI font for Network Field and packet controls.

The brand mark is a framed constitutional grid with a central source axis and
node structure. SVG is the source of truth; PNG fallbacks are generated for
favicon, touch icon, and raster usage.

## Local Preview

The site is static. From the repository root:

```sh
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Validation

Useful checks:

```sh
node --check script.js
node -e "const fs=require('fs'); const g=JSON.parse(fs.readFileSync('content/constitutional-graph.json','utf8')); const p=JSON.parse(fs.readFileSync('content/export-packets.json','utf8')); const ids=new Set(g.nodes.map(n=>n.id)); const missing=g.edges.flatMap(e=>[e.from,e.to]).filter(id=>!ids.has(id)); if(missing.length) throw new Error(missing.join(',')); console.log(g.nodes.length+' nodes, '+g.edges.length+' edges, '+p.length+' export packets')"
```

## Publishing

This repository is configured for GitHub Pages. The `CNAME` file points the site
to `rootlogos.com`.
