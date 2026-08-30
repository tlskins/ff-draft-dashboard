import type {UserMockDraftPutRequest} from "../api/userMockDrafts"
import type {RecordedCompletedDraftReplay} from "../draft-advisor/completedDraftReplay"
import type {PlayerTarget} from "../../types"


export interface LocalMockDraftArchive extends UserMockDraftPutRequest {
  mock_id: string
  season: number
}

export const COMPLETED_MOCK_ARCHIVE_KEY = "drafty.completed-mocks.v1"
export const MAX_LOCAL_COMPLETED_MOCKS = 10
const MAX_ARCHIVE_TARGETS = 500
const MOCK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/

const boundedText = (value: unknown, maximum: number): value is string => (
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum
)

const validMockId = (value: unknown): value is string => (
  boundedText(value, 128) && MOCK_ID_PATTERN.test(value)
)

const validFantasySeason = (value: unknown): value is number => (
  Number.isInteger(value) && Number(value) >= 2000 && Number(value) <= 2100
)

const validArchiveTarget = (value: unknown): boolean => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const target = value as {player_id?: unknown; target_as_early_as_round?: unknown}
  return validMockId(target.player_id)
    && Number.isInteger(target.target_as_early_as_round)
    && Number(target.target_as_early_as_round) >= 1
    && Number(target.target_as_early_as_round) <= 100
}

export const isLocalCompletedMockArchive = (
  value: unknown,
  expectedSeason?: number,
): value is LocalMockDraftArchive => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const archive = value as LocalMockDraftArchive
  if (
    archive.schema_version !== 1
    || !validFantasySeason(archive.season)
    || (expectedSeason !== undefined && archive.season !== expectedSeason)
    || !validMockId(archive.mock_id)
    || typeof archive.completed_at !== "string"
    || Number.isNaN(Date.parse(archive.completed_at))
    || !boundedText(archive.ranking_source, 80)
    || !boundedText(archive.adp_source, 80)
    || !Array.isArray(archive.targets)
    || archive.targets.length > MAX_ARCHIVE_TARGETS
    || archive.targets.some(target => !validArchiveTarget(target))
    || !archive.replay
    || typeof archive.replay !== "object"
    || Array.isArray(archive.replay)
  ) return false
  const replay = archive.replay as Record<string, unknown>
  if (
    replay.fixtureVersion !== 1
    || replay.id !== archive.mock_id
    || "forecastEvidence" in replay
    || "empiricalBaseShadowEvidence" in replay
    || "runOnlyShadowEvidence" in replay
  ) return false
  const targetIds = archive.targets.map(target => target.player_id)
  return new Set(targetIds).size === targetIds.length
}

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
  if (!validFantasySeason(season)) {
    throw new Error("Completed mock requires an explicit fantasy season")
  }
  if (!validMockId(fixture.id)) throw new Error("Completed mock requires a valid stable mock ID")
  if (!boundedText(rankingSource, 80) || !boundedText(adpSource, 80)) {
    throw new Error("Completed mock requires bounded ranking and ADP source labels")
  }
  if (targets.length > MAX_ARCHIVE_TARGETS) throw new Error("Completed mock has too many targets")
  const targetIds = targets.map(target => target.playerId)
  if (new Set(targetIds).size !== targetIds.length) {
    throw new Error("Completed mock targets must be unique")
  }
  if (targets.some(target => !validArchiveTarget({
    player_id: target.playerId,
    target_as_early_as_round: target.targetAsEarlyAsRound,
  }))) {
    throw new Error("Completed mock has an invalid target")
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
    ranking_source: rankingSource.trim(),
    adp_source: adpSource.trim(),
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
    return value.filter(item => isLocalCompletedMockArchive(item, season))
      .slice(0, MAX_LOCAL_COMPLETED_MOCKS)
  } catch {
    return []
  }
}

export const storeLocalCompletedMock = (
  storage: Pick<Storage, "getItem" | "setItem">,
  archive: LocalMockDraftArchive,
): LocalMockDraftArchive[] => {
  if (!isLocalCompletedMockArchive(archive, archive.season)) {
    throw new Error("Completed mock does not satisfy the local archive contract")
  }
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
