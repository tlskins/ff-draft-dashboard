# Phase 17C: WebMCP acceptance and production trial

Status: deterministic corpus, evaluator, output budgets, progressive fallback,
and production token injection are implemented. The production origin was
enrolled on August 30, 2026, and its token is configured as a Vercel production
build variable. The token-bearing build was deployed and verified at the stable
production alias on August 30, 2026. Native compatible-agent discovery and
invocation remain open.

## Implemented acceptance infrastructure

- `behavior/webmcp/webmcp-task-corpus.json` defines six bounded natural-
  language journeys covering configuration, rankings navigation, analyst-note
  search/profile focus, reversible targets, reversible positional-rank edits,
  and insight selection.
- `scripts/webmcp-eval-lib.cjs` scores task success, tool choice and ordering,
  retries, result bytes, state correctness, and agreement with separately
  observed human-visible state.
- `scripts/run-webmcp-eval.mjs` converts a compatible-agent trace into a
  reproducible JSON report. Run it with:

  ```sh
  npm run eval:webmcp -- --input /absolute/path/to/run.json \
    --output /absolute/path/to/report.json
  ```

- `npm run eval:webmcp:contract` verifies the corpus, approved tool boundary,
  perfect reference behavior, and failure detection for wrong tools, retries,
  oversized output, and state disagreement.
- Search is capped at eight players, two note matches per player, and 180
  characters per note field. Tests enforce the declared search byte budget and
  Chrome's current name/parameter/description recommendations.

The evaluator's estimated DOM-action baseline is explicitly an estimate. It is
useful for comparing interaction count, but it is not represented as observed
browser telemetry.

The implementation gate passes TypeScript, lint, the optimized production
build, the three-test WebMCP evaluator contract, and the full dashboard suite:
135 passed suites and 850 passed tests, with one suite and two tests skipped.

## Chrome local acceptance

Chrome's WebMCP testing flag is browser-owned state and requires a relaunch:

1. Open `chrome://flags/#enable-webmcp-testing` manually.
2. Set **WebMCP for testing** to **Enabled** and relaunch Chrome.
3. Start Drafty with `npm run dev` and open `http://localhost:3000`.
4. Confirm the root element reports `data-webmcp-status="ready"` and
   `data-webmcp-tool-count="10"`.
5. In Chrome DevTools' WebMCP tooling or Model Context Tool Inspector, enumerate
   all ten stable tools and execute the six corpus journeys.
6. Record each tool call/result plus the final agent state and independently
   observed UI state in the evaluator run format.
7. Restore any temporary target or rank change as directed by the corpus.

On August 29, 2026, controlled Chrome probing without the flag produced:

```json
{"hasModelContext":false,"status":"unsupported","toolCount":"0"}
```

That is a passed progressive-enhancement result, not a passed native WebMCP
acceptance. Browser security correctly prevented automation from opening or
changing `chrome://flags`, so the flag/relaunch step remains human-owned.

On August 29, 2026, the flag was then enabled manually and Chrome 150.0.7871.125
was relaunched. The current Codex Chrome-control surface could reconnect, list
tabs, and observe the local Drafty tab, but it does not expose WebMCP tool
discovery or invocation. Its page-inspection channel repeatedly timed out after
the flag was enabled, including bounded diagnostic reads against the optimized
local build. Consequently, the six native journeys were not executed and this
is recorded as an agent/browser-integration limitation—not as a Drafty tool or
human-UI failure. Complete the native journey run with Chrome's Model Context
Tool Inspector, or repeat it when the Codex Chrome-control surface exposes
WebMCP discovery and execution directly.

## Trace format

Each run uses schema version 1 and one entry per corpus journey:

```json
{
  "schema_version": 1,
  "run_id": "chrome-local-YYYYMMDD",
  "agent": "agent and model version",
  "browser": "Chrome version and channel",
  "journeys": [
    {
      "id": "navigate_adp_rounds",
      "completed": true,
      "calls": [
        {
          "tool": "drafty_set_rankings_view",
          "input": {"view":"adp_round","adp_round":5,"sort":"adp"},
          "result": {"ok":true},
          "retry": false
        }
      ],
      "agent_state": {"rankings":{"view":"adp_round","adpRoundPage":5}},
      "observed_state": {"rankings":{"view":"adp_round","adpRoundPage":5}}
    }
  ]
}
```

Do not record tokens, credentials, local-storage dumps, full analyst corpora, or
draft histories in an eval trace.

## Production origin trial

Chrome's first-party origin trial is registered outside the repository. Follow
the official WebMCP origin-trial and general origin-trial guides:

- <https://developer.chrome.com/blog/ai-webmcp-origin-trial>
- <https://developer.chrome.com/docs/web-platform/origin-trials>

The exact origin `https://ff-draft-dashboard.vercel.app` was registered on
August 30, 2026. The issued token expires November 16, 2026. The token is public
enrollment metadata, not an application secret, but it is origin-bound and
expires. It is stored as the Vercel production build variable
`NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN`; do not commit the issued token to Git.
The page head emits one validated first-party `<meta http-equiv="origin-trial">`
only when the value has a bounded token shape. Missing or malformed values keep
progressive fallback intact.

After deploying a token-bearing build:

1. inspect the rendered document head for exactly one origin-trial meta tag;
2. confirm Chrome DevTools reports a valid WebMCP trial for the top frame;
3. confirm `document.modelContext` exists and the root diagnostic reaches ten
   ready tools;
4. rerun the six-journey corpus against production; and
5. run ordinary browser smoke in a browser without WebMCP to prove the human UI
   remains unchanged.

Production deployment evidence from August 30, 2026:

- `https://ff-draft-dashboard.vercel.app/` returned HTTP 200;
- the rendered document contained exactly one origin-trial meta tag with the
  expected bounded token shape;
- the normal Drafty title and page loaded in Chrome; and
- the current Codex Chrome-control page-inspection channel still timed out when
  querying the WebMCP diagnostic, so native tool discovery/invocation remains a
  compatible-agent or Model Context Tool Inspector gate rather than a recorded
  Drafty failure.

Chrome ignores invalid or expired tokens, so token renewal and repeat
production acceptance remain release operations rather than permanent code
assumptions.
