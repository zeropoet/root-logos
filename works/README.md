# Living Works

Root Logos receives one bounded work at a time and preserves each transformation as a paired visual and resonant edition.

The source remains an immutable witness. A derived edition is not a summary or replacement: it is Root Logos’ attributable reading of the work at a particular constitutional revision. Later revisions may produce new editions without overwriting the earlier visual, score, interpretation, or lineage.

Library addition is the complete human action. Once a work crosses the source
membrane, Root Logos performs structural reading, topology derivation, visual
formation, FoldForge-aware scoring, sovereign-voice recomposition,
self-reading, archival publication, and lineage preservation without manual
composition or approval. There is no unfinished audio stage after ingestion.

## Ingest a Markdown work

```sh
node scripts/works.mjs ingest /path/to/work \
  --title "The Book of Genesis" \
  --author "Traditional attribution" \
  --kind "scripture" \
  --source "https://github.com/example/repository/tree/main/Genesis" \
  --translation "Named source translation" \
  --language "en" \
  --rights "Public domain in the United States" \
  --revision "v1.0"
```

A directory is read recursively in natural filename order. Markdown headings become passage coordinates. Files become documents, books, chapters, scenes, poems, or other source-defined units without imposing a single literary hierarchy.

Each ingestion writes:

- `manifest.json`: stable identity and source witness for the work;
- `edition.json`: the derived Work Graph, visual score, resonant score, and interpretation;
- `index.json`: the public archive entry used by the Root Logos interface;
- `assets/library-first-frames/NN-work-id-SHA12.png`: a canonical 2400×2400
  isolated portrait of the current work.

The portrait resolves the current visual graph at its initial orientation and
2× device scale, then removes every interface, label, axis, horizon, and
decorative layer. Only white relational lines and white nodes remain on pure
black. `assets/library-first-frames/manifest.json` witnesses its Library order,
work and edition identity, dimensions, renderer, path, and SHA-256. Filenames
are content-addressed: whenever the pixels change, the SHA-256 suffix changes
the public URL and makes stale browser or CDN reuse impossible. The manifest
points only to the current portrait; immutable edition history remains in
`works/`.

First-frame rendering is part of both the single-work and complete-corpus
ingestion paths. It is not a manual publication step. Recovery and validation
remain available explicitly:

```sh
npm run works:first-frames
node scripts/work-first-frame.mjs --check
```

Every resonant edition also inherits the current witnessed FoldForge
composition contract. The edition preserves the FoldForge source witness,
active grammar IDs and versions, and attributable lexical score events. Because
that witness participates in edition identity, a changed FoldForge composition
creates a child recording rather than mutating an earlier one. The runtime
performs this convergence through the normal source-wake path. The explicit
command remains a deterministic recovery and migration tool:

```sh
npm run works:recompose-foldforge
```

Re-reading the same source under a later Root Logos revision creates another edition. Editions are intended to be immutable and navigable through time.

## Private-source membrane

A work can be transformed without publishing or retaining its source inside
Root Logos:

```sh
node scripts/works.mjs ingest /private/path/book.json \
  --format "douay-rheims-json" \
  --source-visibility "private" \
  --source-witness "opaque-dataset-identity@revision"
```

In this mode, the public archive receives only the stable work identity,
translation and rights witness, source SHA-256, derived graph, paired scores,
and edition lineage. It does not receive the repository URL, local path,
filenames, verses, annotations, or source prose. `.private-sources/` and
`private-works/` are ignored as an additional local safety boundary.

The transformation grammar is part of edition identity. If Root Logos changes
how it reads—even without a constitutional revision—the prior reading remains
archived and the corrected reading becomes a child edition.

## Complete private corpus

The canon-aware corpus command serially transforms the 73-book Catholic canon:

```sh
npm run works:corpus -- /private/path/original-douay-rheims \
  --source-witness "opaque-dataset-identity@revision" \
  --revision "v1.1"
```

It preserves the canonical order of 46 Old Testament and 27 New Testament
works, while witnessing 3 Esdras, 4 Esdras, and the two Prayer of Manasses
source variants as unclassified supplements rather than silently treating them
as canonical books.

`corpora/original-douay-rheims.json` drapes the first aggregate fabric across
the individual works. It contains book-level measures, dominant derived
concepts, cross-work relations, a navigable Whole Canon visual object, and a
deterministic corpus score. Every book remains independently addressable and
retains its own future edition lineage.

The 66-book King James Bible uses the same completed-work boundary without
publishing its source prose:

```sh
npm run works:protestant-corpus -- /private/path/bible-data \
  --source-witness "midvash/bible-data@<pinned-commit>" \
  --revision "v1.2"
```

The adapter accepts only the declared public-domain Oxford 1769 KJV witness and
requires exactly 39 Old Testament books, 27 New Testament books, 1,189
chapters, and 31,102 verses. It first gives every book an independent derived
edition, then calculates cross-book language, distinctiveness, outward pressure,
canonical position, tensile relations, and corpus score before compiling one
coherent Library selection. The source language is released after each book
reading; the public corpus retains only attributable structures, aggregate
topology, score, lineage, Founding Constitution reread, and first-frame
portrait. Recompilation creates a child corpus edition rather than overwriting
the earlier 66-document reading.

The archive’s highest-level view is the **Library Field**, derived directly
from `index.json`. Collections form independently bounded middle-distance
structures; works occupy their deep-field orbits. These edges witness
containment only. Cross-collection semantic relations are not displayed until
Root Logos has actually derived them.

The Odyssey is the first work beyond the scriptural corpus and establishes the
`Classical Epics / Ancient Greek Epic` boundary. Its arrival also changes the
archive filters from translation-specific Old/New Testament controls to
library-scale Canon, Literature, and Root Logos views.

The Constitution of the United States of America is ingested as the original
signed 1787 instrument: seven articles, including the convention signatures,
without silently treating later amendments as part of that source edition.
Its Project Gutenberg/GITenberg transcription enters through the
private-source membrane; the public Library retains the immutable Git commit
witness, source hash, derived topology, resonant score, and Root Logos lineage,
but no transcription.

The twenty-seven ratified amendments are a second coherent work rather than a
silent mutation of the signed 1787 instrument. Their 18 GitHub source files
resolve into 27 internal amendment structures and share the `United States
Constitutional Instruments` collection with the signed Constitution. This
witnesses their legal relation while preserving separate source hashes,
topologies, scores, ordinals, and edition lineages.

Plato's **Republic** enters as one coherent philosophical dialogue containing
its ten books and Jowett's introductory apparatus. Root Logos reads Project
Gutenberg ebook 1497 through the private-source membrane, witnessed from
`GITenberg/The-Republic_1497` at commit
`013f8ef56b6abf6165755ed1a88d4cdcc512be6c`, and retains no source prose. Its
public edition preserves the source hash, 11 structural passages, derived
topology, resonant score, and Root Logos lineage.

**The Federalist Papers** form the third independently bounded work in the
`United States Constitutional Instruments` collection. Root Logos reads all 85
numbered essays from Project Gutenberg ebook 18, including both transmitted
versions of Federalist No. 70, witnessed from
`GITenberg/The-Federalist-Papers_18` at commit
`fc8172eca561443699d3b0fd6c0387e89f0d9f00`. The raw transcription is not
retained; the public archive preserves 87 structural passages, source hash,
derived topology, resonant score, and edition lineage.

Shakespeare's **The Tempest** and **Hamlet** establish the `Shakespearean
Drama` collection in that order. Both are sourced from Standard Ebooks'
structured editions based on Clark and Wright's 1887 Victoria/Globe text.
Standard Ebooks dedicates its contributor work under CC0 and identifies the
source text as public domain in the United States. Root Logos retains no source
prose. *The Tempest* preserves its dramatis personae, five acts, nine scenes,
and epilogue as work `09`; *Hamlet* preserves its dramatis personae, five acts,
and twenty scenes as work `10`. Each has an independently attributable
topology, score, self-reading, and immutable edition lineage.

## Spatial grammar

Living Works uses a deep-space architectural grammar because its archive is
expected to become a library rather than a finite collection. Information is
assigned to four perceptual planes:

1. **Navigation** occupies the foreground and locates the reader.
2. **Instruments** expose search, filtering, editions, and sound.
3. **Interpretation** occupies the inhabitable middle distance.
4. **Topology and lineage** remain in the deep field and on the horizon.

More works, translations, relations, or readings must create greater apparent
scale and navigable distance—not tighter visual packing. Coherence is rendered
as gravity, irreducible difference as antigravity, and cross-work relation as
tensile fabric. Architectural guides, orbital shells, and structural horizons
are semantic orientation devices; they may not imply evidence that is absent
from the derived topology.
