import fixture from "./fixtures/completed-draft-replay.json"
import recordedEspnFixture from "./fixtures/recorded-espn-2026-slot-9.json"
import {
  materializeCompletedDraftReplay,
  RecordedCompletedDraftReplay,
} from "../behavior/draft-advisor/completedDraftReplay"
import {
  captureCompletedDraftReplay,
  validateCompletedDraftReplay,
} from "../behavior/draft-advisor/replayFixtures"
import { ThirdPartyRanker } from "../types"

const replay = fixture as unknown as RecordedCompletedDraftReplay
const recordedReplay =
  recordedEspnFixture as unknown as RecordedCompletedDraftReplay

describe("completed replay fixtures", () => {
  it("validates completion, unique picks, and snake ownership", () => {
    expect(validateCompletedDraftReplay(replay)).toEqual([])

    const invalid = JSON.parse(JSON.stringify(
      replay,
    )) as RecordedCompletedDraftReplay
    invalid.actualPicks[1].playerId = invalid.actualPicks[0].playerId
    invalid.actualPicks[2].rosterIndex = 0

    expect(validateCompletedDraftReplay(invalid)).toEqual(
      expect.arrayContaining([
        "player rb-1 is drafted more than once",
        "pick 3 has invalid snake roster index",
      ]),
    )
  })

  it("captures a portable recorded fixture from live dashboard state", () => {
    const materialized = materializeCompletedDraftReplay(replay)
    const captured = captureCompletedDraftReplay({
      id: "ESPN:Captured Mock",
      settings: materialized.settings,
      targetRosterIndex: replay.targetRosterIndex,
      boardSettings: materialized.boardSettings,
      rankingSummaries: materialized.rankingSummaries,
      playerLib: materialized.playerLib,
      draftHistory: replay.actualPicks.map(pick => pick.playerId),
    })

    expect(captured).toMatchObject({
      fixtureVersion: 1,
      id: "ESPN:Captured Mock",
      provenance: "recorded",
      targetRosterIndex: 0,
    })
    expect(captured.players).toHaveLength(replay.players.length)
    expect(captured.actualPicks).toEqual(replay.actualPicks)
    expect(validateCompletedDraftReplay(captured)).toEqual([])
  })

  it("includes matching local forecast evidence and rejects stale export evidence", () => {
    const materialized = materializeCompletedDraftReplay(replay)
    const forecastEvidence = {
      schemaVersion: 1,
      sessionId: "ESPN:Forecast Capture",
      observations: [{
        observedThroughOverallPick: 0,
        inputFingerprint: "00000000",
        observationFingerprint: "00000000",
        modelIdentity: "deterministic_opponent_v1",
        model: "combined",
        targetRosterIndex: replay.targetRosterIndex,
        forecast: {
          schemaVersion: 1,
          model: "combined",
          targetRosterIndex: replay.targetRosterIndex,
          picks: [],
          runProbabilities: [],
          tierBoundaryProbabilities: [],
        },
      }],
    } as unknown as RecordedCompletedDraftReplay["forecastEvidence"]
    const captured = captureCompletedDraftReplay({
      id: "ESPN:Forecast Capture",
      settings: materialized.settings,
      targetRosterIndex: replay.targetRosterIndex,
      boardSettings: materialized.boardSettings,
      rankingSummaries: materialized.rankingSummaries,
      playerLib: materialized.playerLib,
      draftHistory: replay.actualPicks.map(pick => pick.playerId),
      forecastEvidence,
    })
    expect(captured.forecastEvidence).toBe(forecastEvidence)

    expect(() => captureCompletedDraftReplay({
      id: "ESPN:Other Capture",
      settings: materialized.settings,
      targetRosterIndex: replay.targetRosterIndex,
      boardSettings: materialized.boardSettings,
      rankingSummaries: materialized.rankingSummaries,
      playerLib: materialized.playerLib,
      draftHistory: replay.actualPicks.map(pick => pick.playerId),
      forecastEvidence,
    })).toThrow("Replay forecast evidence belongs to a different draft session")

    const wrongTarget = (
      JSON.parse(JSON.stringify(forecastEvidence))
    ) as NonNullable<RecordedCompletedDraftReplay["forecastEvidence"]>
    wrongTarget.sessionId = "ESPN:Target Capture"
    wrongTarget.observations[0].targetRosterIndex = 1
    expect(() => captureCompletedDraftReplay({
      id: "ESPN:Target Capture",
      settings: materialized.settings,
      targetRosterIndex: replay.targetRosterIndex,
      boardSettings: materialized.boardSettings,
      rankingSummaries: materialized.rankingSummaries,
      playerLib: materialized.playerLib,
      draftHistory: replay.actualPicks.map(pick => pick.playerId),
      forecastEvidence: wrongTarget,
    })).toThrow("Replay forecast evidence belongs to a different draft session or target roster")
  })

  it("rejects incomplete captures instead of labeling them recorded", () => {
    const materialized = materializeCompletedDraftReplay(replay)

    expect(() => captureCompletedDraftReplay({
      id: "ESPN:Incomplete Mock",
      settings: materialized.settings,
      targetRosterIndex: replay.targetRosterIndex,
      boardSettings: materialized.boardSettings,
      rankingSummaries: materialized.rankingSummaries,
      playerLib: materialized.playerLib,
      draftHistory: replay.actualPicks
        .slice(0, 10)
        .map(pick => pick.playerId),
    })).toThrow("Replay capture is incomplete")
  })

  it("validates a complete ESPN board while preserving excluded picks", () => {
    expect(validateCompletedDraftReplay(recordedReplay)).toEqual([])
    expect(recordedReplay.actualPicks).toHaveLength(160)
    expect(recordedReplay.actualPicks.filter(pick =>
      pick.advisorEligible === false)).toHaveLength(21)
    expect(recordedReplay.actualPicks.filter(pick =>
      pick.rosterIndex === recordedReplay.targetRosterIndex
      && pick.advisorEligible)).toHaveLength(14)
  })

  it("captures a completed ESPN source snapshot and redacts member identity", () => {
    const materialized = materializeCompletedDraftReplay(recordedReplay)
    const playersById = new Map(
      recordedReplay.players.map(player => [player.id, player]),
    )
    const snapshot = {
      id: "ESPN:36954084",
      title: recordedReplay.source!.title,
      platform: "ESPN" as const,
      capturedAt: recordedReplay.source!.capturedAt,
      sourceUrl:
        "https://fantasy.espn.com/football/draft"
        + "?leagueId=36954084&teamId=9&memberId=private",
      completion: {
        complete: true,
        totalPicks: 160,
        numRounds: 16,
        numTeams: 10,
        platformRosterSize: 16,
        targetRosterIndex: 8,
        excludedPositions: ["D/ST", "K"],
        scoringFormat: "PPR" as const,
      },
      picks: recordedReplay.actualPicks.map(pick => {
        const player = pick.playerId
          ? playersById.get(pick.playerId)
          : undefined
        const round = Math.floor((pick.overallPick - 1) / 10) + 1
        const pickInRound = (pick.overallPick - 1) % 10 + 1
        return {
          imgUrl: player
            ? `https://a.espncdn.com/i/headshots/nfl/players/full/${player.id}.png`
            : "",
          name: pick.name || player?.name || "Platform pick",
          team: player?.team || "",
          position: pick.position || player?.position || "",
          pick: `R${round}, P${pickInRound}`,
        }
      }),
    }
    snapshot.picks[0] = {
      imgUrl: "",
      name: "Opponent Outside Universe",
      team: "IND",
      position: "WR",
      pick: "R1, P1",
    }

    const captured = captureCompletedDraftReplay({
      id: snapshot.id,
      settings: materialized.settings,
      targetRosterIndex: 0,
      boardSettings: materialized.boardSettings,
      rankingSummaries: materialized.rankingSummaries,
      playerLib: materialized.playerLib,
      draftHistory: [],
      sourceSnapshot: snapshot,
    })

    expect(captured.targetRosterIndex).toBe(8)
    expect(captured.settings.numBenchPlayers).toBe(7)
    expect(captured.actualPicks).toHaveLength(160)
    expect(captured.actualPicks[0]).toMatchObject({
      name: "Opponent Outside Universe",
      playerId: null,
      advisorEligible: false,
    })
    expect(captured.source?.sourceUrl).toBe(
      "https://fantasy.espn.com/football/draft?leagueId=36954084",
    )
    expect(validateCompletedDraftReplay(captured)).toEqual([])

    const targetPickIndex = recordedReplay.actualPicks.findIndex(pick =>
      pick.rosterIndex === 8 && pick.advisorEligible)
    const targetPick = snapshot.picks[targetPickIndex]
    snapshot.picks[targetPickIndex] = {
      imgUrl: "",
      name: "Target Outside Universe",
      team: "IND",
      position: "WR",
      pick: targetPick.pick,
    }
    expect(() => captureCompletedDraftReplay({
      id: snapshot.id,
      settings: materialized.settings,
      targetRosterIndex: 0,
      boardSettings: materialized.boardSettings,
      rankingSummaries: materialized.rankingSummaries,
      playerLib: materialized.playerLib,
      draftHistory: [],
      sourceSnapshot: snapshot,
    })).toThrow(
      "Target roster player Target Outside Universe lacks matching ranking data",
    )
  })

  it("captures an ESPN-only drafted rookie when the selected Harris rank is absent", () => {
    const materialized = materializeCompletedDraftReplay(recordedReplay)
    const love = materialized.playerLib["4870808"]
    love.ranks = {
      [ThirdPartyRanker.ESPN]: love.ranks[ThirdPartyRanker.ESPN]!,
    }
    const playersById = new Map(
      recordedReplay.players.map(player => [player.id, player]),
    )
    const snapshot = {
      id: "ESPN:36954084",
      title: recordedReplay.source!.title,
      platform: "ESPN" as const,
      capturedAt: recordedReplay.source!.capturedAt,
      sourceUrl: "https://fantasy.espn.com/football/draft?leagueId=36954084",
      completion: {
        complete: true,
        totalPicks: 160,
        numRounds: 16,
        numTeams: 10,
        platformRosterSize: 16,
        targetRosterIndex: 8,
        excludedPositions: ["D/ST", "K"],
        scoringFormat: "PPR" as const,
      },
      picks: recordedReplay.actualPicks.map(pick => {
        const player = pick.playerId
          ? playersById.get(pick.playerId)
          : undefined
        const round = Math.floor((pick.overallPick - 1) / 10) + 1
        const pickInRound = (pick.overallPick - 1) % 10 + 1
        return {
          imgUrl: player
            ? `https://a.espncdn.com/i/headshots/nfl/players/full/${player.id}.png`
            : "",
          name: pick.name || player?.name || "Platform pick",
          team: player?.team || "",
          position: pick.position || player?.position || "",
          pick: `R${round}, P${pickInRound}`,
        }
      }),
    }

    const captured = captureCompletedDraftReplay({
      id: snapshot.id,
      settings: materialized.settings,
      targetRosterIndex: 8,
      boardSettings: {
        ...materialized.boardSettings,
        ranker: ThirdPartyRanker.HARRIS,
      },
      rankingSummaries: materialized.rankingSummaries,
      playerLib: materialized.playerLib,
      draftHistory: [],
      sourceSnapshot: snapshot,
    })

    expect(captured.players.find(player => player.id === love.id)).toMatchObject({
      id: "4870808",
      positionRank: 6,
      adp: 17.6,
    })
    expect(validateCompletedDraftReplay(captured)).toEqual([])
  })
})
