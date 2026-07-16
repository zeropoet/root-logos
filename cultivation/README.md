# The Cultivation Chamber

The Cultivation Chamber is Root Logos' bounded inward autonomy. It turns the
constitution back upon itself without granting the machine constitutional
authority.

Its cycle is:

```text
Canonical memory → Self-prompt → Structural search → Hypotheses
→ Evidence → Evaluation → Human threshold → Proposed revision
```

The engine is deliberately resumable. Every transition is written to
`cultivation/state.json`; every cycle has an append-only evidence record in
`cultivation/cycles/`. Historical policies remain content-addressed in
`cultivation/policies/`, so old judgment lineage survives policy evolution. A process can stop after any command and continue later
without relying on chat memory.

## Commands

```sh
node scripts/cultivate.mjs start
node scripts/cultivate.mjs step
node scripts/cultivate.mjs pause
node scripts/cultivate.mjs resume
node scripts/cultivate.mjs status
node scripts/cultivate.mjs validate
node scripts/cultivate.mjs cycle
node scripts/cultivate.mjs judge RL-CULT-0005
node scripts/cultivate.mjs review RL-CULT-0003 accept --by "human name" --note "reason"
node scripts/cultivate.mjs apply RL-CULT-0003
```

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

## Automatic triggers

The Cultivation Chamber re-interrogates Root Logos under three conditions:

1. after a push to `main` changes the constitutional graph, export history,
   preserved canonical Markdown, or cultivation policy;
2. weekly on Sunday at 14:07 UTC (10:07 AM Eastern during daylight saving
   time); or
3. when a human starts the workflow manually.

Automation is serialized so two cycles cannot cultivate the same source state
concurrently. The workflow commits cycle memory and any authorized refactoring
back to `main`. GitHub does not recursively trigger workflows from pushes made
with its workflow token, preventing self-amplifying audit loops.

The lifecycle regression test runs in a temporary copy and does not touch the
real chamber state:

```sh
node scripts/cultivate.test.mjs
```
