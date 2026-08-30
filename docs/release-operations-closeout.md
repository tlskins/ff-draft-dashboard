# Autonomous release-operations closeout

Status: implemented on 2026-08-30. This slice is account-free and read-only
against production. It performs no Chrome Web Store submission, provider login,
draft selection, profile/archive mutation, or human acceptance judgment.

## Commands

```bash
npm run extension:bundle:store
npm run extension:test:relay
npm run extension:test:clean-browser
npm run release:health:production
```

The store-bundle command creates
`release/chrome-web-store/0.0.0.10/` from tracked, verified inputs. The output
contains the exact extension ZIP, icon, small promotional tile, marquee tile,
submission packet, explicit authentic-screenshot reminder, manifest, and
SHA-256 checksum file. It is ignored because it duplicates tracked artifacts.

The clean-browser command resolves the official Chrome for Testing milestone
matching the installed Chrome through Google's Chrome for Testing metadata,
caches it under `node_modules/.cache`, extracts the exact extension ZIP into a
temporary profile, and verifies:

- the Manifest V3 `background.js` service worker starts;
- the popup identifies Drafty Draft Sync and version `0.0.0.10`;
- the production Drafty origin receives heartbeat contract version 1; and
- an unmatched HTTPS origin receives no Drafty extension event.

It intentionally does not claim a logged-in ESPN/NFL.com draft flow or visual
acceptance.

## Production health boundary

`npm run release:health:production` checks:

- the production dashboard manifest plus public privacy/support disclosures;
- exactly one bounded-shape WebMCP origin-trial token without printing it;
- Cloud Run health, 2026 rankings, player count, and a 72-hour maximum ranking
  age;
- exact completed historical seasons 2021–2025;
- available, current 2026 Harris and FantasyPros boards with tier methods;
- unauthenticated profile and completed-mock reads fail closed with HTTP 401.

The August 30 run passed every gate. It retained three honest non-blocking
status warnings: nflverse weekly rosters and transactions were stale, and the
2026 injury source was unavailable after a provider HTTP 404. Those warnings
do not invalidate the rankings or completed-history boundary and must not be
silently presented as fresh status evidence.

## Human-owned remainder

- Chrome Web Store reviewer approval and post-approval installed-package
  acceptance (the `0.0.0.10` package was submitted on August 30, 2026);
- a logged-in provider draft and real extension-fed pick observation;
- signed-in cross-device completed-mock reopening;
- seven remaining native WebMCP corpus journeys after the Phase 20A expansion;
- deferred VoiceOver/device validation.
