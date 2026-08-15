import React from "react"
import { fireEvent, render, waitFor } from "@testing-library/react"

import PortableDataControls from "../components/PortableDataControls"
import {
  PORTABLE_DATA_MAX_BYTES,
  PortableDataPackage,
  PortableDataPackageV2,
  PortableDataValidationError,
  applyRankingProfileV2Snapshot,
  createPortableDataPackage,
  parsePortableDataPackage,
  serializePortableDataPackage,
  writeStorageTransaction,
} from "../behavior/portableData"
import {
  FantasyPosition,
  FantasySettings,
  NFLTeam,
  Player,
  Rankings,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"

const settings: FantasySettings = {
  ppr: true,
  numTeams: 12,
  numStartingQbs: 1,
  numStartingRbs: 2,
  numStartingWrs: 2,
  numStartingTes: 1,
  numFlex: 1,
  numBenchPlayers: 5,
}

const player = (id: string, position: FantasyPosition, rank: number): Player => ({
  id,
  firstName: id,
  lastName: "Player",
  fullName: `${id} Player`,
  team: NFLTeam.FA,
  position,
  ranks: {
    [ThirdPartyRanker.HARRIS]: {
      playerId: id,
      ranker: ThirdPartyRanker.HARRIS,
      position,
      standardPositionRank: rank,
      pprPositionRank: rank,
      metricValuePpr: 100 - rank,
      metricValueStd: 90 - rank,
    },
    [ThirdPartyRanker.CUSTOM]: {
      playerId: id,
      copiedRanker: ThirdPartyRanker.HARRIS,
      ranker: ThirdPartyRanker.CUSTOM,
      position,
      standardPositionRank: rank,
      pprPositionRank: rank,
      pprPositionTier: {
        tierNumber: 1,
        upperLimitPlayerIdx: 0,
        upperLimitValue: 99,
        lowerLimitPlayerIdx: 0,
        lowerLimitValue: 99,
      },
    },
  },
})

const players = [
  player("qb-1", FantasyPosition.QUARTERBACK, 1),
  player("rb-1", FantasyPosition.RUNNING_BACK, 1),
  player("wr-1", FantasyPosition.WIDE_RECEIVER, 1),
  player("te-1", FantasyPosition.TIGHT_END, 1),
]

const rankings: Rankings = {
  players,
  rankingsSummaries: [],
  cachedAt: "2026-07-30T20:00:00.000Z",
  editedAt: "2026-07-30T20:00:00.000Z",
  copiedRanker: ThirdPartyRanker.HARRIS,
  settings,
}

const context = { playersById: new Map(players.map(item => [item.id, item])) }

const packageFor = (): PortableDataPackageV2 => createPortableDataPackage({
  rankings,
  settings,
  boardSettings: {
    ranker: ThirdPartyRanker.CUSTOM,
    adpRanker: ThirdPartyADPRanker.ESPN,
  },
  myPickNum: 6,
  playerTargets: [{ playerId: "wr-1", targetAsEarlyAsRound: 4 }],
  plan: {
    schema_version: 1,
    draft_session_id: "current-session",
    revision: 3,
    updated_at: "2026-07-30T20:00:00.000Z",
    entries: [{
      id: "entry-1",
      proposal_id: "proposal-1",
      text: "Prioritize the remaining wide receiver tier.",
      source_event_count: 0,
      created_at: "2026-07-30T20:00:00.000Z",
    }],
  },
  now: "2026-07-30T20:00:00.000Z",
})

const parse = (value: unknown) => parsePortableDataPackage(JSON.stringify(value), context)
const parseV2 = (value: unknown): PortableDataPackageV2 => {
  const parsed = parse(value)
  if (parsed.version !== 2) throw new Error("expected portable v2")
  return parsed
}

describe("portable local-data package", () => {
  it("round-trips a lean ranking/profile/plan package and rebuilds trusted players", () => {
    const value = parseV2(packageFor())
    expect(value.data.ranking_profile?.positions.QB).toEqual([
      { player_id: "qb-1", user_tier: 1 },
    ])
    expect(value.data.draft_plan?.entries).toEqual([
      "Prioritize the remaining wide receiver tier.",
    ])
    expect(JSON.stringify(value)).not.toContain("current-session")

    const applied = applyRankingProfileV2Snapshot(rankings, value.data.ranking_profile)
    expect(applied.players.find(item => item.id === "wr-1")?.ranks.Custom?.pprPositionRank).toBe(1)
    expect(applied.copiedRanker).toBe(ThirdPartyRanker.HARRIS)
  })

  it("round-trips canonical order, tiers, tombstones, and provenance", () => {
    const base = packageFor().data.ranking_profile!
    base.positions.RB = [
      {player_id: "rb-1", user_tier: 1},
    ]
    base.unresolved_players = [{
      player_id: "retired-rb",
      last_position: "RB",
      last_user_rank: 2,
      last_user_tier: 2,
      reason: "missing_from_target",
    }]
    base.provenance = {
      binding_state: "bound",
      base_source_id: "espn",
      base_provider_id: "espn",
      source_observation_fingerprint: "a".repeat(64),
      source_season: 2026,
      source_scoring_type: "ppr",
      player_universe_fingerprint: "b".repeat(64),
    }
    const exported = createPortableDataPackage({
      rankings,
      settings,
      boardSettings: {
        ranker: ThirdPartyRanker.CUSTOM,
        adpRanker: ThirdPartyADPRanker.ESPN,
      },
      myPickNum: 6,
      playerTargets: [],
      rankingProfile: base,
      plan: null,
      now: "2026-07-30T20:00:00.000Z",
    })
    const parsed = parseV2(exported)
    expect(parsed.data.ranking_profile).toEqual(base)
  })

  it.each([
    ["malformed JSON", "{"],
    ["wrong schema", JSON.stringify({ ...packageFor(), schema: "other" })],
    ["newer version", JSON.stringify({ ...packageFor(), version: 3 })],
    ["prototype-shaped key", JSON.stringify(packageFor()).replace("{", "{\"__proto__\":{\"polluted\":true},")],
  ])("fails closed for %s", (_label, serialized) => {
    expect(() => parsePortableDataPackage(serialized, context)).toThrow(PortableDataValidationError)
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })

  it("serializes only a package that passes its own import contract", () => {
    const serialized = serializePortableDataPackage(packageFor(), context)
    expect(parsePortableDataPackage(serialized, context).data.preferences.my_pick_num).toBe(6)
    const tooManyTargets = packageFor()
    tooManyTargets.data.preferences.player_targets = Array.from(
      { length: 101 },
      () => ({ player_id: "wr-1", target_as_early_as_round: 1 }),
    )
    expect(() => serializePortableDataPackage(tooManyTargets, context))
      .toThrow("bounded array")
  })

  it("continues accepting an explicitly versioned portable-v1 package", () => {
    const current = packageFor()
    const legacy = {
      schema: "drafty.local-data",
      version: 1,
      exported_at: current.exported_at,
      data: {
        preferences: current.data.preferences,
        custom_rankings: {
          source_ranker: ThirdPartyRanker.HARRIS,
          scoring: "ppr",
          positions: {
            QB: [{player_id: "qb-1", rank: 1, user_tier: 1}],
            RB: [{player_id: "rb-1", rank: 1, user_tier: 1}],
            WR: [{player_id: "wr-1", rank: 1, user_tier: 1}],
            TE: [{player_id: "te-1", rank: 1, user_tier: 1}],
          },
        },
        draft_plan: current.data.draft_plan,
      },
    }
    const parsed = parse(legacy)
    expect(parsed.version).toBe(1)
    if (parsed.version !== 1) throw new Error("expected portable v1")
    expect(parsed.data.custom_rankings?.positions.RB[0].player_id).toBe("rb-1")
  })

  it("rejects malformed claimed-v2 input without legacy fallback", () => {
    const current = packageFor()
    const malformed = {
      ...current,
      data: {
        ...current.data,
        ranking_profile: {
          source_ranker: ThirdPartyRanker.HARRIS,
          scoring: "ppr",
          positions: current.data.ranking_profile?.positions,
        },
      },
    }
    expect(() => parse(malformed)).toThrow(PortableDataValidationError)
  })

  it("rejects oversized UTF-8 input before parsing", () => {
    expect(() => parsePortableDataPackage("é".repeat(PORTABLE_DATA_MAX_BYTES), context))
      .toThrow("larger than 512 KB")
  })

  it("rejects unknown players, scoring mismatch, and unsupported league sizes", () => {
    const unknown = packageFor()
    unknown.data.ranking_profile!.positions.QB[0].player_id = "not-present"
    expect(() => parse(unknown)).toThrow("unknown player")

    const mismatch = packageFor()
    mismatch.data.ranking_profile!.scoring_type = "standard"
    expect(() => parse(mismatch)).toThrow("must match")

    const unsupportedSize = packageFor()
    unsupportedSize.data.preferences.settings.numTeams = 11
    expect(() => parse(unsupportedSize)).toThrow("one of 10, 12, or 14")
  })

  it("rolls back every touched storage key if a later write fails", () => {
    const values = new Map<string, string>([["rankings", "before-ranks"], ["targets", "before-targets"]])
    const storage = {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => {
        if (key === "targets" && value === "next-targets") throw new Error("quota")
        values.set(key, value)
      },
      removeItem: (key: string) => values.delete(key),
    }
    expect(() => writeStorageTransaction(storage, [
      { key: "rankings", value: "next-ranks" },
      { key: "targets", value: "next-targets" },
    ])).toThrow("quota")
    expect(values.get("rankings")).toBe("before-ranks")
    expect(values.get("targets")).toBe("before-targets")
  })
})

describe("portable data controls", () => {
  const choose = async (container: HTMLElement, content: string) => {
    const file = new File([content], "drafty-local-data-v1.json", { type: "application/json" })
    Object.defineProperty(file, "text", { value: async () => content })
    const input = container.querySelector("input[type=file]") as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(document.querySelector("#portable-import-title")).toBeTruthy())
  }

  it("requires confirmation, lets cancel preserve state, and announces success", async () => {
    const onApply = jest.fn()
    const rendered = render(
      <PortableDataControls
        createPackage={packageFor}
        onApply={onApply}
        validationContext={context}
      />,
    )
    await choose(rendered.container, JSON.stringify(packageFor()))
    expect(rendered.getByText("Replace local data?")).toBeTruthy()
    fireEvent.click(rendered.getByRole("button", { name: "Cancel" }))
    expect(onApply).not.toHaveBeenCalled()

    await choose(rendered.container, JSON.stringify(packageFor()))
    fireEvent.click(rendered.getByRole("button", { name: "Replace local data" }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(rendered.getByRole("status").textContent).toContain("Local data imported")
  })

  it("announces an actionable accessible error without applying malformed data", async () => {
    const onApply = jest.fn()
    const rendered = render(
      <PortableDataControls
        createPackage={packageFor}
        onApply={onApply}
        validationContext={context}
      />,
    )
    const file = new File(["{"], "broken.json", { type: "application/json" })
    Object.defineProperty(file, "text", { value: async () => "{" })
    fireEvent.change(rendered.container.querySelector("input[type=file]")!, {
      target: { files: [file] },
    })
    await waitFor(() => expect(rendered.getByRole("alert").textContent).toContain("not valid JSON"))
    expect(onApply).not.toHaveBeenCalled()
  })
})
