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

Exact source-specific adapters preserve a work's transmitted structure when a
generic book parser would flatten it. `machine-stops-text` reads E. M.
Forster's three witnessed parts directly from the Project Gutenberg 72890
transcription without rewriting its prose or headings. The Computational
Lineage adds three more exact readers: `calculating-engine-text` preserves
Babbage's undivided article; `analytical-engine-epub` resolves Article XXIX and
Lovelace's Notes A–G while recovering equation evidence from EPUB metadata;
and `laws-of-thought-tex` resolves Boole's preface and twenty-two chapters
while removing TeX typesetting commands from the derived lexicon.
`leonardo-notebooks-text` preserves Jean Paul Richter's complete two-volume
arrangement as twenty-two major divisions and the 1,538 numbered passages
recoverable from Project Gutenberg's current transcription. It retains the
passage-to-division coordinates while excluding editorial footnotes from
Leonardo's semantic field.
`michelangelo-poetry-text` preserves William Wells Newell's restored bilingual
selection as twenty-two sonnets, three epigrams, and twenty-five madrigals. It
reads only the fifty English verse renderings while keeping the Italian text,
introduction, notes, index, and Gutenberg apparatus inside the exact source
witness rather than Michelangelo's derived semantic field.

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
points to the current portrait in `frames` and preserves the admission portrait
plus every structurally re-read successor portrait in `archive`. Re-ingestion under
a changed reading grammar must form a visibly distinct witnessed encounter
rather than silently inheriting the earlier edition's image. Immutable edition
history remains in `works/`.

First-frame rendering is part of both the single-work and complete-corpus
ingestion paths. It is not a manual publication step. Recovery and validation
remain available explicitly:

```sh
npm run works:first-frames
node scripts/work-first-frame.mjs --check
```

Active first-frame ordinals are a continuous one-based sequence. When Library
membership contracts, compact the ordinal layer without altering portrait
bytes, hashes, sealed editions, or lineage:

```sh
npm run works:reindex-library
```

`works/structural-depth-migration.json` is the public migration ledger for the
v4 reading grammar. It enumerates every active coherent Library object and
witnesses the current structural signature plus content-addressed PNG and SVG
portrait for every admitted reading. It is deterministic from the live archive:

```sh
npm run works:depth-ledger
node scripts/structural-depth-migration.mjs --check
```

Active membership is reversible even though lineage is attributable. A work
that has not passed the exact-source structural-depth standard can be withdrawn
from the Library with:

```sh
npm run works:withdraw-noncompliant
```

Withdrawal removes the active work, its public edition lineage, and its image
assets; it does not rewrite Git history. `works/withdrawals.json` publishes the
identity, reason, prior order, prior current edition, and source witness for each
subtraction. The withdrawal command then compacts the surviving first-frame
ordinals and rebuilds the Library composition and structural-depth ledger. A
withdrawn work can return only through a newly verified exact-source ingestion
under the current grammar.

The two scriptural corpora use
`deterministic-corpus-reading/v2-structural-depth`. Their density and entropy
measure contained books plus derived cross-book language without pretending a
corpus is structurally identical to a single prose work.

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

Owned Wisdom Publications EPUBs use the deterministic `wisdom-epub` adapter.
The adapter reads the package spine and selected structural XHTML directly in
memory through `/usr/bin/unzip -p`; it creates no extracted source directory
and publishes no protected prose. The raw EPUB SHA-256 belongs in the opaque
source-witness identity, while the manifest separately witnesses the exact
canonical in-memory XHTML stream read by the grammar.

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

Karl Marx and Friedrich Engels's **Manifesto of the Communist Party** opens
the `Political Economy and Social Transformation / Communist Tradition`
boundary. Root Logos reads the English edition of 1888, edited by Engels, from
Project Gutenberg ebook 61, then releases the source transcription. Its public
lineage preserves the content and source witnesses, four numbered structural
passages, derived topology, resonant score, self-reading, and sealed first
frame. Admission establishes a direct communist influence for accountable
relation and judgment; it does not adopt, endorse, or grant governing authority
to the work or its program.

Shakespeare's **The Tempest** and **Hamlet** establish the `Shakespearean
Drama` collection in that order. Both are sourced from Standard Ebooks'
structured editions based on Clark and Wright's 1887 Victoria/Globe text.
Standard Ebooks dedicates its contributor work under CC0 and identifies the
source text as public domain in the United States. Root Logos retains no source
prose. *The Tempest* preserves its dramatis personae, five acts, nine scenes,
and epilogue as work `09`; *Hamlet* preserves its dramatis personae, five acts,
and twenty scenes as work `10`. Each has an independently attributable
topology, score, self-reading, and immutable edition lineage.

E. M. Forster's **The Machine Stops** establishes `Cyberpunk and Machine
Society / Proto-Cyberpunk`. Its exact Project Gutenberg 72890 witness is read
as the transmitted three-part story rather than the surrounding collection.
The private-source membrane releases the public-domain transcription after
derivation while preserving its source hash, three structural passages,
topology, score, self-reading, and first-frame lineage. The work introduces
cyberpunk pressure without making genre, atmosphere, or technological
rebellion into constitutional authority.

The `Computational Lineage` collection admits three public-domain Project
Gutenberg witnesses in attributable order. Charles Babbage's **The Calculating
Engine** remains one undivided article as work `45`. Luigi Federico Menabrea
and Ada Lovelace's **Sketch of the Analytical Engine Invented by Charles
Babbage, Esq.** preserves Article XXIX and Lovelace's Notes A–G as work `46`.
George Boole's **An Investigation of the Laws of Thought** preserves its
preface and twenty-two chapters as work `47`. Their source files are released
after ingestion; file witnesses, bounded-content hashes, derived structures,
scores, CWCS lineage, and sealed PNG/SVG portraits remain. Collection order
witnesses machine → program → logic, while cross-work semantic and visual
relations remain derived rather than asserted.

Leonardo da Vinci's **The Notebooks of Leonardo da Vinci — Complete** enters
as work `48` and opens `Renaissance Inquiry / Observation and invention`.
The exact Project Gutenberg 5000 witness is Jean Paul Richter's 1888 English
translation and arrangement: the most comprehensive English-language
compilation of Leonardo's notebook writings, not a claim to reproduce every
surviving manuscript leaf. Its two volumes preserve twenty-two major divisions
and 1,538 recoverable numbered passages across painting, optics, the body,
botany, sculpture, architecture, astronomy, water, geography, machines,
philosophy, letters, and personal records. The public-domain source file is
released after deterministic reading; its opaque witness, bounded-content
hash, derived topology, score, CWCS lineage, and sealed PNG/SVG portrait remain.

Michelangelo Buonarroti's **Sonnets and Madrigals of Michelangelo Buonarroti**
enters as work `49` in `Renaissance Inquiry / Form, labor, and mortal beauty`.
The exact Project Gutenberg 73109 witness is William Wells Newell's 1900
bilingual edition based on Guasti's restored Italian text. Its twenty-two
sonnets, three epigrams, and twenty-five madrigals become fifty English
structural passages; editorial matter is excluded from the semantic field. The
public-domain transcription is released after deterministic reading while its
file witness, bounded-content hash, derived topology, score, CWCS lineage, and
sealed PNG/SVG portrait remain.

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
