# Authenticated profile sync release boundary

Status: dashboard implementation and automated verification in progress on
2026-08-29. The API contract and Google Cloud infrastructure are landed; the
API and dashboard flags remain independently reversible.

## Scope

The feature synchronizes only:

- canonical ranking profile v2, including unresolved-player tombstones and
  provider provenance;
- the active ranking source label;
- player targets and their earliest acceptable round; and
- provider-baseline and rank/tier override authority needed for later ranking
  refresh reconciliation.

Draft sessions, picks, rosters, advisor plans, forecasts, analysis results,
settings, and notifications remain device-local.

## Local-first behavior

The dashboard does not contact the profile endpoint until Google auth has
resolved and both local rankings and targets have hydrated. The first device
uploads its local profile. An empty new device adopts the cloud profile. When
both first-use copies contain data, or both a known local copy and remote copy
changed, Drafty stops and asks which copy to retain. Cloud writes carry an
expected revision and a per-device mutation ID; a stale write receives `409`
and cannot overwrite the current document.

Remote application commits rankings and targets as one browser-storage
transaction before updating React state. It is disabled once any live-draft
pick exists so syncing cannot reintroduce drafted players or replace the board
during a draft. Offline and API failures retain local data and expose retry.

## Deployment and rollback

The two controls are independent:

- Cloud Run: `USER_PROFILE_PERSISTENCE_ENABLED=true`
- dashboard build: `NEXT_PUBLIC_CLOUD_PROFILE_SYNC_ENABLED=true`

Disable the dashboard flag and redeploy to remove the sign-in/sync client
without changing stored documents. Disable the Cloud Run flag to make the
authenticated endpoint unavailable while preserving Firestore data. The
legacy ranking-history persistence flag remains false; this feature does not
enable that API.

## Acceptance gate

Before broadening Google OAuth beyond its test users:

1. Sign in on production desktop and confirm the existing local rankings and
   targets create revision 1.
2. Sign in from a clean mobile browser and confirm it adopts the cloud copy.
3. Edit a target on mobile and confirm desktop receives it after reload.
4. Create a two-device divergence and confirm neither copy is overwritten
   until an explicit choice is made.
5. Begin a draft and confirm cloud application pauses while local drafting
   continues.

The OAuth consent screen is still in Testing and VoiceOver verification is
deferred. Those facts do not invalidate bounded single-user acceptance, but
must remain visible before inviting other users.
