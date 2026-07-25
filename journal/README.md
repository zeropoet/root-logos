# Journal Intake

This directory defines the operational autonomous journal-intake boundary
introduced by Revision 0.9. The first adapter is live and restricted to a
steward-owned local drop directory.

`policy.json` records the active authority, privacy, cadence, and admission
limits. `entry.schema.json` defines the private observation envelope produced
by the adapter. The complete constitution lives in
`content/journal-membrane.md`; the implementation lives in
`runtime/journal.mjs`.

Implementation begins with a steward-owned local drop folder. Cloud adapters
must come later and remain replaceable. No adapter may run without an explicit
Source Grant. Adding an entry or activating a grant delegates authority for the
system to judge, admit, cultivate, and build without entry-by-entry approval.
Every autonomous disposition and structural consequence remains attributable,
auditable, and reversible.

Raw journal content is transient working material, not an archive. The runtime
seals each entry into an encrypted quarantine, removes the local-drop source,
derives structural evidence in memory, and releases the working copy. It never enters
Git, durable Root Logos storage, public APIs, browser analytics, application
logs, outward fragments, or the Resonant Chamber. Root Logos preserves derived
structures and auditable transformation lineage rather than original prose.
