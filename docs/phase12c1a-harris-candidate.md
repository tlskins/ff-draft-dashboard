# Phase 12C1a Harris 2026 ranking candidate

The active release artifact's top-level `season: 2026` and August cache time do
not prove source-specific Harris freshness. A direct comparison on 2026-08-16
showed that the embedded 214-player Harris dataset does not match the provider's
current 2026 positional or overall pages.

The API now provides a non-mutating candidate command:

```sh
.venv/bin/python scripts/preview_harris_rankings.py \
  --season 2026 \
  --report /tmp/drafty-harris-2026-candidate.json
```

It fetches only the public Harris QB, RB, WR, TE, and Top 160 draft pages. Every
page must visibly name the requested season and expose a supported ET update
timestamp. HTTP failures, missing pages, a season mismatch, missing timestamp,
or implausibly small positional pools fail closed. The parser now uses a
bounded request timeout and checks HTTP status.

The candidate is matched to the stable ESPN-ID player universe by normalized
name and position, using team only to disambiguate duplicate identities.
Suffixes such as Jr., Sr., and III do not create false misses. No fuzzy match
is silently accepted. Unmatched and ambiguous source rows remain explicit.

## Initial evidence

Two consecutive live collections produced the same semantic fingerprint,
`b1051a7fc39db313cfeda5d32fff3336aa062937e46ddc69ec8078712e0e81f2`.
The source-page update evidence was August 11 for QB and August 15 for RB, WR,
TE, and Top 160. The bounded review reported:

| Evidence | Count |
| --- | ---: |
| Source players | 252 |
| Matched stable-universe players | 248 |
| Newly ranked matched players | 66 |
| Previously ranked players absent from the candidate | 32 |
| Retained players with rank changes | 182 |
| Retained players unchanged | 0 |
| Unmatched source players | 4 |
| Ambiguous source identities | 0 |

The unmatched source rows are Carson Wentz, Kenneth Gainwell, Nick Singleton,
and Devin Neal. They are evidence for reconciliation, not authorization to add
or guess an ESPN identity. The 32 removals likewise require review before any
promotion.

## Boundary and next slice

This slice never changes `latest_player_rankings.json`, dashboard
`playerData.json`, SQLite source observations, custom ranks, user tiers, or
profiles. The report path is caller-selected; live candidate bytes are not
silently checked in.

Next, build the equivalent provenance-checked FantasyPros candidate. After both
sources are reviewed, define a scoring-aware source-observation and explicit
promotion contract. Profile rebase apply follows promotion and remains an
explicit user-confirmed action.
