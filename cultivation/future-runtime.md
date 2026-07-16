# Future Runtime Boundary

> Implementation status: the first service boundary now lives in
> `runtime/server.mjs`. It provides signed intake, replay protection, an
> append-only journal, serialized wake execution, human wake commands, and
> read-only status/proposal/cycle APIs. Deployment assets live in `deploy/`.
> GitHub Actions remains the scheduled-audit runner until the server cutover is
> explicitly enabled.

The next hosting form for the Cultivation Chamber should be a small durable
service that can sleep, wake, and receive observations from `rootlogos.com`.
Moving execution off GitHub Actions must not move constitutional authority into
the server.

## Responsibilities

The service may:

- receive signed observation envelopes from approved Root Logos surfaces;
- append those envelopes to an immutable intake journal;
- wake cultivation when an accepted event matches policy;
- serialize cycles so one source snapshot has at most one active inquiry;
- execute the existing prompt, search, memory, judgment, and application phases;
- expose cycle status, dormancy, proposals, and lineage for human inspection;
- return to sleep when no wake condition remains.

It may not:

- treat raw site activity as constitutional evidence;
- use engagement metrics as selection authority;
- rewrite or delete source observations;
- bypass risk classification or human escalation;
- allow an incoming request to alter policy, settled claims, or the autonomy
  boundary directly.

## Intake envelope

Every incoming datum should carry:

- a unique event ID and timestamp;
- source surface and authenticated producer;
- payload type and schema version;
- the unmodified payload or content-addressed reference;
- consent and retention classification;
- provenance signature;
- constitutional relevance status: `unreviewed`, `admissible`, `rejected`, or
  `promoted`.

Raw intake is observation, not memory. Only admissible events enter the
canonical-change wake path, and only reviewed promotion changes Root Logos.

## Wake conditions

The worker should wake for:

1. an admissible new observation;
2. a canonical revision or policy change;
3. an elapsed incubation threshold for a remembered hypothesis;
4. a scheduled low-frequency audit while not dormant; or
5. an explicit human command.

It should remain asleep when incoming data is duplicative, unauthenticated,
inadmissible, or unrelated to constitutional state.

## Portability contract

The server should call the same cultivation commands and persist the same state,
memory, cycle, and policy schemas used in the repository. Git remains the
constitutional publication and audit boundary until a later revision explicitly
replaces it. This allows runtime hosting to change without changing the meaning
of cultivation.

## Interface boundary

The public inspection surface is versioned under `/v1`. It exposes cultivation
status, cycle lineage, and proposals but does not expose intake payloads or
secrets. Mutation is split into two separately authenticated paths:

- `POST /v1/intake` requires an HMAC signature over the timestamp and exact
  request bytes;
- `POST /v1/commands/wake` requires the human administration bearer token.

The interface contract is recorded in `runtime/openapi.yaml`. The new Root
Logos UI should depend on that contract rather than reading repository JSON
directly.

The public membrane and private Antechamber now implement the first complete
admission path. Public arrivals are bounded, rate-limited, signed by the server,
and preserved as `unreviewed`. Steward classifications are appended rather
than substituted. Only an attributable `admissible` or `promoted`
classification may queue a wake.

At wake time the runtime constructs a private, durable intake context and gives
it to the chamber as external evidence. The chamber generates an
observation-specific self-prompt and searches for lexical resonance with the
constitutional graph. Admission permits inquiry, not truth; promotion changes
priority and search breadth, not constitutional authority. Each completed wake
records the responding cultivation cycle and a concise response in the
append-only runtime journal.
