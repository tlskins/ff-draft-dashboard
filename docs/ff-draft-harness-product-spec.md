# Fantasy Football Draft Harness

## Product and technical specification

Status: Draft for implementation
Scope: Local-first v1
Primary clients: Drafty web dashboard and Drafty Chrome extension
Primary service: Flask rankings and analysis API

## 1. Product goal

Build a local-first fantasy football draft harness that combines:

- User-authored positional rankings and tiers.
- Historical weekly and game-level analysis.
- Deterministic draft, roster, tier, and opponent modeling.
- Natural-language and voice navigation.
- A Realtime advisor that helps the user make decisions without submitting
  picks to the fantasy platform.
- A tangible draft plan that changes only through explicit user confirmation.

The product should help the user answer:

1. What positional value will probably be available at each upcoming pick?
2. Which three players should I consider as my pick approaches?
3. Which position has the most meaningful drop-off before my next pick?
4. How do the best players within a position compare by floor, ceiling, risk,
   usage, and roster fit?
5. Which positions are opponents likely to select before my next pick?

## 2. Product principles

### 2.1 User rankings are authoritative

Custom rankings are positional in v1. The application must not silently rank a
lower user-ranked player ahead of a higher user-ranked player at the same
position.

The system may compare the highest-ranked available players across positions
using a transparent, dynamic valuation layer. That layer must not mutate the
underlying custom rankings.

### 2.2 User tiers are primary

User-created tier boundaries are the primary visual and decision-making tiers.
Computed projection tiers are an analytical overlay.

User tiers influence tier-cliff urgency. Computed tiers provide projected point
ranges, uncertainty, and cross-position comparison.

### 2.3 Deterministic calculations own facts

Code, not the language model, owns:

- Fantasy scoring.
- Weekly and season aggregations.
- Distribution statistics.
- Replacement levels.
- Tier boundaries and projected ranges.
- Roster legality.
- Marginal lineup value.
- ADP survival estimates.
- Opponent need and positional-run probabilities.
- Candidate filtering and ordering invariants.

The language model owns:

- Natural-language intent parsing.
- Voice interaction.
- Selecting deterministic tools.
- Explaining calculations.
- Proposing draft-plan changes.
- Selecting the most useful view.

### 2.4 No automatic drafting

The advisor never submits a pick to ESPN, Yahoo, NFL, or another draft
platform in v1.

An accepted recommendation updates the Drafty plan and UI only. The user still
makes the platform pick.

### 2.5 Every recommendation is decomposable

The UI must expose why a player or position is being recommended. No important
decision may depend on a hidden composite score.

## 3. V1 boundaries

### Included

- Local, single-user operation.
- ESPN live draft capture through the existing extension.
- Snake drafts.
- 10, 12, and 14 team leagues.
- Configurable roster slots and scoring.
- Standard, half-PPR, and PPR presets.
- Named and clonable ranking profiles.
- Positional rankings.
- User-created positional tiers.
- Computed positional projection tiers.
- Three to five years of weekly historical data.
- Historical scoring recomputed using the active scoring profile.
- Current-draft-only opponent modeling.
- Text and selectable voice interaction.
- Automatic view selection with an explanation.
- User ability to pin a view.
- Explicit voice and manual confirmation.
- Structured injury, suspension, and transaction status.
- Short ESPN profile-news snippets when the source is reliable and permitted.
- Regression tests, recorded draft replays, and agent evals.

### Excluded

- Keeper and dynasty rules.
- Auction drafts.
- Automatic platform pick submission.
- Cross-draft opponent identity or tendency learning.
- Rumor aggregation.
- General coach or media commentary.
- Open-ended web research during a live pick.
- LLM-generated arbitrary SQL, Python, or chart code.
- Multi-user hosting, billing, or organization administration.

## 4. System architecture

```text
ESPN draft page
  -> Chrome content script
  -> extension service worker
  -> versioned draft snapshot
  -> Drafty dashboard
       -> platform snapshot parser
       -> pure TypeScript draft-session reducer
       -> canonical draft events
       -> local draft session
  -> Flask API
       -> canonical event validation and idempotent persistence
       -> deterministic analysis engine
       -> nflverse historical store
       -> ranking/tier store
       -> draft-plan and event store
       -> Realtime session broker
       -> news/status adapters
  -> typed visualization specifications
  -> four analysis views
  -> Realtime voice/text advisor
```

### Dashboard responsibilities

- Draft board and ranking editor.
- User-tier editor.
- Four analysis views.
- Local draft state and extension connection status.
- Parse platform snapshots and produce canonical draft events.
- Own the reference draft-session reducer used by live UI and replay tests.
- Realtime WebRTC client.
- Confirmation UI.
- Rendering typed visualization specifications.
- Displaying deterministic evidence and model explanations separately.

### Extension responsibilities

- Observe supported draft platforms.
- Emit versioned, cumulative draft snapshots.
- Include platform player identity, pick identity, team identity, and draft
  metadata.
- Avoid analysis, model calls, or user ranking logic.

### API responsibilities

- Validate, persist, and serve canonical draft events idempotently.
- Never reinterpret raw ESPN or NFL DOM snapshots.
- Import and normalize nflverse datasets.
- Maintain canonical player identities.
- Recompute fantasy scoring from raw weekly statistics.
- Calculate distributions, replacement levels, tiers, and candidate values.
- Persist ranking profiles, user tiers, draft sessions, and draft plans.
- Generate deterministic visualization data.
- Broker Realtime sessions without exposing the OpenAI API key.
- Ingest structured status events.

## 5. Data sources and storage

### 5.1 Historical statistics

Use nflverse player weekly statistics as the production historical source.
nflverse publishes week, regular-season, and postseason summary levels in
columnar formats:

- https://github.com/nflverse/nflverse-data/releases
- https://github.com/nflverse/nflreadr/blob/main/R/load_stats.R

Default window: five completed seasons. The UI may select a shorter window,
with three seasons offered as a preset.

### 5.2 Player identity

Use nflverse player data as the canonical identity layer. Preserve mappings for:

- GSIS ID.
- ESPN ID.
- Yahoo ID when available.
- PFR ID for reference and migration only.
- Current team and position.

Platform-specific IDs must never become the only primary key.

### 5.3 Live ranks and ADP

Use source adapters with explicit timestamps:

- ESPN rank and ADP adapter.
- Optional FantasyPros adapter.
- Future Yahoo rank and ADP adapter.

The data model must retain source, season, scoring type, fetched time, and raw
rank so a stale or mismatched ranking cannot silently appear current.

### 5.4 Status and news

V1 status sources:

- Injuries and injury designations.
- Suspensions.
- Transactions and team changes.
- Short ESPN profile-news snippets, URL, and timestamp when reliable.

Store structured status and a short excerpt. Do not store full articles or
create a general news feed.

### 5.5 Local storage

Recommended local-first split:

- Parquet files for source snapshots.
- DuckDB for analytical queries over weekly historical data.
- SQLite for mutable application state.

SQLite stores ranking profiles, user tiers, draft sessions, plan revisions,
settings, and status acknowledgements. DuckDB reads normalized Parquet and
returns bounded analytical results to the API.

The frontend must not load the full historical dataset into the browser.

The existing embedded rankings bundle remains the offline rollback path while
the API is introduced. SQLite and file-backed repositories are the local-first
defaults. A Mongo repository may remain as an optional adapter, but no v1
feature may require it.

### 5.6 Canonical draft ownership

Platform parsing and draft-state application have one reference
implementation in TypeScript:

```text
reduceDraftSnapshot(currentState, snapshot)
  -> canonicalEvents
  -> nextState
```

The reducer is side-effect free and runnable in Node/Jest without React or a
browser. `useDraftListener` is an adapter responsible for window events,
listen/ignore decisions, React updates, and notifications.

Flask receives canonical events, not raw platform snapshots. It validates the
OpenAPI schema, rejects or ignores duplicate event identities idempotently,
persists the event log, and computes analytics from that log. Python must not
implement a second ESPN/NFL snapshot parser or a competing snake-draft reducer.

Cross-language parity means:

- TypeScript-produced canonical events validate against the API schema.
- Events survive an API write/read round trip without semantic changes.
- Duplicate submissions do not duplicate picks.

It does not require independently derived TypeScript and Python UI state to be
byte-identical.

## 6. Canonical schemas

The schemas below are conceptual contracts. Implementation should use Pydantic
on the API and generated TypeScript types in the dashboard.

### 6.1 Player identity

```yaml
Player:
  id: string
  full_name: string
  first_name: string
  last_name: string
  position: QB | RB | WR | TE
  nfl_team: string
  status: active | injured_reserve | suspended | inactive | free_agent
  ids:
    gsis: string?
    espn: string?
    yahoo: string?
    pfr: string?
  rookie_season: integer?
  birth_date: date?
  updated_at: datetime
```

### 6.2 Weekly statistics

```yaml
WeeklyStatLine:
  player_id: string
  season: integer
  week: integer
  season_type: REG | POST
  team: string
  opponent: string
  games: integer
  passing:
    attempts: integer
    completions: integer
    yards: number
    touchdowns: number
    interceptions: number
    sacks: number?
    two_point_conversions: number
  rushing:
    attempts: integer
    yards: number
    touchdowns: number
    two_point_conversions: number
  receiving:
    targets: integer
    receptions: integer
    yards: number
    touchdowns: number
    two_point_conversions: number
  fumbles:
    total: integer
    lost: integer
  kicking: object?
  source: nflverse
  source_version: string
```

Derived fantasy points are not the source of truth. They are recomputed from
the raw stat line and the active scoring profile.

### 6.3 Scoring profile

```yaml
ScoringProfile:
  id: string
  name: string
  passing_yards_per_point: number
  passing_touchdown: number
  interception: number
  rushing_yards_per_point: number
  rushing_touchdown: number
  reception: number
  receiving_yards_per_point: number
  receiving_touchdown: number
  fumble_lost: number
  two_point_conversion: number
  bonuses:
    - stat: string
      threshold: number
      points: number
  created_at: datetime
  updated_at: datetime
```

### 6.4 Historical distribution

```yaml
HistoricalDistribution:
  player_id: string
  scoring_profile_id: string
  seasons: [integer]
  games_played: integer
  points:
    mean: number
    median: number
    std_dev: number
    p10: number
    p25: number
    p50: number
    p75: number
    p90: number
    minimum: number
    maximum: number
  usage:
    opportunity_mean: number?
    opportunity_trend: number?
    target_share_mean: number?
    rush_share_mean: number?
  availability:
    games_missed: integer
    active_game_rate: number
  calculated_at: datetime
```

### 6.5 Projection distribution

```yaml
ProjectionDistribution:
  player_id: string
  scoring_profile_id: string
  strategy: rank_to_historical_tier_v1
  positional_rank_input: integer
  tier_id: string
  weekly_points:
    floor: number
    median: number
    ceiling: number
  season_points:
    floor: number
    median: number
    ceiling: number
  confidence: number
  uncertainty_reasons: [string]
  inputs_version: string
  calculated_at: datetime
```

Rookies and players without sufficient history use positional rank to inherit
the projected range for their tranche. Their confidence is lower and their
range is wider.

### 6.6 Ranking profile

```yaml
RankingProfile:
  id: string
  name: string
  scoring_profile_id: string
  roster_profile_id: string
  positions:
    QB: [player_id]
    RB: [player_id]
    WR: [player_id]
    TE: [player_id]
  created_at: datetime
  updated_at: datetime
  revision: integer
```

Rank order is an explicit player-ID array for each position. Reordering does
not require changing tier records.

### 6.7 Tier sets

```yaml
TierSet:
  id: string
  ranking_profile_id: string
  position: QB | RB | WR | TE
  kind: user | projection
  strategy: manual | standard_deviation_v1 | string
  tiers:
    - id: string
      number: integer
      start_rank: integer
      end_rank: integer
      projected_points:
        floor: number?
        median: number?
        ceiling: number?
  revision: integer
  calculated_at: datetime?
```

Rules:

- User tiers are shown first and with stronger visual weight.
- Projection tiers are an overlay and may be hidden.
- User-tier boundaries drive tier-cliff urgency when present.
- Projection ranges drive cross-position point comparisons.
- Moving a user-tier boundary does not change player order.

### 6.8 Draft session

```yaml
DraftSession:
  id: string
  platform: ESPN | NFL | YAHOO
  external_draft_id: string
  title: string
  scoring_profile_id: string
  roster_profile_id: string
  ranking_profile_id: string
  team_count: integer
  user_team_index: integer
  current_pick: integer
  status: waiting | active | complete | disconnected
  started_at: datetime?
  updated_at: datetime
```

```yaml
DraftPick:
  session_id: string
  overall_pick: integer
  round: integer
  pick_in_round: integer
  roster_index: integer
  player_id: string
  source_player_id: string?
  captured_at: datetime
```

### 6.9 Candidate evaluation

```yaml
CandidateEvaluation:
  player_id: string
  position: QB | RB | WR | TE
  user_position_rank: integer
  user_tier: integer?
  projection_tier: integer
  projection: ProjectionDistribution
  marginal_lineup_points: number
  expected_tier_loss_before_next_pick: number
  survival_probability_to_next_pick: number
  opponent_run_probability: number
  bench_upside_utility: number
  legal: boolean
  flags:
    - type: bye_concentration | qb_stack | handcuff | volatility |
        injury | suspension | team_concentration | roster_imbalance
      severity: info | warning | critical
      message: string
  explanation_components:
    - label: string
      value: number | string
      source: deterministic
```

### 6.10 Recommendation set

```yaml
RecommendationSet:
  session_id: string
  based_on_pick: integer
  candidates: [CandidateEvaluation] # maximum 3
  preferred_player_id: string?
  fallback_player_ids: [string]
  expires_after_pick: integer
  calculation_version: string
  generated_at: datetime
```

### 6.11 Draft plan

```yaml
DraftPlan:
  session_id: string
  revision: integer
  preferences:
    bench_upside: number
    bye_concentration: number
    qb_stack: number
    handcuff: number
    volatility: number
    injury_risk: number
    age_risk: number
    role_uncertainty: number
  priorities: [string]
  avoidances: [string]
  conditional_targets:
    - upcoming_pick: integer
      ordered_player_ids: [string]
      fallback_position: string?
      status: proposed | accepted | resolved | expired
  decisions:
    - id: string
      proposal: string
      status: proposed | accepted | rejected | modified | expired
      based_on_pick: integer
      created_at: datetime
      resolved_at: datetime?
```

### 6.12 Player status event

```yaml
PlayerStatusEvent:
  id: string
  player_id: string
  type: injury | suspension | transaction | team_change | profile_news
  status: string
  short_summary: string
  source: string
  source_url: string?
  source_published_at: datetime?
  fetched_at: datetime
  confidence: number
  recommendation_impact: none | review | material
```

## 7. Deterministic algorithms

### 7.1 Scoring engine

Input:

- Weekly raw stat line.
- Scoring profile.

Output:

- Weekly fantasy points.
- Auditable point contributions by scoring rule.

Every total must be reproducible as a sum of named scoring contributions.

### 7.2 Tier engine

Implement a strategy interface:

```text
TierStrategy.calculate(
  positional_players,
  replacement_level,
  scoring_profile,
  historical_window
) -> ProjectionTierSet
```

V1 strategy: `standard_deviation_v1`.

Baseline behavior:

1. Sort a position by the selected historical points metric.
2. Calculate league-specific replacement level.
3. Calculate standard deviation from the top player through replacement.
4. Use half a standard deviation as the tier point width.
5. Translate positional ranking tranches into projected point ranges.
6. Widen ranges and lower confidence for missing history and rookies.

Preserve the existing method as a golden baseline. Do not introduce KMeans or
another strategy until replay evals exist.

### 7.3 Replacement engine

Replacement level is league specific and must be recalculated for:

- Team count.
- Starting position counts.
- Flex eligibility and count.
- Bench size.
- Expected backup QB and TE behavior.

V1 may preserve the current 30% backup-QB assumption but must expose it as a
named configuration value rather than a hard-coded constant.

### 7.4 Marginal roster valuation

Custom ranks select the candidate within each position. Dynamic valuation
compares positions.

For each legal positional candidate:

1. Add the candidate to a copy of the current roster.
2. Optimize starter and flex assignment.
3. Measure the projected median point increase in the starting lineup.
4. If no immediate lineup increase exists, calculate bench utility from
   ceiling, replacement insulation, and configurable upside preference.
5. Calculate the expected tier loss if the position is deferred.
6. Calculate the probability that the candidate or tier survives to the next
   user pick.

This naturally creates the desired drop-off after starters are filled:

- Open starter: full marginal lineup value.
- Flex upgrade: partial but measurable lineup value.
- Bench player: discounted utility with more ceiling weight.
- Illegal/full position: excluded.

### 7.5 Candidate ordering invariants

- A lower user-ranked player at a position cannot be recommended ahead of a
  higher available user-ranked player at the same position.
- Exceptions require an explicit user exclusion or accepted conditional plan.
- At least one candidate from the highest-urgency position should be included
  when legal.
- Recommendations contain no more than three players.
- When on the clock, one preferred candidate and at least one fallback should
  be shown when available.

### 7.6 Opponent pick model

V1 uses current-draft information only:

- Opponent roster.
- Open starter slots.
- Flex and bench composition.
- Pick distance.
- Available player ADP.
- Positional custom-rank depth.
- Recent positional picks.
- Draft round.

Output:

- Position probabilities for each opponent pick.
- Player probabilities conditional on position.
- Probability of a positional run before the next user pick.
- Probability of crossing each user-tier boundary.

Start with a deterministic probabilistic model. GPT may explain the result but
must not manufacture probabilities.

Evaluate against:

- ADP-only baseline.
- Need-only baseline.
- Combined model.

### 7.7 Synergy and risk flags

V1 flags:

- Concentrated bye weeks.
- QB and pass-catcher stack.
- RB handcuff.
- Weekly scoring volatility.
- Games missed and availability.
- Role and depth-chart uncertainty.
- Age and decline risk.
- Small historical sample.
- Team/offense concentration.
- Unfilled starter positions.

Flags are visible and configurable. They do not alter positional rank.

## 8. Analysis query and visualization contract

Natural language is compiled into a bounded specification:

```yaml
AnalysisQuery:
  player_ids: [string]
  positions: [QB | RB | WR | TE]
  seasons:
    start: integer
    end: integer
  weeks: [integer]?
  scoring_profile_id: string
  metrics: [string]
  group_by: player | position | season | week | opponent
  filters:
    - field: string
      operator: eq | ne | gt | gte | lt | lte | in | between
      value: any
  sort:
    field: string
    direction: asc | desc
  limit: integer
  visualization:
    type: line | bar | scatter | box | violin | density | heatmap
    x: string
    y: string
    color: string?
    facet: string?
```

The API validates allowed fields, operators, row limits, and chart types.
The model cannot send arbitrary SQL or executable chart code.

The renderer receives a validated, declarative chart specification and a
bounded dataset.

Example utterances:

- "Compare Achane and Gibbs by weekly PPR points over the last three seasons."
- "Show available running backs by floor and ceiling."
- "Group my top 20 receivers by projection tier."
- "Show target share versus scoring volatility and color by user tier."
- "Which tight ends lose the most value if I wait until my next pick?"

## 9. The four primary views

### 9.1 Positional tier landscape

Purpose: understand positional density and tier cliffs across upcoming picks.

Display:

- One lane per position.
- User tiers as the primary bands.
- Computed projected-point ranges as a secondary overlay.
- Current pick and upcoming user picks on the x-axis.
- ADP survival probability for each player.
- Expected tier remaining at each user pick.
- Opponent-run probability.

Agent trigger:

- Several picks before the user's turn.
- A positional run begins.
- A user-tier boundary is likely to disappear.

### 9.2 Realtime positional bests

Purpose: present the best available player at each position as the pick
approaches.

Display:

- Highest custom-ranked available player per position.
- User rank and tier.
- Projection range.
- Probability of reaching the next user pick.
- Tier loss if deferred.
- Roster-fit and status flags.

Agent trigger:

- Within a configurable number of picks from the user's turn.

### 9.3 Cross-position comparison

Purpose: compare the top positional candidates using league and roster context.

Display:

- Marginal lineup points.
- Points above positional replacement.
- User-tier cliff urgency.
- Projection range and confidence.
- Survival probability.
- Run probability.
- Bench utility when starters are filled.
- Roster flags.

Agent trigger:

- One or two picks before the user's turn.
- Meaningful change in the preferred position.

### 9.4 Intra-position comparison

Purpose: compare the top players at a selected position.

Display:

- Weekly point distribution.
- Floor, median, ceiling, and volatility.
- Usage trend.
- Games missed.
- Role uncertainty.
- Bye week.
- Stack and handcuff relationships.
- User rank and tier.
- Projection tier and range.

Agent trigger:

- User asks to compare a position.
- The top recommendations contain multiple players at the same position.
- The user pins the view.

### 9.5 Automatic navigation behavior

- The agent may switch views automatically.
- Every switch includes a short explanation.
- The user may pin a view.
- A pinned view is never replaced automatically.
- Urgent information appears as a non-destructive banner while pinned.
- Manual navigation is always available.

## 10. Rankings and tiers UX

The ranking editor should support:

- Position tabs.
- Drag-and-drop reordering.
- Multi-select movement.
- User-tier separators.
- Projection-tier overlay toggle.
- Player comparison drawer.
- Search and filters.
- Undo and redo.
- Named profiles.
- Clone profile.
- Saved revisions.
- Diff against another revision or imported rank source.

User tiers must remain visually primary. Projection tiers should use a thinner,
lower-contrast band or confidence interval so the dual representation does not
overload the board.

## 11. Realtime advisor

### 11.1 Connection

- Browser connects to OpenAI Realtime over WebRTC.
- Flask creates or brokers the session with the server-held API key.
- The browser never receives the standard OpenAI API key.
- Draft and plan state persist outside the Realtime session so a session can be
  reconnected without losing the draft.

### 11.2 Voice modes

- Push-to-talk.
- Always listening.
- Voice disabled/text only.

Default: push-to-talk.

### 11.3 Advisor tools

Read tools:

- `get_draft_state`
- `get_top_available_by_position`
- `get_candidate_evaluations`
- `get_opponent_forecast`
- `get_tier_landscape`
- `compare_players`
- `query_historical_stats`
- `get_player_status`
- `get_draft_plan`

UI tools:

- `set_active_view`
- `set_chart_query`
- `highlight_players`

Proposal tools:

- `propose_plan_update`
- `propose_preference_update`
- `propose_conditional_target`

Confirmation tools:

- `accept_proposal`
- `reject_proposal`
- `modify_proposal`

The model cannot directly mutate ranks, tiers, preferences, or the accepted
draft plan without a proposal and explicit confirmation.

### 11.4 Confirmation protocol

1. Agent creates a typed proposal with a unique ID.
2. UI shows an alert with Accept, Modify, and Reject.
3. Agent asks for explicit confirmation.
4. Voice acceptance must identify the active proposal or player.
5. A generic conversational "yes" is not sufficient when ambiguous.
6. Proposal expires when the draft state materially changes.
7. Accepted proposal creates a new DraftPlan revision.
8. No confirmation submits a platform draft pick.

### 11.5 Draft plan behavior

Accepted recommendations create conditional target chains:

```text
Pick 29:
  1. Nico Collins
  2. DeVonta Smith
  3. Best available RB if both are gone
```

As picks arrive:

- Unavailable targets are marked resolved or expired.
- The fallback becomes active.
- Material plan changes require a new proposal.
- Actual platform picks update the plan independently of the user's previous
  intention.

## 12. API surface

Recommended versioned endpoints:

```text
GET    /v1/players
GET    /v1/players/{id}
GET    /v1/players/{id}/history
GET    /v1/players/{id}/status

GET    /v1/scoring-profiles
POST   /v1/scoring-profiles
PUT    /v1/scoring-profiles/{id}

GET    /v1/ranking-profiles
POST   /v1/ranking-profiles
PUT    /v1/ranking-profiles/{id}
POST   /v1/ranking-profiles/{id}/clone
POST   /v1/ranking-profiles/{id}/reorder

GET    /v1/ranking-profiles/{id}/tiers
PUT    /v1/ranking-profiles/{id}/user-tiers
POST   /v1/ranking-profiles/{id}/projection-tiers/recalculate

POST   /v1/analysis/query
POST   /v1/analysis/compare

POST   /v1/draft-sessions
GET    /v1/draft-sessions/{id}
POST   /v1/draft-sessions/{id}/events
GET    /v1/draft-sessions/{id}/events
GET    /v1/draft-sessions/{id}/recommendations
GET    /v1/draft-sessions/{id}/opponent-forecast

GET    /v1/draft-sessions/{id}/plan
POST   /v1/draft-sessions/{id}/plan/proposals
POST   /v1/draft-sessions/{id}/plan/proposals/{proposal_id}/accept
POST   /v1/draft-sessions/{id}/plan/proposals/{proposal_id}/reject

POST   /v1/realtime/session
```

Generate the dashboard API client and TypeScript contracts from OpenAPI.

OpenAPI is the cross-repository source of truth. Phase 0 must first describe
the currently deployed `/players/latest` payload as a versioned v1 contract
without changing its wire shape. Generated TypeScript types live under
`behavior/api/`, and CI fails when generated artifacts are stale.

## 13. Testing and eval strategy

Priority order:

1. Correct calculations.
2. Faithfulness to configured preferences.
3. Correct prediction of positional runs.
4. Quality of the final roster.
5. Low interruption and timely advice.
6. Agreement with the user's eventual decision.

### 13.1 Calculation regression tests

Golden fixtures:

- Scoring profiles and weekly stat lines.
- Replacement levels by league configuration.
- Flex allocation.
- Existing `standard_deviation_v1` tiers.
- User-tier cliff calculations.
- Projection ranges.
- Marginal lineup points.
- Bench utility.
- Snake-draft roster ownership.

Required invariants:

- Same input and version produce the same output.
- A lower positional custom rank cannot pass a higher available rank.
- User-tier edits never mutate positional order.
- Illegal players never appear in recommendations.
- Fantasy points equal the sum of rule contributions.
- Recommendation evidence reproduces the displayed values.

### 13.2 Property-based tests

- Random legal roster profiles never produce out-of-bounds replacement indices.
- Random scoring profiles produce finite values.
- Adding a starting slot cannot reduce replacement depth.
- Removing an available player cannot make that same player appear in a later
  candidate set.
- Replayed cumulative snapshots produce no duplicate draft picks.

### 13.3 Draft replay harness

Record versioned draft-event logs from mock drafts:

```text
fixture metadata
ranking profile
scoring and roster profile
ordered draft snapshots
expected canonical picks
recommendation outputs
opponent forecasts
plan proposals and confirmations
view transitions
latency measurements
```

The same replay must run:

- Through the pure TypeScript session reducer in unit/integration tests.
- Against the dashboard adapter to verify equivalent picks and roster state.
- Through API canonical-event validation and persistence.
- Against model versions in offline evals.

The API replay validates event round-tripping and idempotency. It does not
re-parse raw platform snapshots.

### 13.4 Preference-faithfulness eval

Measure:

- Positional ordering violations: target 0.
- Ignored user-tier cliff: target 0 for material cliffs.
- Unconfirmed preference mutations: target 0.
- Recommendations inconsistent with accepted plan: target 0 unless the state
  invalidates the plan.
- Correct application of bench-upside and synergy settings.

### 13.5 Opponent model eval

Use completed draft replays.

Metrics:

- Position probability Brier score.
- Top-position accuracy.
- Player top-k accuracy.
- Positional-run precision and recall.
- Tier-crossing probability calibration.

The combined model must beat ADP-only and need-only baselines before it drives
urgent alerts.

### 13.6 Final-roster quality eval

Secondary, not primary.

Compare:

- Historical or projected points above replacement.
- Starter completeness.
- Bench ceiling.
- Bye concentration.
- Accepted preference adherence.
- Counterfactual roster from simple custom-rank-only drafting.

Do not optimize final-roster quality by violating configured preferences.

### 13.7 Realtime agent eval

Test utterances:

- Navigation.
- Historical filtering and grouping.
- Ranking and tier explanations.
- Three-candidate recommendation requests.
- Ambiguous confirmation.
- Explicit acceptance.
- Plan modification.
- Stale proposal rejection.
- Interruption while the draft state changes.

Metrics:

- Tool selection accuracy.
- Tool argument validity.
- Calculation citation/evidence fidelity.
- Proposal confirmation safety.
- View-selection appropriateness.
- Unnecessary interruption count.

### 13.8 Latency service levels

- Draft pick reflected in deterministic state: p95 under 1 second.
- Candidate shortlist refreshed: p95 under 2 seconds.
- Spoken explanation begins: p95 under 4 seconds.
- Manual navigation response: p95 under 150 milliseconds.

## 14. Implementation roadmap

The product specification remains product and architecture truth. Current
execution status, operational checks, and post-Phase-7 work are maintained in
[docs/roadmap-2026.md](roadmap-2026.md); reusable bounded-session structure is
in [docs/session-packets/TEMPLATE.md](session-packets/TEMPLATE.md).

### Phase 0: Contracts and replay foundation

Deliver:

- OpenAPI v1 skeleton and versioned compatibility contract for
  `/players/latest`.
- Generated TypeScript contracts under `behavior/api/`.
- CI contract-drift check.
- Side-effect-free TypeScript draft-session reducer.
- Thin React draft-listener adapter.
- Draft event-log format.
- Recorded ESPN mock fixture.
- Node/Jest replay runner.
- API canonical-event validation and SQLite persistence.
- Current greedy predictor outputs frozen as the ADP/need baseline.
- Calculation versioning convention.
- Baseline eval runner.

Exit criteria:

- Existing live draft can be replayed in Node without React or a browser.
- Replay output matches the picks, current pick, and roster ownership observed
  in the live dashboard.
- Canonical events survive an API write/read round trip.
- Repeated event submission produces no duplicate picks.
- A stale generated API client fails CI.
- Duplicate and missing-pick regressions are covered.

Rollback points:

- The existing hook path remains available behind a temporary adapter flag
  until replay parity passes.
- `/players/latest` retains its existing wire shape.
- Embedded rankings remain available when the API is unavailable.
- New session endpoints are additive and their SQLite file is disposable.

### Phase 1: Historical data foundation

Status: implemented and verified locally on July 30, 2026.

Deliver:

- nflverse ingestion.
- Player identity mapping.
- Parquet and DuckDB historical store.
- SQLite application store.
- Five-season weekly data.
- Scoring profile engine.
- Historical distribution endpoints.

Exit criteria:

- Historical points reproduce golden scoring fixtures.
- Player comparisons work without an LLM.

### Phase 2: Rankings and tiers

Status: implemented with automated verification on July 30, 2026; manual
usability review remains pending.

Deliver:

- Named positional ranking profiles.
- Drag-and-drop editor.
- User-tier editor.
- Revision history and undo/redo.
- `standard_deviation_v1` projection tiers.
- Rank-to-tier projection ranges.
- Rookie and insufficient-history uncertainty.

Exit criteria:

- User ranks and tiers persist across reloads.
- Current API tier fixtures remain stable.
- User and projection tiers are understandable in usability review.

### Phase 3: Manual analysis workspace

Status: implemented with automated verification on July 30, 2026; manual
visual review remains pending. The typed, bounded `AnalysisQuery` contract,
deterministic historical execution endpoint, generated dashboard client,
fail-closed line/bar/scatter renderer, desktop/mobile four-view workspace,
persistent view pinning, and player comparison drawer are implemented.

Deliver:

- Typed `AnalysisQuery`.
- Historical query endpoints.
- Declarative chart renderer.
- Player comparison drawer.
- Four views in manual mode.
- View pinning.

Exit criteria:

- All required group/filter/sort operations work without GPT.
- Charts render only validated specifications.

### Phase 4: Deterministic live advisor

Status: implementation and recorded calibration complete. The campaign has
5/5 qualifying recorded mocks and 5/4 distinct target slots, with no remaining
qualification or coverage gaps. The first five live-advisor slices are
implemented. A pure, versioned
three-candidate recommendation kernel now
enforces positional-rank ordering and roster capacity, optimizes starter and
flex assignment, discounts bench upside, exposes projection/replacement/tier
and survival evidence, reacts to draft state in the dashboard, and proposes
automatic analysis-view transitions while respecting persistent view pinning.
A deterministic combined opponent model now adds per-pick position and player
probabilities, exact run risk, configured user-tier crossing risk, and recorded
replay metrics. The combined model is gated against ADP-only and need-only
baselines before its evidence reaches the live advisor. Broader completed-draft
calibration now includes a counterfactual snake-draft runner that scores roster
legality, starter completeness, projected starter points, points above
replacement, bench ceiling above replacement, positional-rank violations, and local decision
latency across combined, ADP-only, need-only, and rank-only strategies.
Versioned recommendation and opponent-forecast snapshots now publish to
SQLite-backed draft-session endpoints with OpenAPI-generated dashboard types,
canonical-event counts, deterministic input fingerprints, serialized client
writes, stale-write rejection, and local calculation fallback. The first
recorded 10-team ESPN PPR mock now preserves all 160 platform picks, including
21 explicitly excluded K/DST clock events, while replaying 14 QB/RB/WR/TE
decisions from the user's recorded slot. The combined matrix passes legality,
starter completeness, positional-rank, starter-value, and latency gates. Its
recorded bench ceiling above replacement meets the 90% counterfactual floor.
The readiness audit is true at 5/5 recorded mocks and 5/4 recorded draft slots.
The recorded evidence covers slots 1, 3, 6, 8, and 9, team sizes 10 and 12,
and PPR and Standard scoring, with no remaining qualification or coverage gaps.
Synthetic fixtures never count toward those evidence thresholds or the
counterfactual quality ratios.

The versioned Phase 4 campaign manifest now validates declared ESPN provenance,
complete replay eligibility, fixture-integrity fingerprints, and captured-board
deduplication before evidence can count. It reports exact mock, slot, team-size,
and scoring gaps while keeping wall-clock latency as runtime telemetry rather
than stable evidence identity. See `docs/phase4-calibration-campaign.md`.

Opponent-run measurement is now operationally available from the labeled
slot-6 and slot-1 recorded exports: an additive versioned local evidence
envelope retains pre-pick opponent forecasts with the raw provider-board
boundary, deterministic model-input and observation fingerprints, target
roster, and exact forecast. Together those fixtures contribute 191 labeled
opponent picks across 21 terminal windows. The slot-8 export is intentional
roster-only recovery evidence: it qualifies for completed-board calibration but
does not contribute opponent metrics; the two earlier recorded exports remain
valid but unlabeled.
QB/RB/WR/TE pick metrics use only the latest valid observation before each
actual pick; run/tier metrics use one complete earliest/widest representative
per terminal forecast window.
Malformed optional labels fail closed for opponent reporting without changing
otherwise valid ESPN roster evidence, and synthetic fixtures never contribute.
Completed snapshots opened after the fact create no forecast labels; a
cumulative mid-draft catch-up may retain forecasts only for picks strictly
after its raw observed boundary, never retrospective labels for observed picks.
The live panel exposes capture state and requires an accessible export
preflight/confirmation; it distinguishes local metric availability from
authoritative ESPN campaign eligibility and never presents local labels as
cryptographic source authentication.
The campaign truthfully stands at 5/5 recorded mocks and 5/4 slots, including
the required target slots 1, 3, 6, and 9. Opponent metrics are calculated only
from the two qualifying recorded exports that preserve valid forecast labels;
they are not extrapolated to roster-only or unlabeled fixtures.

Deliver:

- API-backed draft sessions.
- Roster legality.
- Marginal lineup valuation.
- Bench-upside valuation.
- Tier-cliff and survival calculations.
- Current-draft opponent model.
- Three-candidate recommendations.
- Automatic view switching with explanation.
- Draft replay metrics.
- Comparison against the frozen current greedy predictor, ADP-only, and
  need-only baselines.

Exit criteria:

- Calculation and preference tests pass.
- Combined opponent model beats at least one simple baseline.
- Latency targets pass in recorded replays.

### Phase 5: Realtime text and voice

Status: slices 1 through 4 are complete. The Flask API owns Realtime session
configuration and mints a short-lived client secret for an existing draft
session. The dashboard has versioned read/proposal tools, exact-confirmation
and stale-proposal handling, session-local plan persistence, an explicit-connect
browser WebRTC client, selectable text and voice interaction, application-owned
tool dispatch, bounded reconnect, response cancellation, deterministic
cooldown-limited draft-event prompting, and a deterministic mock transport.
Voice mode owns microphone and remote-playback cleanup, preserves mute state
across reconnects, renders audio transcripts, and reflects server-VAD
interruption without duplicating cancellation. The implementation is complete;
a credential-backed browser/device smoke remains an operational check.

Deliver:

- Flask Realtime session broker.
- Browser WebRTC client.
- Typed advisor tools.
- Text and selectable voice modes.
- Proposal and confirmation protocol.
- Live draft-plan document.
- Reconnection and stale-proposal handling.

Exit criteria:

- No unconfirmed state mutation in evals.
- Ambiguous confirmations fail safely.
- Draft continues deterministically when the model is unavailable.

### Phase 6: Status enrichment

Status: complete. OpenAPI defines bounded status observations,
events, impacts, and player responses. The local API persists semantically
distinct events in SQLite, refreshes unchanged observations without duplicate
alerts, calculates type-specific staleness at read time, and returns an empty
successful response when providers are unavailable. The generated dashboard
client filters stale/no-impact states and selects only the newest state per
type/source channel. A fixture-backed nflverse injury adapter now selects the
latest weekly report, maps GSIS identities to dashboard ESPN IDs, applies
conservative deterministic impact rules, and exposes misses instead of
guessing. The selected-player sidebar visibly presents summary, provenance,
fetch time, confidence, impact, and staleness. Weekly nflverse roster
snapshots create explicit suspension, resolution, and team-change states, while
the nflverse trade ledger creates dated player transaction events. GSIS and PFR
identities must resolve through the catalog, missing providers are isolated,
and repeated polling refreshes without duplicating events. A fixture-backed,
fail-closed ESPN adapter now accepts at most the newest profile metadata item
that explicitly names the selected player, has an ESPN link and publication
timestamp, and stores no article body. General team stories and malformed or
external items are rejected. A shared dashboard status cache now loads the
three current candidates and inspected player through one deduplicated
five-minute cache. Recommendation cards show at most two
fresh review/material events with provenance while stale, no-impact, resolved,
and unavailable-provider states stay out of recommendation alerts. Status
remains presentation evidence and cannot silently reorder deterministic
candidates. The final summary slice adds a deterministic one-sentence fallback
and an optional offline OpenAI refresh over at most four current structured
events. Model inputs exclude player IDs, URLs, raw payloads, and article bodies;
strict output is cached against the exact event set, and live API reads never
wait on the model.

Deliver:

- Injury adapter.
- Suspension and transaction adapter.
- ESPN profile snippet adapter.
- Status-change diffing.
- Optional cheap-model one-sentence summary.
- Source, timestamp, confidence, and impact display.

Exit criteria:

- No duplicate status events.
- Stale source data is visible.
- Missing news providers do not block rankings or live drafting.

### Phase 7: Hardening

Status: complete. A recorded 160-pick ESPN draft now
runs through the versioned extension message, platform parser, pure reducer,
completed advisor replay, a disposable live Flask/SQLite process, and
persisted advisor snapshots. The acceptance path asserts all 139
advisor-eligible canonical events in order, idempotent replay,
same-snapshot duplicate handling,
fail-closed malformed rows, raw-platform payload rejection without partial
writes, and deterministic replay during an API outage. See
`docs/phase7-hardening.md`. Extension version `0.0.0.6` also isolates every
ESPN selector in a browser-safe extractor, verifies it against a recorded DOM
fixture, and emits bounded versioned health reports on state transitions or
every 30 seconds. The dashboard validates those reports and visibly
distinguishes degraded or unavailable capture from an empty pre-draft history.
The credential-free `npm run eval:phase7` hard gate also checks generated API
types, the complete deterministic replay suite, server-owned Realtime prompt
and bounded-tool configuration, source-event/tool-grounded automatic advice,
two-pick normal-advice cooldowns, explicit stale/ambiguous confirmation safety,
and the 150 ms deterministic advice p95. It does not claim mocked responses
measure model quality; future model-version transcript evals add to these
invariants rather than replacing them.
The credential-free `npm run a11y:phase7` regression also verifies that global
draft shortcuts do not hijack editable controls or Cmd combinations while
preserving the intentional Meta-key hold behavior. Player search and the
historical player-comparison drawer are named modal dialogs with initial focus,
Escape, focus containment, and opener return. Player-search results, the
shared rankings menu, draft-history cells, and ranking-card actions have
keyboard equivalents. Source and Realtime state uses polite live updates;
unconfirmed plan proposals and broker failures use assertive alerts. Drag and
drop custom ranking still requires a later manual assistive-technology audit.
The resilience slice keeps capture-bridge freshness, ESPN selector-health
freshness, API persistence, and Realtime availability distinct. Canonical
picks are always applied locally before optional API sync; failed batches stay
bounded and retry manually without changing the local board, and recovery is
announced once. Realtime retry exhaustion explicitly leaves deterministic
recommendations active and retains a manual reconnect path. See
`docs/phase7-hardening.md` for the credential-free resilience gate and current
in-memory/offline limitations.
The final local-recovery slice adds a human-readable, versioned local-data
package for normalized custom positional ranks/tiers, supported preferences,
targets, and current confirmed plan text. Its import is strict, previewed,
atomic across affected browser keys where storage permits rollback, and refused
after the first pick so a live board is never mixed. It excludes picks, roster
state, connection/API/Realtime state, provider data, and secrets. Run
`npm run portability:phase7`; details and remaining manual assistive-technology
audit scope are in `docs/phase7-hardening.md`.

Deliver:

- Full end-to-end ESPN mock suite.
- Extension selector monitoring.
- Model and prompt eval baselines.
- Accessibility and keyboard navigation.
- Error, reconnect, and offline UX.
- Validated local user-data export/import.

Exit criteria:

- Full mock draft succeeds without manual repair.
- Deterministic fallback covers model/API outages.
- All priority eval thresholds pass.
- Accessibility, resilience, and portability gates pass.

## 15. Main risks and mitigations

### Source and identity drift

Mitigation:

- Canonical GSIS-centered identity.
- Explicit source mappings.
- Missing-ID queue and manual overrides.
- Source timestamps and versioned imports.

### Projection uncertainty

Mitigation:

- Ranges rather than single-point certainty.
- Wider rookie and low-sample distributions.
- Visible methodology and confidence.
- Strategy versioning and replay evals.

### Dual-tier UX complexity

Mitigation:

- User tiers visually primary.
- Computed tiers optional and lower contrast.
- Shared tier-detail drawer.
- Usability gate before Realtime automation.

### Model overreach

Mitigation:

- Bounded tools.
- Deterministic calculations.
- Typed proposals.
- Explicit confirmation.
- No platform drafting.
- Recorded agent evals.

### Draft-platform DOM changes

Mitigation:

- Versioned extension contract.
- Platform parser isolation.
- Selector probes and recorded DOM fixtures.
- Cumulative snapshots and deduplication.

## 16. Completed-foundation historical note

The former “Immediate next implementation slice” described the contract/replay
core, canonical API ingest and baselines, the one-season historical vertical,
and the five-season analytical store. Those foundation slices were completed
through Phases 0-3 and are retained here only as historical context; they are
not pending work. Current execution and status truth is in
[docs/roadmap-2026.md](roadmap-2026.md).
