import React from "react"

import type {
  RoundMarketBucket,
  RoundMarketPositionLane,
  RoundMarketPresentationModel,
  RoundMarketTier,
} from "../../behavior/analysis/roundMarket"
import styles from "./RoundRunMatrix.module.css"

interface RoundRunMatrixProps {
  model: RoundMarketPresentationModel | null | undefined
}

const percent = (value: number | null): string => (
  value === null ? "Unavailable" : `${Math.round(value * 100)}%`
)

const expected = (value: number | null, suffix: string): string => (
  value === null ? "Unavailable" : `${value.toFixed(1)} ${suffix}`
)

const needLabel = (slots: number | null, teams: number | null): string => {
  if (slots === null || teams === null) return "Unavailable"
  return `${teams} team${teams === 1 ? "" : "s"} · ${slots} slot${slots === 1 ? "" : "s"}`
}

const bucketHeading = (bucket: RoundMarketBucket): string => {
  if (bucket.provenance === "unavailable") {
    return bucket.id === "next_user_turn"
      ? "Next turn market unavailable"
      : "Following turn market unavailable"
  }
  if (bucket.id === "next_user_turn") {
    return bucket.targetOverallPick === null
      ? "Next turn · frozen positional evidence"
      : `Next turn · before pick ${bucket.targetOverallPick} · frozen positional evidence`
  }
  return bucket.targetOverallPick === null
    ? "Following turn · provisional static-board estimate"
    : `Following turn · before pick ${bucket.targetOverallPick} · provisional static-board estimate`
}

const tierStateLabel = (tier: RoundMarketTier): string => {
  if (tier.status === "authority_mismatch") return "Tier authority mismatch"
  if (tier.status === "pool_incomplete") return "Tier pool incomplete"
  if (tier.status === "unavailable") return "Tier unavailable"
  return "Tier evidence unavailable"
}

const canRenderTierEstimate = (tier: RoundMarketTier): boolean => (
  tier.status === "available"
  && tier.provenance === "static_board_derived_v1"
  && Boolean(tier.assumption)
)

const TierEvidence: React.FC<{tier: RoundMarketTier; turn: string}> = ({tier, turn}) => {
  const heading = tier.tier === null ? tierStateLabel(tier) : `Tier ${tier.tier}`
  if (!canRenderTierEstimate(tier)) {
    const malformedProvenance = tier.status === "available"
      ? "Tier provenance unavailable"
      : tierStateLabel(tier)
    const reason = tier.status === "available"
      ? "Tier is marked available without a static-board provenance and assumption."
      : tier.unavailableReason
    return (
      <li className={styles.tierUnavailable}>
        <strong>{heading}</strong>
        <span>{malformedProvenance}{reason ? ` · ${reason}` : ""}</span>
      </li>
    )
  }
  return (
    <li className={styles.tierEvidence}>
      <span><strong>{heading}</strong> · {tier.availablePlayerCount} avail</span>
      <span>{percent(tier.exhaustionProbabilityByEndOfBucket)} exhausted · {expected(tier.expectedUniquePlayersTakenInBucket, "expected gone")}</span>
      <small>Static-board estimate · {turn}</small>
    </li>
  )
}

const MatrixCell: React.FC<{bucket: RoundMarketBucket; lane: RoundMarketPositionLane}> = ({bucket, lane}) => {
  const turn = bucket.id === "next_user_turn" ? "next turn" : "following turn"
  const unavailable = bucket.provenance === "unavailable"
  const runLabel = lane.runThreshold === null
    ? "Run threshold unavailable"
    : lane.probabilityAtLeastThreshold === null
      ? `Run probability unavailable for ${lane.runThreshold}+ ${lane.position} picks`
      : `${percent(lane.probabilityAtLeastThreshold)} chance of ${lane.runThreshold}+ ${lane.position} picks`
  return (
    <td className={styles.cell}>
      <div aria-label={unavailable ? "Market unavailable" : runLabel} className={styles.runMetric}>
        <strong>{unavailable ? "—" : percent(lane.probabilityAtLeastThreshold)}</strong>
        <span>{unavailable
          ? "Market unavailable"
          : lane.runThreshold === null
            ? "Run threshold unavailable"
            : `${lane.runThreshold}+ ${lane.position} picks`}</span>
      </div>
      <div className={styles.cellTopline}>
        <span>{unavailable ? bucket.unavailableReason || "No usable market evidence." : expected(lane.expectedPositionalPicks, "expected positional picks")}</span>
      </div>
      <dl className={styles.needEvidence}>
        <div>
          <dt>Starter</dt>
          <dd>{needLabel(
            lane.observedNeed.otherTeamsOpenStarterSlots,
            lane.observedNeed.otherTeamsWithOpenStarter,
          )}</dd>
        </div>
        <div>
          <dt>FLEX</dt>
          <dd>{needLabel(
            lane.observedNeed.otherTeamsOpenFlexSlots,
            lane.observedNeed.otherTeamsWithOpenFlex,
          )}</dd>
        </div>
      </dl>
      <ul aria-label={`${lane.position} tier depletion for ${turn}`} className={styles.tierList}>
        {lane.tiers.length > 0 ? lane.tiers.slice(0, 2).map(tier => (
          <TierEvidence key={tier.id} tier={tier} turn={turn} />
        )) : (
          <li className={styles.tierUnavailable}>No active-board tier evidence supplied.</li>
        )}
      </ul>
    </td>
  )
}

const RoundRunMatrix: React.FC<RoundRunMatrixProps> = ({model}) => {
  if (!model || model.buckets.length !== 2) {
    return (
      <section aria-labelledby="round-run-matrix-title" className={styles.unavailable}>
        <h2 id="round-run-matrix-title">Two-turn run market unavailable</h2>
        <p>No valid two-turn market evidence is supplied for this draft boundary.</p>
      </section>
    )
  }
  const [next, following] = model.buckets
  const lanes = next.positions
  return (
    <section aria-labelledby="round-run-matrix-title" className={styles.surface}>
      <header className={styles.header}>
        <p className={styles.kicker}>Position market</p>
        <h2 id="round-run-matrix-title">What can run before the next two turns?</h2>
        <p>At-least-N run chance, roster demand, and tier exhaustion for each upcoming turn.</p>
      </header>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption>Two-turn position run market. Each cell shows the chance of at least the stated number of positional picks, expected positional picks, observed other-roster needs, and tier depletion.</caption>
          <thead>
            <tr>
              <th scope="col">Position</th>
              <th scope="col">{bucketHeading(next)}</th>
              <th scope="col">{bucketHeading(following)}</th>
            </tr>
          </thead>
          <tbody>
            {lanes.map(lane => {
              const followingLane = following.positions.find(candidate => candidate.position === lane.position)
              return (
                <tr key={lane.position}>
                  <th scope="row" className={styles.position}>{lane.position}</th>
                  <MatrixCell bucket={next} lane={lane} />
                  {followingLane ? <MatrixCell bucket={following} lane={followingLane} /> : (
                    <td className={styles.cell}>Following-turn position evidence unavailable.</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default RoundRunMatrix
