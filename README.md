# Fantasy Football Draft Dashboard

A Next.js draft board with a Chrome extension that reads ESPN and NFL draft
rooms. The app can run entirely from its embedded rankings or load the latest
snapshot from the companion Flask API.

Current implementation status and post-Phase-7 execution live in
[docs/roadmap-2026.md](docs/roadmap-2026.md). Use
[docs/session-packets/TEMPLATE.md](docs/session-packets/TEMPLATE.md) for
bounded Codex sessions; the main planning thread owns integration and
promotion decisions.

## Local setup

Requires Node 22.

```bash
corepack yarn install
corepack yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

To use the API rankings, copy `.env.example` to `.env.local` and run the API on
port 5000. If the API is unavailable, the dashboard automatically falls back
to `behavior/playerData.json`.

## Stateless production API

The dashboard treats `NEXT_PUBLIC_API_HOST` as a **read-only** data boundary:
rankings, data readiness, historical comparison/query, and player-status
requests can use the API without enabling any browser-state writes. For the
Cloud Run production build, set:

```bash
NEXT_PUBLIC_API_HOST=https://<your-cloud-run-service>.run.app
NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED=true
NEXT_PUBLIC_DRAFT_SESSION_PERSISTENCE_ENABLED=false
NEXT_PUBLIC_ADVISOR_SNAPSHOT_PERSISTENCE_ENABLED=false
NEXT_PUBLIC_RANKING_PROFILE_PERSISTENCE_ENABLED=false
NEXT_PUBLIC_REALTIME_ADVISOR_ENABLED=false
```

Draft events, advisor calculations, draft plans, and custom rankings remain in
the browser. A loopback API retains the legacy local-development defaults for
the three persistence flags; public deployments must opt into each write path
separately after authentication and durable storage exist. `NEXT_PUBLIC_*`
values are embedded at build time, so changing the API URL or any feature flag
requires a dashboard rebuild and redeploy.

The tracked `.env.production` records the reviewed Cloud Run origin as
`DRAFTY_PRODUCTION_API_HOST`; `next.config.js` maps it to
`NEXT_PUBLIC_API_HOST` during production builds. This keeps an old hosting
platform variable from silently overriding the release while preserving the
loopback `.env.local` workflow for development.

After every configured roster slot has been drafted, the live advisor exposes
**Export replay fixture**. For ESPN, open the completed room's **Board** tab so
the extension can capture every pick even if the scrolling history omitted
early rows. The validated export includes league settings, positional ranks
and user tiers, projection ranges, replacement levels, snake-draft ownership,
canonical platform pick order, and explicit K/DST exclusions. Review player
identity mappings before adding recorded fixtures under `__tests__/fixtures/`.
If the dashboard was open during the live draft, the same export can include
bounded local pre-pick opponent forecast evidence. It is never reconstructed
from a completed board opened after the fact; older exports remain valid and
report those opponent metrics as unavailable.
Before downloading, the advisor now shows a local replay preflight with board,
label, and window counts. Confirm the summary; a malformed optional label set
is blocked from normal export, while an explicit roster-only recovery remains
available. This is declared local evidence, not source authentication.
Record live calibration evidence through the versioned campaign manifest, not
by setting `provenance` on a fixture: see
`docs/phase4-calibration-campaign.md` and run `npm run calibration:campaign --
--manifest calibration-campaign/phase4-espn.json`.

Set `NEXT_PUBLIC_HISTORICAL_COMPARISON_ENABLED=true` to enable the feature-
flagged weekly-distribution comparison. The manual view can switch among the
latest one-, three-, and five-season windows. The companion API must have those
seasons imported with `scripts/import_nflverse_weekly.py`.

## Chrome extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this repository's `public` directory.
4. Reload the unpacked extension after changing
   `public/espnDraftExtractor.js`, `public/contentScript.js`,
   `public/background.js`, or `public/manifest.json`.

The extension sends versioned, full draft snapshots and keys ESPN sessions by
league ID so repeated mocks with the same title cannot merge. The dashboard
also accepts the legacy incremental message shape so an installed older
extension does not have to be upgraded in lockstep. Local extension version
`0.0.0.8` adds scheduled-board completion checks to the versioned ESPN
selector-health reports. The dashboard remains
quiet while capture is healthy and visibly warns when the ESPN draft layout is
unavailable or only partially readable.

## Verification

```bash
corepack yarn tsc --noEmit
corepack yarn test --runInBand
corepack yarn build
corepack yarn eval
```

The static export post-build step is implemented in Node and works on macOS and
Linux.

## Realtime advisor

The model-independent advisor contract lives in `behavior/draft-advisor`.
`behavior/realtime` adds typed Realtime tools, a proposal/confirmation state
machine, a session-local draft plan, and a deterministic mock transport. The
Flask API mints short-lived browser client secrets without exposing the
standard OpenAI API key. The dashboard now has an explicit-connect,
selectable text/voice WebRTC client with streamed transcripts,
microphone mute, server-VAD interruption, application-owned tool dispatch,
bounded reconnection, response cancellation, and cooldown-limited advice when
a material draft threshold changes. Set `OPENAI_API_KEY` in the companion API's
environment to try it; never add that key to `.env.local`. See
`docs/realtime-draft-advisor.md` for the boundary and UX data flow.

## Player status enrichment

Phase 6 starts with a provider-neutral structured status boundary. The API
deduplicates semantic status changes in SQLite and exposes bounded player
history with source, timestamps, confidence, impact, and explicit staleness.
The generated dashboard client treats missing providers as an empty result and
uses only the newest state per provider channel for recommendation flags. See
`docs/player-status.md`.

## Phase 7 acceptance

Run `npm run e2e:espn` to replay the complete recorded ESPN mock through the
extension-format feed, dashboard reducer, a disposable live Flask/SQLite
process, and advisor snapshot persistence. The harness requires the companion
API repository and its `.venv` as a sibling directory. See
`docs/phase7-hardening.md` for the acceptance and recovery matrix.

## Local data recovery

The **Data and recovery** control exports a portable, human-readable v1 JSON
file containing only local custom positional ranks/tiers, supported league and
board preferences, draft slot, player targets, and confirmed plan text. Import
validates the whole file before a replacement preview and is available only
before the first pick, so a live board cannot mix two ranking profiles. Nothing
is uploaded. Run `npm run portability:phase7` for the focused validation,
rollback, and accessible confirmation coverage.
