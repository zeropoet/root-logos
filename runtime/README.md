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

Admissible or promoted observations queue one serialized cultivation wake.
Unreviewed and rejected observations are journaled without waking. Incoming
payloads never become canonical memory merely by arrival.

A steward may append `hold`, `rejected`, `admissible`, or `promoted`
classification events through `/v1/admin/intake/:eventId/classify`. The source
observation is never rewritten. Only `admissible` and `promoted`
classifications queue cultivation.

`ROOT_LOGOS_GIT_PUBLISH=0` is the safe deployment default. Set it to `1` only
after the server has a narrow GitHub deploy credential and branch publication
has been intentionally transferred from GitHub Actions.

See `openapi.yaml` for the UI-facing contract.
