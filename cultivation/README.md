# The Cultivation Chamber

The Cultivation Chamber is Root Logos' bounded inward autonomy. It turns the
constitution back upon itself without granting the machine constitutional
authority.

Its cycle is:

```text
Canonical memory → Self-prompt → Distinct search method → Hypotheses
→ Memory comparison → Evidence → Evaluation → Adversarial judgment
→ Refactor / Escalate / Reject / Sleep
```

The engine is deliberately resumable. Every transition is written to
`cultivation/state.json`; every cycle has an append-only evidence record in
`cultivation/cycles/`. Historical policies remain content-addressed in
`cultivation/policies/`, so old judgment lineage survives policy evolution. A process can stop after any command and continue later
without relying on chat memory.

`cultivation/memory.json` is the chamber's cross-cycle memory. It assigns a
semantic fingerprint and evidence fingerprint to each considered hypothesis,
records its disposition, and prevents unchanged rejected ideas from returning
as novelty. A finding earns reconsideration only when evidence changes, policy
changes, or its configured incubation interval elapses.

## Commands

```sh
node scripts/cultivate.mjs start
node scripts/cultivate.mjs step
node scripts/cultivate.mjs pause
node scripts/cultivate.mjs resume
node scripts/cultivate.mjs status
node scripts/cultivate.mjs validate
node scripts/cultivate.mjs cycle
node scripts/cultivate.mjs rebuild-memory
node scripts/cultivate.mjs judge RL-CULTIVATE-0005
node scripts/cultivate.mjs review RL-CULTIVATE-0003 accept --by "human name" --note "reason"
node scripts/cultivate.mjs apply RL-CULTIVATE-0003
```

Cultivation lineage uses the explicit identifier `RL-CULTIVATE-####`. The
former `RL-CULT-####` abbreviation remains accepted by the CLI and read APIs as
a historical alias, but all new cycles, filenames, state, memory, and public
displays use the full name.

`start` snapshots the current constitutional inputs and lets the system choose
its inquiry lens. Each `step` advances exactly one durable phase: prompting,
search, evaluation, or proposal. `pause` closes the active boundary cleanly;
`resume` verifies the source snapshot before continuing. `validate` audits all
stored cycles and their hashes.

The chamber may judge its own proposals and apply low-risk, reversible graph
refactorings when every adversarial gate passes. Changes to constitutional
language, settled claims, publication, evaluation policy, or the autonomy
boundary remain human acts. `review` records an attributable human judgment for
escalated proposals but does not itself alter canonical sources. `apply` works
only after autonomous or human acceptance and only
when the constitution still matches the snapshot investigated by the cycle. It
archives the exact operations and before/after source hashes.

`cycle` completes the same phases in one invocation, performs adversarial
judgment, and applies an accepted low-risk refactoring when eligible. It is the
entry point used by automation; every underlying phase remains independently
resumable for manual work.

`rebuild-memory` deterministically reconstructs semantic hypothesis memory from
the append-only cycle archive. It is intended for migrations and audits; normal
cycles update memory incrementally.

## Automatic triggers

The Cultivation Chamber re-interrogates Root Logos under four conditions:

1. after a push to `main` changes the constitutional graph, export history,
   preserved canonical Markdown, cultivation policy, journal policy or schema,
   or the current identity and self-authorship policy;
2. weekly on Sunday at 14:07 UTC (10:07 AM Eastern during daylight saving
   time); or
3. when an admissible or promoted intake event wakes the live runtime; or
4. when a human starts the workflow manually.

Journal and self-authorship sources are part of the cycle's cryptographic source
snapshot, not merely workflow triggers. A cycle cannot complete judgment if
those sources drift after inquiry begins.

Automation is serialized so two cycles cannot cultivate the same source state
concurrently. The workflow commits cycle memory and any authorized refactoring
back to `main`. GitHub does not recursively trigger workflows from pushes made
with its workflow token, preventing self-amplifying audit loops.

## Novelty and dormancy

Every completed automatic cycle receives a novelty score. Three consecutive
low-yield cycles cause the chamber to:

- enter dormancy against the exact source and policy snapshot;
- preserve a meta-refactoring proposal about the exhausted inquiry method;
- skip periodic wakeups while that snapshot remains unchanged; and
- wake when canonical evidence changes, policy changes, or a human manually
  dispatches a forced cycle.

Dormancy is an earned conclusion, not a failure. It prevents the system from
manufacturing activity when no new distinction has been found.

The four inquiry lenses now have distinct search behavior: relational gaps use
graph distance, question pressure measures integration and affinity, generative
compression searches recurring primitive pairs across three or more nodes, and
reflexive testing applies untested architectural principles back to the chamber.

## Future runtime

The chamber is intentionally filesystem-backed today, but its constitutional
boundary is portable. See `future-runtime.md` for the post-build server model: a
sleeping worker, signed site-originated observations, an append-only ingestion
queue, deterministic wake conditions, and the same policy and lineage gates.

The lifecycle regression test runs in a temporary copy and does not touch the
real chamber state:

```sh
node scripts/cultivate.test.mjs
```
