# Living Works

Root Logos receives one bounded work at a time and preserves each transformation as a paired visual and resonant edition.

The source remains an immutable witness. A derived edition is not a summary or replacement: it is Root Logos’ attributable reading of the work at a particular constitutional revision. Later revisions may produce new editions without overwriting the earlier visual, score, interpretation, or lineage.

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
- `index.json`: the public archive entry used by the Root Logos interface.

Every resonant edition also inherits the current witnessed FoldForge
composition contract. The edition preserves the FoldForge source witness,
active grammar IDs and versions, and attributable lexical score events. Because
that witness participates in edition identity, a changed FoldForge composition
creates a child recording rather than mutating an earlier one. Existing
coherent works and the consolidated corpus can be converged explicitly with:

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
