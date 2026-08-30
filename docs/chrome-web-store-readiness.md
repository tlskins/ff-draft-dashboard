# Drafty Draft Sync: Chrome Web Store submission packet

Status: extension `0.0.0.10` was submitted to the Chrome Web Store for review
on August 30, 2026. Automated
packaging, relay integration, production-origin smoke, clean-profile
Chrome-for-Testing installation/popup/heartbeat smoke, policy-boundary,
promotional-asset, and upload-bundle checks are implemented. Store approval and
the post-approval installed-package/live-draft acceptance remain human-owned.

This packet follows Chrome's official extension preparation, listing, privacy,
quality, and limited-use guidance:

- <https://developer.chrome.com/docs/webstore/prepare>
- <https://developer.chrome.com/docs/webstore/cws-dashboard-listing>
- <https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>
- <https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines>
- <https://developer.chrome.com/docs/webstore/program-policies/limited-use>

## Product identity

- **Name:** Drafty Draft Sync
- **Manifest summary:** Sync live ESPN and NFL.com fantasy-football draft picks
  into the Drafty dashboard.
- **Category:** Productivity
- **Language:** English (United States)
- **Homepage:** <https://drafty.friedchickentechnologies.com/>
- **Privacy policy:**
  <https://drafty.friedchickentechnologies.com/extension-privacy>
- **Support URL:**
  <https://drafty.friedchickentechnologies.com/extension-support>

## Single purpose

Relay live fantasy-football draft picks and bounded league metadata from
supported ESPN and NFL.com draft rooms to the user's open Drafty dashboard.

## Detailed description

Drafty Draft Sync keeps the Drafty dashboard aligned with a live fantasy-
football draft without requiring manual pick entry. It reads the completed
picks and bounded league metadata shown in supported ESPN and NFL.com draft
rooms, then relays that information to an open Drafty dashboard tab in the same
Chrome profile.

Main features:

- synchronizes drafted player, team, position, and pick order;
- identifies the active draft and supported format metadata when available;
- reports bounded selector health so Drafty can show capture failures clearly;
- communicates only with approved Drafty dashboard origins through Chrome's
  extension runtime;
- contains no advertising, analytics, remotely hosted code, or general browser-
  history collection.

Drafty Draft Sync requires an open Drafty dashboard tab. Drafty's local
rankings and analysis work without a signed-in account. Account-backed Drafty
features are governed by the linked privacy policy.

## Host-access justifications

The manifest declares no `permissions` or `host_permissions` arrays. Its content
scripts use these four narrowly bounded matches:

| Match | Justification |
|---|---|
| `https://fantasy.espn.com/football/draft*` | Read completed picks and bounded draft metadata from an ESPN draft room. |
| `https://fantasy.nfl.com/draftclient*` | Read completed picks and bounded draft metadata from an NFL.com draft room. |
| `https://drafty.friedchickentechnologies.com/*` | Deliver draft snapshots and connection health to the primary Drafty dashboard. |
| `https://ff-draft-dashboard.vercel.app/*` | Deliver the same snapshots to Drafty's stable first-party deployment alias. |

Localhost is excluded from the store artifact. `npm run extension:dev` creates
an ignored `.extension-dev` bundle with localhost access for development.

## Remote code declaration

Select **No, I am not using remote code**. Every executed JavaScript file is
packaged in the extension ZIP. The extension performs no `fetch`, XHR,
WebSocket, dynamic remote import, `eval`, or `new Function` execution.

## Privacy-practices answers

Conservative disclosure for the Developer Dashboard:

| Data category | Answer | Explanation |
|---|---|---|
| Website content | Yes | The extension reads draft picks and league metadata rendered on supported draft pages. |
| Web history | Yes, narrowly scoped | It handles the supported draft page URL to identify the draft session; it does not collect general browsing history. |
| User-generated content | Yes, conservatively | Draft selections can reflect user actions and are relayed as part of the draft snapshot. |
| Personally identifiable information | No | The extension does not read names, email addresses, account IDs, or Google credentials. A league ID in a supported URL is used only as a draft-session identifier. |
| Authentication information | No | Cookies, passwords, OAuth tokens, and session credentials are not read. |
| Personal communications, financial, health, location | No | These categories are outside the extension's single purpose and code paths. |

Certify that data is used only for the disclosed purpose, is not sold or used
for advertising or credit decisions, and is not transferred except as required
to provide the user-facing feature, security, or legal compliance. The public
privacy policy contains the Limited Use affirmation.

## Graphic assets and human inputs

- Store icon: `public/pulse-icon-128.png` (128x128).
- Small promo tile: `docs/chrome-web-store/assets/drafty-small-promo-440x280.png`.
- Marquee tile: `docs/chrome-web-store/assets/drafty-marquee-1400x560.png`.
- Reusable generated background:
  `docs/chrome-web-store/assets/drafty-store-background-v1.png`.
- Required: at least one current 1280x800 or 640x400 screenshot; up to five.
- Recommended screenshot 1: ESPN draft room and connected Drafty dashboard.
- Recommended screenshot 2: Drafty live rankings and recent-pick synchronization.
- Recommended screenshot 3: Drafty player profile and tier-density insight after
  extension-fed picks.
- The 440x280 small promo tile is ready for upload.
- The optional 1400x560 marquee tile is ready for upload. A YouTube
  demonstration remains optional and human-owned.

Screenshots must come from the installed `0.0.0.10` ZIP, show current product
behavior, omit private league/account details, and use consistent Drafty
branding. They are intentionally not fabricated from fixture data in this
automated slice.

The promo background was generated with OpenAI image generation from the
existing Drafty mascot and Phase 14 design reference, then deterministically
composited with the original mascot and exact product copy. Generation prompt:
"Create a text-free Chrome Web Store promotional background for Drafty: a
dense but polished fantasy-draft trading-terminal workspace in charcoal/navy,
steel-blue panes, orange highlights, and restrained green/violet signals; keep
the left 30% quiet and leave clean center-right space for later exact text; no
text, letters, numbers, logos, mascots, NFL/team marks, or watermark." The
source background is retained so listing copy can be revised without
regenerating the artwork.

## Automated installed-boundary evidence

Run these checks against the source extension, the exact release ZIP, and the
live production dashboard:

```bash
npm run extension:test:relay
npm run extension:test:clean-browser
npm run extension:smoke:production
npm run extension:bundle:store
```

The relay harness executes the packaged Manifest V3 background worker against
simulated ESPN, NFL.com, both approved dashboard origins, rejected lookalike
origins, disconnects, and failed ports. The production smoke verifies HTTPS,
the deployed manifest boundary, public privacy/support pages, Limited Use
copy, and cross-links. These checks reduce the manual acceptance surface but do
not replace loading the ZIP in Chrome for final installed-package acceptance.

The clean-browser smoke extracts the exact release ZIP into a temporary
profile, starts the official Chrome for Testing milestone matching the locally
installed Chrome, observes the MV3 service worker, verifies popup identity and
version, receives a version-1 heartbeat on the production Drafty origin, and
confirms an unmatched origin receives no Drafty events. Chrome for Testing is
resolved through Google's official release metadata and cached only under
`node_modules/.cache`; `CHROME_PATH` can supply an already installed compatible
binary. It does not authenticate to ESPN/NFL.com, select a draft room, observe
a live pick, or replace human visual judgment.

`npm run extension:bundle:store` writes the verified upload directory to
`release/chrome-web-store/0.0.0.10/`. It includes the exact extension ZIP,
128px icon, both promotional images, this submission packet, an explicit
screenshot reminder, a machine-readable manifest, and SHA-256 checksums. The
directory is ignored because it duplicates tracked release inputs.

## Submission and acceptance checklist

1. Deploy and verify the privacy and support URLs.
2. Run `npm run extension:bundle:store`, verify `SHA256SUMS`, and upload
   `release/chrome-web-store/0.0.0.10/drafty-draft-sync-0.0.0.10.zip` to the
   Chrome Web Store Developer Dashboard.
3. Enter the identity, listing, host justifications, and privacy declarations
   above; confirm distribution and mature-content choices.
4. Capture and upload the required installed-package screenshots, then upload
   the prepared promo assets.
5. Load the exact ZIP unpacked and verify both Drafty origins, the extension
   popup, and one ESPN connection/pick flow.
6. Verify ordinary Drafty behavior without the extension and confirm no remote
   code or unexpected permission warning appears.
7. Submit for review only after the human acceptance evidence is recorded.

The owner must verify the public support channel is suitable before submission.
Do not paste secrets, account data, or private league information into a public
support issue.
