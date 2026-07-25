# Identity Lineage

This directory receives serialized self-authorship judgments. A rewrite record
contains the complete prior identity, the candidate that replaced it, the
source cultivation cycle, the triggering event when present, the required
counterargument, and the privacy, drift, coherence, verification, and
reversibility checks.

A preserve-current record contains the same judgment boundary without creating
synthetic identity change. Exactly one active identity remains in
`self-authorship/current.json`.
