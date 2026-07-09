# Root Logos

Root Logos is a living constitutional grammar.

The site is not organized as a blog, feed, or publication archive. It is a
versioned knowledge system where pages are views of a constitutional graph:
Logoi, vocabulary, Living Statements, Constitutional Bridges, Field Notes,
Artifact Seeds, Open Questions, Export Packets, and published revisions.

## Current Shape

- `index.html` renders the public Root Logos interface: document, graph, search,
  export review, open questions, and revision history.
- `content/constitutional-graph.json` is the typed graph that defines canonical
  concepts, documents, relationships, questions, seeds, and revisions.
- `content/export-packets.json` stores proposed conversation-to-revision export
  packets.
- `script.js` loads the graph and export packets, renders the homepage views,
  powers graph inspection, concept search, and manual export packet preview.
- `styles.css` contains the black-and-white visual system, typography roles,
  document layout, graph UI, export review UI, and article styling.
- `documents/` contains public archive-document pages.
- `statements/` contains Living Statement and Constitutional Bridge article pages.
- `article.js` renders canonical Markdown into article mastheads, metadata, and
  body copy.
- `content/*.md` contains the canonical article/document source text.
- `assets/` contains the Root Logos mark, favicon, touch icon, and social image.

## Constitutional Graph

The graph treats each meaningful element as a typed node rather than merely a
page. Current node types include:

- `root`
- `logos`
- `vocabulary`
- `living-statement`
- `bridge`
- `field-note`
- `artifact-seed`
- `open-question`
- `export-system`
- `revision`

Edges describe relationships such as `contains`, `defines`, `supports`,
`references`, `connects`, `questions`, `proposes`, and `modifies`.

This keeps the architecture ready for semantic search, relationship navigation,
promotion history, AI-assisted editing, and future revision tooling.

## Export Mechanism

Root Logos evolves through conversation, but it survives through revision.

Export packets are the translation layer between living dialogue and durable
constitutional updates. A packet records:

- what insight emerged
- where it belongs in the architecture
- what existing documents it modifies
- what relationships were created or clarified
- what revision should appear on `rootlogos.com`

The site currently supports manual YAML-like packet review in the `Exports`
section. This is intentionally a review surface: a packet can propose a change,
but the published site revision remains the constitution.

## Canonical Documents

- `000` Root Logos
- `001` Toward a Moral Constitution for Human-Machine Civilization
- `002` The Invisible Substrate
- `CB-I` Participatory Sovereignty
- `003` Constitutional Naturalization
- `CB-II` Freedom Through Non-Possession
- `004` Participation Without Possession

## Design System

The current identity is strict black and white.

Typography roles:

- Display serif for constitutional titles and major headings.
- Serif body text for reading.
- Monospace for navigation, metadata, labels, revision data, and export/code-like
  surfaces.
- System UI font for controls and graph buttons.

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
node -e "const fs=require('fs'); const g=JSON.parse(fs.readFileSync('content/constitutional-graph.json','utf8')); const p=JSON.parse(fs.readFileSync('content/export-packets.json','utf8')); const ids=new Set(g.nodes.map(n=>n.id)); const missing=g.edges.flatMap(e=>[e.from,e.to]).filter(id=>!ids.has(id)); if(missing.length) throw new Error(missing.join(',')); console.log(g.nodes.length+' nodes, '+g.edges.length+' edges, '+p.length+' export packet')"
```

## Publishing

This repository is configured for GitHub Pages. The `CNAME` file points the site
to `rootlogos.com`.
