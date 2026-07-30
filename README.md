# Fantasy Football Draft Dashboard

A Next.js draft board with a Chrome extension that reads ESPN and NFL draft
rooms. The app can run entirely from its embedded rankings or load the latest
snapshot from the companion Flask API.

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

## Chrome extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this repository's `public` directory.
4. Reload the unpacked extension after changing `public/contentScript.js`,
   `public/background.js`, or `public/manifest.json`.

The extension sends versioned, full draft snapshots. The dashboard also accepts
the legacy incremental message shape so an installed older extension does not
have to be upgraded in lockstep.

## Verification

```bash
corepack yarn tsc --noEmit
corepack yarn test --runInBand
corepack yarn build
```

The static export post-build step is implemented in Node and works on macOS and
Linux.

## Realtime advisor

The model-independent advisor contract lives in `behavior/draft-advisor`.
See `docs/realtime-draft-advisor.md` for the planned OpenAI Realtime adapter and
UX data flow.
