# Root Logos Runtime

The runtime is a thin, durable boundary around the existing Cultivation
Chamber. It does not replace cultivation policy, canonical files, cycle
lineage, or Git publication authority.

## Run locally

```sh
export ROOT_LOGOS_INTAKE_SECRET="$(openssl rand -hex 32)"
export ROOT_LOGOS_ADMIN_TOKEN="$(openssl rand -hex 32)"
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
validates a bounded observation, rate-limits its network source, signs its
provenance on the server, and journals it as `unreviewed`. The private
Antechamber uses the administrator credential in volatile page memory only;
refreshing or closing the page forgets it.

## Authority and publication

Admissible or promoted observations queue one serialized cultivation wake. The
worker materializes a private wake context from the immutable observation and
passes it into cultivation as attributable evidence. It is not treated as
canonical truth. The resulting cycle preserves the intake event ID,
disposition, steward note, self-prompt, resonance findings, judgment, and
response lineage.
Unreviewed and rejected observations are journaled without waking. Incoming
payloads never become canonical memory merely by arrival.

A steward may append `hold`, `rejected`, `admissible`, or `promoted`
classification events through `/v1/admin/intake/:eventId/classify`. The source
observation is never rewritten. Only `admissible` and `promoted`
classifications queue cultivation. `promoted` does not grant mutation
authority; it gives the observation first inquiry position, widens the number
of constitutional resonances inspected, and assigns the highest bounded
novelty weight. All ordinary proposal and judgment gates still apply.

Production convergence is bidirectional:

- GitHub's `deploy-runtime.yml` sends each `main` commit SHA to the fixed,
  secret-authenticated `/v1/internal/deploy` boundary. The runtime waits for an
  active wake to finish, rebases to `main`, exits cleanly, and systemd restarts
  it from the converged checkout.
- With `ROOT_LOGOS_GIT_PUBLISH=1`, cultivation commits only its bounded lineage
  files, rebases against concurrent GitHub work, and pushes through a
  repository-scoped write deploy key.

The GitHub Actions secret and server environment must share
`ROOT_LOGOS_DEPLOY_TOKEN`. The runtime SSH key must be registered as a writable
deploy key for this repository. No endpoint accepts arbitrary commands.

See `openapi.yaml` for the UI-facing contract.

## Planned journal worker

Revision 0.9 defines a separate autonomous path for explicitly added or granted
journal entries. Addition is the delegation event; unlike public intake, the
future journal worker will not require steward classification for each entry.
It will privately process and transform the source, release the working prose,
make an attributable admission judgment with counterargument and risk evidence,
wake cultivation for qualifying material, and permit reversible construction
inside the delegated build boundary.

This path is not active in `server.mjs`. Its disabled policy, envelope schema,
privacy exclusions, phased implementation plan, and acceptance gates live in
`journal/` and `content/journal-membrane.md`. The existing public intake and
Antechamber behavior remain unchanged until that separate worker is built and
verified.

The subsequent self-authorship worker is likewise planned, not active. Its
contract in `self-authorship/` permits continual autonomous rewriting and
publication of one canonical Root Logos identity while requiring cross-surface
consistency, complete lineage, atomic replacement, and rollback.
