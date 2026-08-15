import { useCallback, useEffect, useMemo, useState } from "react"
import { cloneDeep } from "lodash"

import {
  createRankingProfileV2,
  createRankingProfileV2Revision,
  listRankingProfilesV2,
  RankingProfileApiError,
  RankingProfileV2Record,
  RankingProfileSnapshot,
  redoRankingProfileV2,
  undoRankingProfileV2,
} from "../api/rankingProfiles"
import type { RankingProfile as LegacyRankingProfile } from "../api/rankingProfiles"
import {
  applyRankingProfileV2Snapshot,
} from "../portableData"
import {
  RankingProfileV2,
  validateRankingProfileV2,
} from "../rankingProfileV2"
import { RANKING_PROFILE_V2_STORAGE_KEY, serializeRankingProfileV2 } from "../rankingProfileStorage"
import { PlayerRanks } from "../draft"
import {
  BoardSettings,
  FantasyPosition,
  FantasySettings,
  Player,
  PlayerRanking,
  Rankings,
  ThirdPartyRanker,
  Tier,
} from "../../types"


const POSITIONS = [
  FantasyPosition.QUARTERBACK,
  FantasyPosition.RUNNING_BACK,
  FantasyPosition.WIDE_RECEIVER,
  FantasyPosition.TIGHT_END,
] as const

interface UseRankingProfilesOptions {
  playerRanks: PlayerRanks
  rankings: Rankings
  settings: FantasySettings
  boardSettings: BoardSettings
  onLoadPlayers: (rankings: Rankings) => void
  onSetRanker: (ranker: ThirdPartyRanker) => void
  saveLocalRankings: () => boolean
  localProfile?: RankingProfileV2 | null
}

export type RankingProfile = RankingProfileV2Record

const scoringProfile = (settings: FantasySettings) => (
  settings.ppr ? "ppr" as const : "standard" as const
)

export const createRankingProfileSnapshot = (
  playerRanks: PlayerRanks,
  settings: FantasySettings,
): RankingProfileSnapshot => ({
  schema_version: 1,
  positions: Object.fromEntries(POSITIONS.map(position => {
    let normalizedTier = 1
    let priorSourceTier: number | undefined
    return [
      position,
      playerRanks[position].map((player, index) => {
        const customRank = player.ranks[ThirdPartyRanker.CUSTOM]
        const sourceTier = (
          settings.ppr
            ? customRank?.pprPositionTier
            : customRank?.standardPositionTier
        )?.tierNumber
        if (
          sourceTier !== undefined &&
          priorSourceTier !== undefined &&
          sourceTier !== priorSourceTier
        ) {
          normalizedTier += 1
        }
        priorSourceTier = sourceTier
        return {
          player_id: player.id,
          rank: index + 1,
          user_tier: normalizedTier,
        }
      }),
    ]
  })) as RankingProfileSnapshot["positions"],
})

export const createRankingProfileV2Snapshot = (
  playerRanks: PlayerRanks,
  settings: FantasySettings,
  baseProfile: RankingProfileV2 | null = null,
): RankingProfileV2 => {
  const legacy = createRankingProfileSnapshot(playerRanks, settings)
  const scoring = scoringProfile(settings)
  const base = baseProfile && baseProfile.scoring_type === scoring
    ? validateRankingProfileV2(baseProfile)
    : null
  return validateRankingProfileV2({
    schema_version: 2,
    rebase_version: "profile_rebase_v1",
    scoring_type: scoring,
    positions: Object.fromEntries(POSITIONS.map(position => [
      position,
      legacy.positions[position].map(({player_id, user_tier}) => ({
        player_id,
        user_tier,
      })),
    ])),
    unresolved_players: base?.unresolved_players || [],
    provenance: base?.provenance || {
      binding_state: "legacy_unbound",
      base_source_id: null,
      base_provider_id: null,
      source_observation_fingerprint: null,
      source_season: null,
      source_scoring_type: null,
      player_universe_fingerprint: null,
    },
  })
}

const valueFor = (
  player: Player,
  sourceRanker: ThirdPartyRanker,
  settings: FantasySettings,
) => {
  const ranking = (
    player.ranks[ThirdPartyRanker.CUSTOM] ||
    player.ranks[sourceRanker]
  )
  return (
    settings.ppr
      ? ranking?.metricValuePpr
      : ranking?.metricValueStd
  ) || 0
}

const tiersFor = (
  entries: RankingProfileSnapshot["positions"]["QB"],
  players: Map<string, Player>,
  sourceRanker: ThirdPartyRanker,
  settings: FantasySettings,
) => {
  const tiers = new Map<number, Tier>()
  entries.forEach((entry, index) => {
    const existing = tiers.get(entry.user_tier)
    const player = players.get(entry.player_id)
    const value = player
      ? valueFor(player, sourceRanker, settings)
      : 0
    tiers.set(entry.user_tier, existing ? {
      ...existing,
      lowerLimitPlayerIdx: index,
      lowerLimitValue: value,
    } : {
      tierNumber: entry.user_tier,
      upperLimitPlayerIdx: index,
      upperLimitValue: value,
      lowerLimitPlayerIdx: index,
      lowerLimitValue: value,
    })
  })
  return tiers
}

export const applyRankingProfileSnapshot = (
  profile: RankingProfile | LegacyRankingProfile,
  rankings: Rankings,
  settings: FantasySettings,
): Rankings => {
  if (profile.snapshot.schema_version === 2) {
    const sourceRanker = String(
      profile.source_ranker || rankings.copiedRanker || ThirdPartyRanker.HARRIS,
    ) as ThirdPartyRanker
    return applyRankingProfileV2Snapshot(
      rankings,
      profile.snapshot as unknown as RankingProfileV2,
      sourceRanker,
    )
  }
  const players = cloneDeep(rankings.players)
  const playersById = new Map(players.map(player => [player.id, player]))
  const sourceRanker = (
    profile.source_ranker ||
    rankings.copiedRanker ||
    ThirdPartyRanker.HARRIS
  ) as ThirdPartyRanker

  const legacySnapshot = profile.snapshot as LegacyRankingProfile["snapshot"]
  POSITIONS.forEach(position => {
    const entries = legacySnapshot.positions[position]
    const tiers = tiersFor(
      entries,
      playersById,
      sourceRanker,
      settings,
    )
    entries.forEach(entry => {
      const player = playersById.get(entry.player_id)
      if (!player) return
      const source = (
        player.ranks[ThirdPartyRanker.CUSTOM] ||
        player.ranks[sourceRanker] ||
        Object.values(player.ranks)[0]
      )
      if (!source) return
      const tier = tiers.get(entry.user_tier)
      const custom: PlayerRanking = {
        ...source,
        playerId: player.id,
        ranker: ThirdPartyRanker.CUSTOM,
        position,
        standardPositionRank: settings.ppr
          ? source.standardPositionRank
          : entry.rank,
        pprPositionRank: settings.ppr
          ? entry.rank
          : source.pprPositionRank,
        standardPositionTier: settings.ppr
          ? source.standardPositionTier
          : tier,
        pprPositionTier: settings.ppr
          ? tier
          : source.pprPositionTier,
      }
      player.ranks[ThirdPartyRanker.CUSTOM] = custom
    })
  })

  return {
    ...rankings,
    players,
    copiedRanker: sourceRanker,
    editedAt: profile.updated_at,
  }
}

export const useRankingProfiles = ({
  playerRanks,
  rankings,
  settings,
  boardSettings,
  onLoadPlayers,
  onSetRanker,
  saveLocalRankings,
  localProfile = null,
}: UseRankingProfilesOptions) => {
  const [profiles, setProfiles] = useState<RankingProfile[]>([])
  const [activeProfile, setActiveProfile] =
    useState<RankingProfile | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const apiConfigured = Boolean(process.env.NEXT_PUBLIC_API_HOST)

  const persistLocalProfile = useCallback((snapshot: RankingProfileV2) => {
    if (typeof localStorage === "undefined") return false
    try {
      localStorage.setItem(RANKING_PROFILE_V2_STORAGE_KEY, serializeRankingProfileV2(snapshot))
      return true
    } catch {
      return false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!apiConfigured) return
    setIsLoading(true)
    try {
      const result = await listRankingProfilesV2()
      setProfiles(result.profiles)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load profiles")
    } finally {
      setIsLoading(false)
    }
  }, [apiConfigured])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const applyProfile = useCallback((profile: RankingProfile) => {
    const nextRankings = applyRankingProfileSnapshot(
      profile,
      rankings,
      settings,
    )
    onLoadPlayers(nextRankings)
    onSetRanker(ThirdPartyRanker.CUSTOM)
    setActiveProfile(profile)
  }, [onLoadPlayers, onSetRanker, rankings, settings])

  const updateProfileState = useCallback((profile: RankingProfile) => {
    setProfiles(current => [
      profile,
      ...current.filter(candidate => candidate.id !== profile.id),
    ])
    applyProfile(profile)
    setError(null)
  }, [applyProfile])

  const save = useCallback(async (name: string) => {
    if (!apiConfigured) {
      const snapshot = createRankingProfileV2Snapshot(
        playerRanks,
        settings,
        activeProfile?.snapshot.schema_version === 2
          ? activeProfile.snapshot as unknown as RankingProfileV2
          : localProfile,
      )
      saveLocalRankings()
      persistLocalProfile(snapshot)
      throw new Error("Saved in this browser; the local API is unavailable")
    }
    setIsSaving(true)
    try {
      const snapshot = createRankingProfileV2Snapshot(
        playerRanks,
        settings,
        activeProfile?.snapshot.schema_version === 2
          ? activeProfile.snapshot as unknown as RankingProfileV2
          : localProfile,
      )
      const profile = activeProfile
        ? await createRankingProfileV2Revision(activeProfile.id, {
          expected_revision: activeProfile.current_revision,
          name,
          reason: "Ranking order or user tiers updated",
          snapshot,
        })
        : await createRankingProfileV2({
          name,
          source_ranker: String(
            rankings.copiedRanker || boardSettings.ranker,
          ),
          snapshot,
        })
      persistLocalProfile(snapshot)
      updateProfileState(profile)
      return profile
    } catch (caught) {
      const snapshot = createRankingProfileV2Snapshot(
        playerRanks,
        settings,
        activeProfile?.snapshot.schema_version === 2
          ? activeProfile.snapshot as unknown as RankingProfileV2
          : localProfile,
      )
      const apiUnavailable = caught instanceof RankingProfileApiError
        && (caught.status === undefined || caught.status >= 500)
      const localSaved = apiUnavailable
        && saveLocalRankings()
        && persistLocalProfile(snapshot)
      if (localSaved) {
        const localMessage = "Saved in this browser; the local API is unavailable"
        setError(localMessage)
        throw new Error(localMessage)
      }
      const message = caught instanceof Error ? caught.message : "Unable to save profile"
      setError(message)
      throw caught
    } finally {
      setIsSaving(false)
    }
  }, [
    activeProfile,
    apiConfigured,
    boardSettings.ranker,
    playerRanks,
    rankings.copiedRanker,
    saveLocalRankings,
    settings,
    localProfile,
    persistLocalProfile,
    updateProfileState,
  ])

  const select = useCallback((profileId: string) => {
    const profile = profiles.find(candidate => candidate.id === profileId)
    if (profile) applyProfile(profile)
  }, [applyProfile, profiles])

  const startNew = useCallback(() => {
    setActiveProfile(null)
    setError(null)
  }, [])

  const move = useCallback(async (direction: "undo" | "redo") => {
    if (!activeProfile) return
    setIsSaving(true)
    try {
      const profile = direction === "undo"
        ? await undoRankingProfileV2(
          activeProfile.id,
          activeProfile.current_revision,
        )
        : await redoRankingProfileV2(
          activeProfile.id,
          activeProfile.current_revision,
        )
      updateProfileState(profile)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : `Unable to ${direction}`
      setError(message)
      throw caught
    } finally {
      setIsSaving(false)
    }
  }, [activeProfile, updateProfileState])

  return useMemo(() => ({
    profiles,
    activeProfile,
    isLoading,
    isSaving,
    error,
    apiConfigured,
    refresh,
    save,
    select,
    startNew,
    undo: () => move("undo"),
    redo: () => move("redo"),
  }), [
    activeProfile,
    apiConfigured,
    error,
    isLoading,
    isSaving,
    move,
    profiles,
    refresh,
    save,
    select,
    startNew,
  ])
}

export type RankingProfileControls = ReturnType<typeof useRankingProfiles>
