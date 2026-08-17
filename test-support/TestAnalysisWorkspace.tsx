import React from "react"

import type {AdvisorComparisonController} from "../behavior/hooks/useAdvisorComparisonController"
import AnalysisWorkspace from "../components/analysis/AnalysisWorkspace"

type AnalysisWorkspaceProps = React.ComponentProps<typeof AnalysisWorkspace>
type TestAnalysisWorkspaceProps = Omit<
  AnalysisWorkspaceProps,
  "comparisonController"
> & {comparisonController?: AdvisorComparisonController}

const TestAnalysisWorkspace = ({
  comparisonController,
  ...props
}: TestAnalysisWorkspaceProps) => {
  const candidates = [...(props.availablePlayers || props.players)]
    .filter(player => ["QB", "RB", "WR", "TE"].includes(player.position))
    .sort((left, right) => left.fullName.localeCompare(right.fullName))
    .slice(0, 3)
  const fallback: AdvisorComparisonController = {
    mode: "auto",
    items: candidates.map(player => ({
      player,
      reasonCode: "top_position",
      reasonLabel: `Top ${player.position}`,
    })),
    announcement: "",
    pinCurrent: () => undefined,
    restoreAuto: () => undefined,
    addPinnedPlayer: () => undefined,
    removePinnedPlayer: () => undefined,
  }
  return (
    <AnalysisWorkspace
      {...props}
      comparisonController={comparisonController || fallback}
    />
  )
}

export default TestAnalysisWorkspace
