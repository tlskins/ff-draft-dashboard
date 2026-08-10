# Phase 10C positional tier landscape

Phase 10C is a bounded presentation and interaction candidate for the
`tier_landscape` decision-workspace view. It does not change rankings, tiers,
recommendations, opponent forecasting, navigation arbitration, historical API
schemas, or the Python API. It does not mark Phase 10 complete.

## Sources and ownership

- `pages/index.tsx` constructs the workspace's explicit live availability
  input from the four QB/RB/WR/TE collections in `PlayerRanks`. It does not
  pass the full player library as availability. Desktop and mobile receive the
  same available-player list, `DraftRecommendationSet`, and `OpponentForecast`.
- The full player library remains available to the existing historical query
  controls and comparison drawer only. It is never used to make a player
  appear in the live landscape.
- `DraftRecommendationSet` supplies current-pick and next-user-pick context.
  It remains authoritative for recommendation selection and ordering; Phase
  10C neither reads scores nor builds candidates.
- `OpponentForecast` is the sole source of live pick, player, run, and tier
  boundary probabilities. The surface does not create an opponent model or
  alter its probabilities.
- Existing active rank records, custom rank records, `BoardSettings`,
  `FantasySettings`, `RankingSummary[]`, and `getAdvisorProjection(...)` are
  presentation inputs only.

## Rank and tier authority

Each player displays its positional rank with the active draft-board source
label. A custom/user tier is primary only when the player has an actual custom
tier record for the active scoring mode. If it does not, the active
draft-board tier is the fallback and is labeled with that board's source.

When custom tiers and an active non-custom board coexist, the cards show both
the custom-tier primary label and the active rank source. A supplied active
board tier-boundary probability is displayed separately rather than being
relabeled as a custom-tier probability. Projection tiers are always labeled
`overlay only` and are never called custom or user tiers.

## Grouping and bounded display

The pure `behavior/analysis/tierLandscape.ts` model always creates lanes in
this order: QB, RB, WR, TE. It deduplicates the supplied available players by
ID, filters to those positions, and orders players by active positional rank
then player ID.

Primary tier bands group by their actual primary source plus tier number. The
surface shows at most three nearby bands per lane and at most three leading
players per visible band. Every visible band still reports its complete count
within the explicit available-player input and says when additional players in
that band are omitted from the card list. Each lane also discloses its total
available-player and tier-band counts, plus the number of later tier bands
omitted by the bounded display. This keeps the visual surface bounded while
retaining useful density evidence.

## Projection overlay

Projection floor, median, ceiling, and projection tier come from the existing
deterministic projection helper. The model reuses the safe range normalizer:
non-finite values become unavailable and reversed finite endpoints are repaired
for display only. Equal and zero ranges remain valid. One shared PPG scale is
computed across the rendered landscape players; every visual range also has
numeric floor, median, and ceiling text and an accessible text alternative.

## Forecast evidence and horizon

The supplied opponent-pick horizon is shown as the count and overall-pick
range of valid supplied forecast picks. The player survival value is a pure
presentation aggregation: for each forecast pick that supplies a finite
`overallProbability` for the player, multiply `(1 - probability)`. A player
with no supplied per-pick probability is `Unavailable`; missing entries do not
become invented zero-probability evidence. Finite out-of-range inputs are
clamped to `[0, 1]`; non-finite values are rejected.

Run probability and its supplied minimum-pick threshold come directly from
`runProbabilities`; the UI labels it as the probability of **at least** that
many positional picks, never an exact run length. Current-tier exhaustion
comes directly from a matching
supplied `tierBoundaryProbabilities` item only when its tier authority aligns
with the displayed primary tier. The UI does not recompute either value.

The current forecast contract covers opponent picks before the next user pick.
Phase 10C intentionally shows no expected tier at a later user pick. A clear
unavailable statement marks that limit rather than extrapolating a tier.

## Live updates and accessibility

When the explicit availability input changes, the pure model replaces removed
players, recomputes displayed tier density deterministically, and refreshes
only supplied forecast evidence. No navigation event is produced. The active
tier-landscape view therefore stays selected under the existing Phase 10A
pinned/automatic/confirmed-manual controller.

Comparison drawer openings record whether they came from a live card or a
historical result. If a live card's player is removed from the visible live
landscape, its drawer closes safely; historical result inspection remains a
separate drawer path.

The surface uses a heading hierarchy, semantic lane/band/player lists,
keyboard-native inspect buttons, numeric text for every probability and range,
and empty/unavailable states for missing evidence. A polite update uses a
stable displayed-evidence key: equivalent rerenders do not announce again,
while a material availability, density, rank/tier source, projection, or
forecast change emits one concise update. Human visual and
assistive-technology acceptance remains deferred.

## Historical drilldown

The existing position, 1/3/5-season, and scoring-profile controls still build
the unchanged bounded historical tier-landscape query only after the user
presses **Run analysis**. The live surface is rendered before and independently
of that request. Live availability or forecast changes never issue an
historical API request and do not discard a completed historical result unless
the existing navigation logic changes the actual view scope.

## Deferred work

Phase 10C explicitly defers:

- forecasts beyond the supplied next-user-pick horizon and any new expected-tier algorithm;
- cross-position valuation visualization;
- intra-position risk/reward visualization;
- bye-week, stack, and handcuff enrichment;
- new player-status or news ingestion;
- opponent-model formulas, tuning, and promotion state;
- human visual and assistive-technology acceptance.
