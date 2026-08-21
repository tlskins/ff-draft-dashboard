import React, {useMemo} from "react"

import type {
  DraftRecommendationCandidate,
  DraftRecommendationSet,
} from "../../behavior/draft-advisor/recommendations"
import type {Player} from "../../types"
import styles from "./InsightDeck.module.css"


const POSITION_ORDER = ["QB", "RB", "WR", "TE"] as const

const ppgBand = (candidate: DraftRecommendationCandidate): string => (
  `${candidate.evidence.projectedFloor.toFixed(1)}–${candidate.evidence.projectedCeiling.toFixed(1)}`
)

const tierLabel = (candidate: DraftRecommendationCandidate): string => {
  if (candidate.evidence.userTier !== null) return `T${candidate.evidence.userTier}`
  if (candidate.evidence.projectionTier !== null) {
    return `Proj T${candidate.evidence.projectionTier}`
  }
  return "—"
}

const followUpFor = (
  candidate: DraftRecommendationCandidate,
  candidates: DraftRecommendationCandidate[],
): DraftRecommendationCandidate | null => candidates
  .filter(other => other.player.id !== candidate.player.id)
  .sort((left, right) => {
    const leftSurvival = Math.max(0, Math.min(1, left.evidence.survivalProbability))
    const rightSurvival = Math.max(0, Math.min(1, right.evidence.survivalProbability))
    const expectedLeft = left.evidence.projectedMedian * leftSurvival
    const expectedRight = right.evidence.projectedMedian * rightSurvival
    return expectedRight - expectedLeft
      || right.evidence.projectedMedian - left.evidence.projectedMedian
      || right.score - left.score
      || left.player.id.localeCompare(right.player.id)
  })[0] || null

const PlayerButton = ({
  candidate,
  onInspectPlayer,
}: {
  candidate: DraftRecommendationCandidate
  onInspectPlayer: (player: Player) => void
}) => (
  <button
    className={styles.decisionPlayer}
    onClick={() => onInspectPlayer(candidate.player)}
    type="button"
  >
    <strong>{candidate.player.fullName}</strong>
    <span>{candidate.player.team} · {candidate.player.position}{candidate.positionRank}</span>
  </button>
)

const PositionDecisionTable = ({
  recommendations,
  onInspectPlayer,
}: {
  recommendations: DraftRecommendationSet | null
  onInspectPlayer: (player: Player) => void
}) => {
  const candidates = useMemo(() => (
    [...(recommendations?.positionCandidates || recommendations?.candidates || [])]
      .filter(candidate => POSITION_ORDER.includes(
        candidate.player.position as typeof POSITION_ORDER[number],
      ))
      .sort((left, right) => (
        right.score - left.score
        || left.positionRank - right.positionRank
        || left.player.id.localeCompare(right.player.id)
      ))
  ), [recommendations])
  const byPosition = useMemo(() => {
    const result = new Map<string, DraftRecommendationCandidate>()
    candidates.forEach(candidate => {
      if (!result.has(candidate.player.position)) {
        result.set(candidate.player.position, candidate)
      }
    })
    return result
  }, [candidates])

  if (candidates.length === 0) {
    return <p className={styles.unavailable}>No current positional recommendations are available.</p>
  }

  return (
    <section aria-label="Top option at each position" className={styles.decisionTableSurface}>
      <header className={styles.decisionTableHeader}>
        <div>
          <p>Current board</p>
          <h3>Top option by position</h3>
        </div>
        <span>Follow-up uses the remaining current-board leaders.</span>
      </header>
      <div className={styles.decisionTableScroll}>
        <table className={styles.decisionTable}>
          <thead>
            <tr>
              <th scope="col">Pos</th>
              <th scope="col">Take now</th>
              <th scope="col">PPG band</th>
              <th scope="col">Tier · next-pick risk</th>
              <th scope="col">Best projected next target</th>
            </tr>
          </thead>
          <tbody>
            {POSITION_ORDER.flatMap(position => {
              const candidate = byPosition.get(position)
              if (!candidate) return []
              const followUp = followUpFor(candidate, candidates)
              return [<tr key={position}>
                <th scope="row">
                  <span className={styles[`decisionPosition${position}`]}>{position}</span>
                </th>
                <td><PlayerButton candidate={candidate} onInspectPlayer={onInspectPlayer} /></td>
                <td>
                  <strong>{ppgBand(candidate)}</strong>
                  <span>{candidate.evidence.projectedMedian.toFixed(1)} median</span>
                </td>
                <td>
                  <strong>{tierLabel(candidate)}</strong>
                  <span>{Math.round((1 - candidate.evidence.survivalProbability) * 100)}% at risk</span>
                </td>
                <td>{followUp
                  ? <>
                      <PlayerButton candidate={followUp} onInspectPlayer={onInspectPlayer} />
                      <span>{Math.round(followUp.evidence.survivalProbability * 100)}% chance available</span>
                    </>
                  : <span>Unavailable</span>}
                </td>
              </tr>]
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default PositionDecisionTable
