import React from "react"

import type {AdvisorComparisonController} from "../behavior/hooks/useAdvisorComparisonController"
import AnalysisWorkspace from "../components/analysis/AnalysisWorkspace"
import {ReadApiProvider} from "../behavior/api/readApiContext"

type AnalysisWorkspaceProps = React.ComponentProps<typeof AnalysisWorkspace>
type TestAnalysisWorkspaceProps = Omit<
  AnalysisWorkspaceProps,
  "comparisonController"
> & {comparisonController?: AdvisorComparisonController}

const TestAnalysisWorkspace = ({
  comparisonController,
  ...props
}: TestAnalysisWorkspaceProps) => {
  const availableIds = new Set((props.availablePlayers || props.players).map(
    player => player.id,
  ))
  const recommendationPlayers = (props.recommendations?.candidates || [])
    .map(item => item.player)
    .filter(player => availableIds.has(player.id))
  const candidates = (recommendationPlayers.length > 0
    ? recommendationPlayers
    : [...(props.availablePlayers || props.players)]
      .filter(player => ["QB", "RB", "WR", "TE"].includes(player.position))
      .sort((left, right) => left.fullName.localeCompare(right.fullName)))
    .slice(0, 3)
  const fallback: AdvisorComparisonController = {
    mode: "auto",
    items: candidates.map(player => ({
      player,
      reasonCode: recommendationPlayers.length > 0
        ? "recommended_now"
        : "top_position",
      reasonLabel: recommendationPlayers.length > 0
        ? "Recommended now"
        : `Top ${player.position}`,
    })),
    announcement: "",
    pinCurrent: () => undefined,
    restoreAuto: () => undefined,
    addPinnedPlayer: () => undefined,
    removePinnedPlayer: () => undefined,
  }
  return (
    <ReadApiProvider>
      <AnalysisWorkspace
        {...props}
        comparisonController={comparisonController || fallback}
      />
    </ReadApiProvider>
  )
}

export default TestAnalysisWorkspace
