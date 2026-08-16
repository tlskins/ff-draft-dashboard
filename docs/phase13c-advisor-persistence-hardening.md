# Phase 13C live acceptance and advisor-persistence hardening

Phase 13C closes the release-critical issue discovered during the
human-directed Phase 13 acceptance on 2026-08-16. It changes only the local
advisor persistence boundary and its CORS support. It does not modify ranking,
recommendation, opponent-model, extension selector, or draft-event semantics.

## Human acceptance evidence

The unpacked 0.0.0.8 extension connected the authoritative dashboard to a full
12-team ESPN standard snake mock. The canonical store retained 167 unique
modeled picks with no duplicate event IDs or duplicate overall-pick records.
All 25 omitted provider-board selections were K or D/ST, which are deliberately
outside the QB/RB/WR/TE advisor universe. After draft completion, a hard refresh
and completed-session reselection reconstructed the modeled roster without
duplicates.

MetaMask injected a rejected connection promise into the dashboard tab and
caused Next's development overlay to obscure the app. Its stack originated in
the MetaMask `chrome-extension://` script, not Drafty. Serving the successful
production export isolated the Drafty runtime and allowed acceptance to
continue. This is an operational local-development limitation, not a Drafty
release failure.

VoiceOver and physical-device verification remain explicitly deferred. GPT
Realtime text and voice promotion, prediction-v2 promotion, deployment, and
push are not part of this closeout.

## Release blocker and repair

The recommendation and opponent-forecast endpoints accept `PUT`, but the API's
CORS response previously advertised only `GET, POST, OPTIONS`. Browser
preflights therefore prevented both writes. The API now advertises
`GET, POST, PUT, OPTIONS` for configured local origins, with a route-level
preflight regression.

The browser also queued a fresh session POST and two snapshot PUTs after every
effect-triggering rerender. The dashboard now owns a bounded persistence
coordinator with these guarantees:

- materially equivalent evidence is attempted once;
- recommendation or forecast evidence changes still publish even if the input
  fingerprint is unchanged;
- while one request is active, intermediate queued states collapse to the
  latest state;
- a failed state stays local instead of retrying after every equivalent
  rerender; and
- a later material state remains eligible to publish.

## Verification

The closeout ran:

- all 135 API unit tests;
- all 555 enabled dashboard tests, with the existing two skips unchanged;
- `tsc --noEmit`, lint, and the production build;
- an actual HTTP `OPTIONS` preflight for a recommendation `PUT`; and
- the live local ESPN replay E2E, including recommendation and
  opponent-forecast persistence and reload.

The Phase 13A full preflight executable gates pass. Its repository-cleanliness
gate becomes authoritative only after the coordinated dashboard and API
commits land.

## Rollback

The API change is additive CORS metadata; the storage contract and schema do
not change. Roll back the dashboard coordinator first, followed by the API CORS
commit. Existing draft events and advisor snapshots require no migration or
deletion.
