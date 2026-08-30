import {act, renderHook, waitFor} from "@testing-library/react"
import type {User} from "firebase/auth"

import {
  getUserDraftProfile,
  putUserDraftProfile,
  UserDraftProfileApiError,
} from "../behavior/api/userDraftProfile"
import {createCloudProfilePayload, type UserDraftProfileRecord} from "../behavior/cloudProfileSync"
import {useCloudProfileSync} from "../behavior/hooks/useCloudProfileSync"
import {validateRankingProfileV2} from "../behavior/rankingProfileV2"


jest.mock("../behavior/api/userDraftProfile", () => {
  const actual = jest.requireActual("../behavior/api/userDraftProfile")
  return {
    ...actual,
    getUserDraftProfile: jest.fn(),
    putUserDraftProfile: jest.fn(),
  }
})

const getProfileMock = getUserDraftProfile as jest.MockedFunction<typeof getUserDraftProfile>
const putProfileMock = putUserDraftProfile as jest.MockedFunction<typeof putUserDraftProfile>
const user = {
  uid: "alice",
  email: "alice@example.test",
  getIdToken: jest.fn().mockResolvedValue("alice-token"),
} as unknown as User

const rankingProfile = validateRankingProfileV2({
  schema_version: 2,
  rebase_version: "profile_rebase_v1",
  scoring_type: "ppr",
  positions: {QB: [], RB: [{player_id: "rb-one", user_tier: 1}], WR: [], TE: []},
  unresolved_players: [],
  provenance: {
    binding_state: "legacy_unbound",
    base_source_id: null,
    base_provider_id: null,
    source_observation_fingerprint: null,
    source_season: null,
    source_scoring_type: null,
    player_universe_fingerprint: null,
  },
})

const remotePayload = createCloudProfilePayload({
  rankingProfile,
  targets: [{playerId: "rb-one", targetAsEarlyAsRound: 3}],
  sourceRanker: "Harris",
})
const remoteRecord: UserDraftProfileRecord = {
  schema_version: 1,
  revision: 1,
  profile: remotePayload,
  content_fingerprint: "a".repeat(64),
  last_mutation_id: "mutation-one",
  last_writer_device_id: "desktop",
  created_at: "2026-08-29T12:00:00Z",
  updated_at: "2026-08-29T12:00:00Z",
}

describe("useCloudProfileSync", () => {
  beforeEach(() => {
    localStorage.clear()
    jest.clearAllMocks()
  })

  it("uploads the existing browser profile when the cloud record is missing", async () => {
    getProfileMock.mockRejectedValueOnce(new UserDraftProfileApiError(
      "No cloud profile", 404, "profile_not_found",
    ))
    putProfileMock.mockResolvedValueOnce(remoteRecord)
    const {result} = renderHook(() => useCloudProfileSync({
      enabled: true,
      user,
      hydrated: true,
      rankingProfile,
      targets: [{playerId: "rb-one", targetAsEarlyAsRound: 3}],
      sourceRanker: "Harris",
      onApplyRemote: jest.fn(),
    }))

    await waitFor(() => expect(result.current.state).toBe("synced"), {timeout: 2500})
    expect(putProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        expected_revision: 0,
        profile: remotePayload,
      }),
      {token: "alice-token"},
    )
  })

  it("adopts a cloud profile on a new empty device", async () => {
    getProfileMock.mockResolvedValue(remoteRecord)
    const applyRemote = jest.fn()
    const {result} = renderHook(() => useCloudProfileSync({
      enabled: true,
      user,
      hydrated: true,
      rankingProfile: null,
      targets: [],
      sourceRanker: "Harris",
      onApplyRemote: applyRemote,
    }))

    await waitFor(() => expect(result.current.state).toBe("synced"), {timeout: 2500})
    expect(applyRemote).toHaveBeenCalledWith(remotePayload)
    expect(putProfileMock).not.toHaveBeenCalled()
  })

  it("does not touch cloud state before local hydration is safe", async () => {
    const {result} = renderHook(() => useCloudProfileSync({
      enabled: true,
      user,
      hydrated: false,
      rankingProfile,
      targets: [],
      sourceRanker: "Harris",
      onApplyRemote: jest.fn(),
    }))
    await act(async () => undefined)
    expect(result.current.state).toBe("waiting")
    expect(getProfileMock).not.toHaveBeenCalled()
  })

  it("pauses an established sync when a draft starts", async () => {
    getProfileMock.mockResolvedValue(remoteRecord)
    const {result, rerender} = renderHook(({
      hydrated,
      targetRound,
    }: {
      hydrated: boolean
      targetRound: number
    }) => useCloudProfileSync({
      enabled: true,
      user,
      hydrated,
      rankingProfile,
      targets: [{playerId: "rb-one", targetAsEarlyAsRound: targetRound}],
      sourceRanker: "Harris",
      onApplyRemote: jest.fn(),
    }), {initialProps: {hydrated: true, targetRound: 3}})

    await waitFor(() => expect(result.current.state).toBe("synced"), {timeout: 2500})
    expect(getProfileMock).toHaveBeenCalledTimes(1)

    rerender({hydrated: false, targetRound: 4})
    await waitFor(() => expect(result.current.state).toBe("waiting"))
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 750))
    })

    expect(getProfileMock).toHaveBeenCalledTimes(1)
    expect(putProfileMock).not.toHaveBeenCalled()
  })

  it("requires an explicit choice for two first-use non-empty copies", async () => {
    getProfileMock.mockResolvedValue(remoteRecord)
    const {result} = renderHook(() => useCloudProfileSync({
      enabled: true,
      user,
      hydrated: true,
      rankingProfile,
      targets: [{playerId: "rb-one", targetAsEarlyAsRound: 2}],
      sourceRanker: "Harris",
      onApplyRemote: jest.fn(),
    }))
    await waitFor(() => expect(result.current.state).toBe("conflict"), {timeout: 2500})
    expect(result.current.conflict).toEqual(remoteRecord)
    expect(putProfileMock).not.toHaveBeenCalled()
  })

  it("keeps an unresolved conflict stable across callback and local-profile rerenders", async () => {
    getProfileMock.mockResolvedValue(remoteRecord)
    const firstApplyRemote = jest.fn()
    const {result, rerender} = renderHook(({
      applyRemote,
      targetRound,
    }: {
      applyRemote: jest.Mock
      targetRound: number
    }) => useCloudProfileSync({
      enabled: true,
      user,
      hydrated: true,
      rankingProfile,
      targets: [{playerId: "rb-one", targetAsEarlyAsRound: targetRound}],
      sourceRanker: "Harris",
      onApplyRemote: applyRemote,
    }), {
      initialProps: {applyRemote: firstApplyRemote, targetRound: 2},
    })

    await waitFor(() => expect(result.current.state).toBe("conflict"), {timeout: 2500})
    expect(getProfileMock).toHaveBeenCalledTimes(1)

    const replacementApplyRemote = jest.fn()
    rerender({applyRemote: replacementApplyRemote, targetRound: 4})
    await act(async () => undefined)

    expect(result.current.state).toBe("conflict")
    expect(result.current.conflict).toEqual(remoteRecord)
    expect(getProfileMock).toHaveBeenCalledTimes(1)
    expect(putProfileMock).not.toHaveBeenCalled()
    expect(firstApplyRemote).not.toHaveBeenCalled()
    expect(replacementApplyRemote).not.toHaveBeenCalled()
  })

  it("does not resynchronize when only the apply callback identity changes", async () => {
    getProfileMock.mockResolvedValue(remoteRecord)
    const {result, rerender} = renderHook(({applyRemote}: {applyRemote: jest.Mock}) => (
      useCloudProfileSync({
        enabled: true,
        user,
        hydrated: true,
        rankingProfile,
        targets: [{playerId: "rb-one", targetAsEarlyAsRound: 3}],
        sourceRanker: "Harris",
        onApplyRemote: applyRemote,
      })
    ), {initialProps: {applyRemote: jest.fn()}})

    await waitFor(() => expect(result.current.state).toBe("synced"), {timeout: 2500})
    expect(getProfileMock).toHaveBeenCalledTimes(1)

    rerender({applyRemote: jest.fn()})
    await act(async () => undefined)

    expect(result.current.state).toBe("synced")
    expect(getProfileMock).toHaveBeenCalledTimes(1)
    expect(putProfileMock).not.toHaveBeenCalled()
  })

  it("clears one account's conflict before another account can sync", async () => {
    getProfileMock.mockResolvedValue(remoteRecord)
    const {result, rerender} = renderHook(({activeUser}: {activeUser: User | null}) => (
      useCloudProfileSync({
        enabled: true,
        user: activeUser,
        hydrated: true,
        rankingProfile,
        targets: [{playerId: "rb-one", targetAsEarlyAsRound: 2}],
        sourceRanker: "Harris",
        onApplyRemote: jest.fn(),
      })
    ), {initialProps: {activeUser: user as User | null}})

    await waitFor(() => expect(result.current.state).toBe("conflict"), {timeout: 2500})
    rerender({activeUser: null})
    await waitFor(() => expect(result.current.state).toBe("waiting"))
    expect(result.current.conflict).toBeNull()
    expect(result.current.record).toBeNull()
  })
})
