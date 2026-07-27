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

Re-reading the same source under a later Root Logos revision creates another edition. Editions are intended to be immutable and navigable through time.
