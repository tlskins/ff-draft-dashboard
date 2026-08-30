# Drafty Draft Sync: Chrome Web Store submission packet

Status: extension `0.0.0.10` is the production-package candidate. Automated
packaging and policy-boundary checks are implemented. Store upload, listing
entry, screenshots, distribution choices, reviewer submission, and installed-
package browser acceptance remain human-owned.

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
  <https://drafty.friedchickentechnologies.com/extension-privacy.html>
- **Support URL:**
  <https://drafty.friedchickentechnologies.com/extension-support.html>

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
- Required: at least one current 1280x800 or 640x400 screenshot; up to five.
- Recommended screenshot 1: ESPN draft room and connected Drafty dashboard.
- Recommended screenshot 2: Drafty live rankings and recent-pick synchronization.
- Recommended screenshot 3: Drafty player profile and tier-density insight after
  extension-fed picks.
- Required by the current listing UI guidance: 440x280 small promo tile.
- Optional: 1400x560 marquee tile and a YouTube demonstration.

Screenshots must come from the installed `0.0.0.10` ZIP, show current product
behavior, omit private league/account details, and use consistent Drafty
branding. They are intentionally not fabricated from fixture data in this
automated slice.

## Submission and acceptance checklist

1. Deploy and verify the privacy and support URLs.
2. Upload `ext_release_0_0_0_10.zip` to the Chrome Web Store Developer
   Dashboard.
3. Enter the identity, listing, host justifications, and privacy declarations
   above; confirm distribution and mature-content choices.
4. Capture and upload the required installed-package screenshots and promo tile.
5. Load the exact ZIP unpacked and verify both Drafty origins, the extension
   popup, and one ESPN connection/pick flow.
6. Verify ordinary Drafty behavior without the extension and confirm no remote
   code or unexpected permission warning appears.
7. Submit for review only after the human acceptance evidence is recorded.

The owner must verify the public support channel is suitable before submission.
Do not paste secrets, account data, or private league information into a public
support issue.
