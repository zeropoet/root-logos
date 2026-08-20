# Root Logos Runtime

The runtime is a thin, durable boundary around the existing Cultivation
Chamber. It does not replace cultivation policy, canonical files, cycle
lineage, or Git publication authority.

In ordinary operation the runtime requires no steward orchestration. Human
contribution is limited to adding a Library work or submitting a Journal entry.
Those arrivals wake the complete transformation, judgment, topology, visual,
resonant, self-authorship, archival, and publication chain. Administrative
tokens and endpoints exist for recovery, revocation, migration, and
verification—not as required creative stages.

## Run locally

```sh
export ROOT_LOGOS_INTAKE_SECRET="$(openssl rand -hex 32)"
export ROOT_LOGOS_ADMIN_TOKEN="$(openssl rand -hex 32)"
export ROOT_LOGOS_JOURNAL_SECRET="$(openssl rand -hex 32)"
export ROOT_LOGOS_JOURNAL_ENABLED=1
npm run runtime
```

The process binds to `127.0.0.1:8787` by default. A TLS reverse proxy should be
the only public listener. Runtime state and the append-only intake journal are
stored in `.runtime-data/` locally or `ROOT_LOGOS_DATA_DIR` in production.

## Authentication

An intake signature is:

```text
sha256=HMAC_SHA256(ROOT_LOGOS_INTAKE_SECRET, timestamp + "." + exact_body)
```

Send it in `X-Rootlogos-Signature` with the same ISO timestamp in
`X-Rootlogos-Timestamp`. Timestamps older than five minutes are rejected.
Human wake commands use `Authorization: Bearer <ROOT_LOGOS_ADMIN_TOKEN>`.

The public site never receives either secret. `POST /v1/public/intake`
validates and rate-limits one public entry, creates a single-use Source Grant,
transforms the source through encrypted transient quarantine, releases its
wording, and autonomously judges the derived structure. Admissible structure
wakes cultivation immediately. There is no second public intake mode and no
steward classification step.

## Authority and publication

Autonomously admitted observations queue one serialized cultivation wake. The
worker materializes a private wake context from the immutable observation and
passes it into cultivation as attributable evidence. It is not treated as
canonical truth. The resulting cycle preserves the intake event ID,
disposition, self-prompt, resonance findings, judgment, and response lineage.
Rejected observations are journaled as derived-only lineage without waking.
Incoming payloads never become canonical memory merely by arrival.

Historical administrator classification events remain readable for lineage,
but the public path neither requests nor waits for classification. Root Logos
makes the admission judgment autonomously. All ordinary proposal, privacy,
coherence, and judgment gates still apply.

Production convergence is bidirectional:

- GitHub's `deploy-runtime.yml` sends each `main` commit SHA to the fixed,
  secret-authenticated `/v1/internal/deploy` boundary. The runtime waits for an
  active wake to finish, rebases to `main`, exits cleanly, and systemd restarts
  it from the converged checkout.
- With `ROOT_LOGOS_GIT_PUBLISH=1`, cultivation commits only its bounded lineage
  files and refreshed public material-witness snapshots, rebases against
  concurrent GitHub work, and pushes through a
  repository-scoped write deploy key.

Before every serialized wake, the runtime scans Sovereign Standard's public
external-relation export and refreshes the FoldPortrait-to-vessel relations used
by the Living Object. A missing identity, changed archived render hash, invalid
witness, or prohibited private field fails the wake before cultivation.

GitHub Actions authenticates the deploy request with its per-job OIDC identity.
Set `ROOT_LOGOS_GITHUB_OIDC_AUDIENCE=root-logos-runtime` in the server environment
and set the matching `ROOT_LOGOS_OIDC_AUDIENCE` repository variable. The runtime
verifies GitHub's signature, audience, immutable repository ID, `main` ref,
workflow path, and commit SHA before convergence. `ROOT_LOGOS_DEPLOY_TOKEN`
remains only as a zero-downtime cutover fallback while that environment value is
present and should be deleted after the first verified OIDC deployment. The runtime SSH key remains a
writable repository-scoped deploy key because the server itself publishes
bounded cultivation commits. No endpoint accepts arbitrary commands.

See `openapi.yaml` for the UI-facing contract.

## Journal Membrane

Revision 0.9 defines the autonomous path for explicitly added or granted
journal entries. Addition is the delegation event; the operational journal
worker does not require steward classification for each entry.
It privately processes and transforms the source, releases the working prose,
make an attributable admission judgment with counterargument and risk evidence,
wake cultivation for qualifying material, and permit reversible construction
inside the delegated build boundary.

The local-drop path is active in `server.mjs` and `journal/policy.json`.
Authenticated administrator endpoints create or revoke explicit Source Grants,
inspect derived-only lineage, and request collection. Files are accepted only
from a directory named for an active grant beneath
`ROOT_LOGOS_JOURNAL_DROP_DIR` (or the private runtime data directory by
default). The collector seals raw bytes into AES-256-GCM quarantine, removes
the drop source, transforms in memory, releases quarantine, and durably keeps
only digests, derived structures, autonomous judgment, and lineage.

The public terminal exposes one boundary. Every submission is public and is
itself the authorization event: the runtime creates a single-use Source Grant,
hands the entry to the encrypted transformation path, closes the grant after
release, and autonomously wakes cultivation when the derived structure is
admissible. No login, mode choice, or subsequent review is required. Raw
content is never returned by an API or included in derived-only journal
inspection.

The serialized self-authorship worker is active for completed runtime
cultivation cycles. It judges whether an implemented topology change requires
an identity rewrite, archives the prior manifest and its counterargument, then
atomically replaces the single current identity. Rejected or immaterial cycles
produce preserve-current lineage instead of synthetic change.
