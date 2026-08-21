import React from "react"
import {render, screen, waitFor} from "@testing-library/react"

import {ReadApiCache} from "../behavior/api/readApiCache"
import {ReadApiProvider} from "../behavior/api/readApiContext"
import {useDataReadiness} from "../behavior/api/dataReadiness"
import {loadHistoricalComparisonResource} from "../behavior/api/historicalResources"
import PlayerLabInsightSurface from "../components/insight/PlayerLabInsightSurface"
import {completedDataReadinessState} from "../test-support/dataReadiness"


jest.mock("../behavior/api/dataReadiness", () => ({
  ...jest.requireActual("../behavior/api/dataReadiness"),
  useDataReadiness: jest.fn(),
}))
jest.mock("../behavior/api/historicalResources", () => ({
  ...jest.requireActual("../behavior/api/historicalResources"),
  loadHistoricalComparisonResource: jest.fn(),
}))

const players = ["one", "two"].map((id, index) => ({
  id,
  firstName: id,
  lastName: "Player",
  fullName: `${id} Player`,
  position: "RB",
  team: "BUF",
  ranks: {},
  index,
}))
const distribution = {
  games: 10, mean: 12, median: 12, std_dev: 3,
  minimum: 5, p10: 7, p25: 9, p50: 12, p75: 15, p90: 18, maximum: 22,
}
const response = {
  season: 2025,
  seasons: [2021, 2022, 2023, 2024, 2025],
  scoring_profile: {id: "ppr", weights: {}},
  sources: [],
  players: players.map(player => ({
    player_id: player.id,
    player_name: player.fullName,
    position: player.position,
    distribution,
    season_distributions: [{season: 2025, distribution}],
    weeks: [{season: 2025, week: 1, points: 12}],
  })),
}
const comparisonController = {
  mode: "auto",
  items: players.map(player => ({
    player,
    reasonCode: "recommended_now",
    reasonLabel: "Recommended now",
  })),
  announcement: "",
  pinCurrent: jest.fn(),
  restoreAuto: jest.fn(),
  addPinnedPlayer: jest.fn(),
  removePinnedPlayer: jest.fn(),
}

describe("automatic Player Lab insight", () => {
  beforeEach(() => {
    jest.mocked(useDataReadiness).mockReturnValue(completedDataReadinessState)
    jest.mocked(loadHistoricalComparisonResource).mockResolvedValue({
      state: "ready",
      data: response,
    } as never)
  })

  it("runs immediately for Players in play with the league scoring and 2021–2025 default", async () => {
    render(<ReadApiProvider cache={new ReadApiCache()}>
      <PlayerLabInsightSurface
        availablePlayers={players as never}
        comparisonController={comparisonController as never}
        onInspectPlayer={jest.fn()}
        settings={{ppr: true} as never}
      />
    </ReadApiProvider>)

    await waitFor(() => expect(loadHistoricalComparisonResource).toHaveBeenCalledWith(
      expect.any(ReadApiCache),
      {
        playerIds: ["one", "two"],
        seasons: [2021, 2022, 2023, 2024, 2025],
        scoringProfile: "ppr",
      },
    ))
    expect((screen.getByRole("combobox", {
      name: "Player Lab season window",
    }) as HTMLSelectElement).value).toBe("5")
    expect((screen.getByRole("combobox", {
      name: "Player Lab scoring profile",
    }) as HTMLSelectElement).value).toBe("ppr")
    expect(await screen.findByRole("region", {name: "Automatic Player Lab"})).toBeTruthy()
    expect(await screen.findByText("Weekly scoring distribution")).toBeTruthy()
  })
})
