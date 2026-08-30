import type {UserMockDraftPutRequest} from "../api/userMockDrafts"
import type {RecordedCompletedDraftReplay} from "../draft-advisor/completedDraftReplay"
import type {PlayerTarget} from "../../types"


export interface LocalMockDraftArchive extends UserMockDraftPutRequest {
  mock_id: string
  season: number
}

export const COMPLETED_MOCK_ARCHIVE_KEY = "drafty.completed-mocks.v1"
export const MAX_LOCAL_COMPLETED_MOCKS = 10

const rosterOnlyReplay = (
  fixture: RecordedCompletedDraftReplay,
): RecordedCompletedDraftReplay => {
  const {
    forecastEvidence: _forecastEvidence,
    empiricalBaseShadowEvidence: _empiricalEvidence,
    runOnlyShadowEvidence: _runEvidence,
    ...replay
  } = fixture
  return replay
}

export const createCompletedMockArchive = ({
  fixture,
  season,
  rankingSource,
  adpSource,
  targets,
  completedAt,
}: {
  fixture: RecordedCompletedDraftReplay
  season: number
  rankingSource: string
  adpSource: string
  targets: PlayerTarget[]
  completedAt?: string
}): LocalMockDraftArchive => {
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    throw new Error("Completed mock requires an explicit fantasy season")
  }
  const timestamp = completedAt || new Date(
    fixture.source?.capturedAt || Date.now(),
  ).toISOString()
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error("Completed mock requires a valid completion timestamp")
  }
  return {
    schema_version: 1,
    mock_id: fixture.id,
    season,
    completed_at: timestamp,
    ranking_source: rankingSource,
    adp_source: adpSource,
    targets: targets
      .map(target => ({
        player_id: target.playerId,
        target_as_early_as_round: target.targetAsEarlyAsRound,
      }))
      .sort((left, right) => left.player_id.localeCompare(right.player_id)),
    replay: rosterOnlyReplay(fixture) as unknown as {[key: string]: unknown},
  }
}

const localKey = (season: number): string => `${COMPLETED_MOCK_ARCHIVE_KEY}:season:${season}`

export const readLocalCompletedMocks = (
  storage: Pick<Storage, "getItem">,
  season: number,
): LocalMockDraftArchive[] => {
  try {
    const raw = storage.getItem(localKey(season))
    if (!raw) return []
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is LocalMockDraftArchive => (
      item !== null
      && typeof item === "object"
      && (item as LocalMockDraftArchive).schema_version === 1
      && (item as LocalMockDraftArchive).season === season
      && typeof (item as LocalMockDraftArchive).mock_id === "string"
    )).slice(0, MAX_LOCAL_COMPLETED_MOCKS)
  } catch {
    return []
  }
}

export const storeLocalCompletedMock = (
  storage: Pick<Storage, "getItem" | "setItem">,
  archive: LocalMockDraftArchive,
): LocalMockDraftArchive[] => {
  const current = readLocalCompletedMocks(storage, archive.season)
  const existing = current.find(item => item.mock_id === archive.mock_id)
  if (existing && JSON.stringify(existing) !== JSON.stringify(archive)) {
    throw new Error("A different immutable mock already uses this local mock ID")
  }
  const next = [archive, ...current.filter(item => item.mock_id !== archive.mock_id)]
    .sort((left, right) => right.completed_at.localeCompare(left.completed_at))
    .slice(0, MAX_LOCAL_COMPLETED_MOCKS)
  storage.setItem(localKey(archive.season), JSON.stringify(next))
  return next
}

export const completedMockPutRequest = (
  archive: LocalMockDraftArchive,
): UserMockDraftPutRequest => {
  const {mock_id: _mockId, season: _season, ...request} = archive
  return request
}
