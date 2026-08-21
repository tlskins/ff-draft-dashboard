import { act, renderHook, waitFor } from "@testing-library/react"
import { useDraftListener } from "../behavior/hooks/useDraftListener"
import { FantasyPosition, NFLTeam } from "../types"

describe("useDraftListener", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("tracks selector health even before rankings have loaded", () => {
    const { result } = renderHook(() =>
      useDraftListener({
        playerLib: {},
        playersByPosByTeam: {},
        settings: { numTeams: 10 },
        onDraftPlayer: jest.fn(),
        setCurrPick: jest.fn(),
        setDraftStarted: jest.fn(),
      }),
    )

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        source: window,
        data: {
          type: "FF_DRAFT_DASHBOARD",
          payload: {
            version: 1,
            kind: "source-health",
            sentAt: 100,
            health: {
              selectorVersion: 1,
              platform: "ESPN",
              status: "degraded",
              mode: "live-history",
              checkedAt: 100,
              pickCount: 2,
              checks: [],
              issues: ["history-rows-unhealthy"],
            },
          },
        },
      }))
    })

    expect(result.current.listenerActive).toBe(true)
    expect(result.current.draftSourceHealth).toMatchObject({
      status: "degraded",
      issues: ["history-rows-unhealthy"],
    })
  })

  it("keeps bridge and selector-health freshness distinct", () => {
    jest.useFakeTimers()
    try {
      const { result } = renderHook(() => useDraftListener({
        playerLib: {},
        playersByPosByTeam: {},
        settings: { numTeams: 10 },
        onDraftPlayer: jest.fn(),
        setCurrPick: jest.fn(),
        setDraftStarted: jest.fn(),
      }))

      act(() => {
        window.dispatchEvent(new MessageEvent("message", {
          source: window,
          data: { type: "FROM_EXT", draftData: true },
        }))
      })
      expect(result.current.draftCaptureState).toBe("live")
      expect(result.current.draftSourceHealthFreshness).toBe("unknown")

      act(() => {
        window.dispatchEvent(new MessageEvent("message", {
          source: window,
          data: {
            type: "FF_DRAFT_DASHBOARD",
            payload: {
              version: 1,
              kind: "source-health",
              sentAt: 100,
              health: {
                selectorVersion: 1,
                platform: "ESPN",
                status: "healthy",
                mode: "live-history",
                checkedAt: 100,
                pickCount: 0,
                checks: [],
                issues: [],
              },
            },
          },
        }))
        jest.advanceTimersByTime(35_000)
        window.dispatchEvent(new MessageEvent("message", {
          source: window,
          data: { type: "FROM_EXT", draftData: true },
        }))
        jest.advanceTimersByTime(7_000)
      })

      expect(result.current.draftCaptureState).toBe("live")
      expect(result.current.draftSourceHealthFreshness).toBe("stale")
    } finally {
      jest.useRealTimers()
    }
  })

  it("retains locally applied picks after API failure and retries once on demand", async () => {
    const persistEvents = jest.fn()
      .mockRejectedValueOnce(new Error("API unavailable"))
      .mockResolvedValueOnce(undefined)
    const onDraftPlayer = jest.fn()
    const { result } = renderHook(() => useDraftListener({
      playerLib: {
        "4362628": {
          id: "4362628",
          firstName: "Ja'Marr",
          lastName: "Chase",
          fullName: "Ja'Marr Chase",
          team: NFLTeam.CIN,
          position: FantasyPosition.WIDE_RECEIVER,
          ranks: {},
        },
      },
      playersByPosByTeam: {},
      settings: { numTeams: 12 },
      onDraftPlayer,
      setCurrPick: jest.fn(),
      setDraftStarted: jest.fn(),
      apiPersistenceEnabled: true,
      persistEvents,
    }))

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        source: window,
        data: {
          type: "FROM_EXT",
          draftData: {
            draftTitle: "Offline Mock",
            platform: "ESPN",
            draftPicks: [{
              imgUrl: "https://a.espncdn.com/i/headshots/nfl/players/full/4362628.png",
              name: "Ja'Marr Chase",
              team: "CIN",
              position: "WR",
              pick: "R1, P1",
            }],
          },
        },
      }))
      result.current.acceptPendingDraft()
    })

    await waitFor(() => expect(result.current.draftPersistence).toMatchObject({
      state: "offline",
      pendingEventCount: 1,
      canRetry: true,
    }))
    expect(onDraftPlayer).toHaveBeenCalledWith("4362628", 1, undefined, 0)

    act(() => result.current.retryDraftPersistence())
    await waitFor(() => expect(result.current.draftPersistence.state)
      .toBe("recovered"))
    expect(persistEvents).toHaveBeenCalledTimes(2)
    expect(persistEvents.mock.calls[1][0]).toHaveLength(1)
  })

  it("drains picks that arrive while API sync is in flight without duplicates", async () => {
    let releaseFirst: (() => void) | null = null
    const persistEvents = jest.fn()
      .mockImplementationOnce(() => new Promise<void>(
        resolve => { releaseFirst = resolve },
      ))
      .mockResolvedValueOnce(undefined)
    const onDraftPlayer = jest.fn()
    const { result } = renderHook(() => useDraftListener({
      playerLib: {
        "4362628": {
          id: "4362628", firstName: "Ja'Marr", lastName: "Chase",
          fullName: "Ja'Marr Chase", team: NFLTeam.CIN,
          position: FantasyPosition.WIDE_RECEIVER, ranks: {},
        },
        "4430807": {
          id: "4430807", firstName: "Bijan", lastName: "Robinson",
          fullName: "Bijan Robinson", team: NFLTeam.ATL,
          position: FantasyPosition.RUNNING_BACK, ranks: {},
        },
      },
      playersByPosByTeam: {}, settings: { numTeams: 12 }, onDraftPlayer,
      setCurrPick: jest.fn(), setDraftStarted: jest.fn(),
      apiPersistenceEnabled: true, persistEvents,
    }))
    const send = (picks: unknown[]) => window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: { type: "FROM_EXT", draftData: {
        draftTitle: "Concurrent Mock", platform: "ESPN", draftPicks: picks,
      } },
    }))
    const firstPick = {
      imgUrl: "https://a.espncdn.com/i/headshots/nfl/players/full/4362628.png",
      name: "Ja'Marr Chase", team: "CIN", position: "WR", pick: "R1, P1",
    }
    const secondPick = {
      imgUrl: "https://a.espncdn.com/i/headshots/nfl/players/full/4430807.png",
      name: "Bijan Robinson", team: "ATL", position: "RB", pick: "R1, P2",
    }

    act(() => {
      send([firstPick])
      result.current.acceptPendingDraft()
    })
    await waitFor(() => expect(persistEvents).toHaveBeenCalledTimes(1))
    act(() => send([firstPick, secondPick]))
    act(() => releaseFirst?.())

    await waitFor(() => expect(persistEvents).toHaveBeenCalledTimes(2))
    const firstBatch = persistEvents.mock.calls[0][0] as Array<{ eventId: string }>
    const secondBatch = persistEvents.mock.calls[1][0] as Array<{ eventId: string }>
    expect(firstBatch.map(event => event.eventId))
      .toEqual(["ESPN:Concurrent Mock:pick:1"])
    expect(secondBatch.map(event => event.eventId))
      .toEqual(["ESPN:Concurrent Mock:pick:2"])
    expect(result.current.draftPersistence.state).toBe("local")
  })

  it("buffers the first snapshot until the user accepts the draft", () => {
    const onDraftPlayer = jest.fn()
    const setCurrPick = jest.fn()
    const setDraftStarted = jest.fn()

    const {result} = renderHook(() =>
      useDraftListener({
        playerLib: {
          "4362628": {
            id: "4362628",
            firstName: "Ja'Marr",
            lastName: "Chase",
            fullName: "Ja'Marr Chase",
            team: NFLTeam.CIN,
            position: FantasyPosition.WIDE_RECEIVER,
            ranks: {},
          },
        },
        playersByPosByTeam: {},
        settings: { numTeams: 12 },
        onDraftPlayer,
        setCurrPick,
        setDraftStarted,
      }),
    )

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        source: window,
        data: {
          type: "FROM_EXT",
          draftData: {
            draftTitle: "Regression Mock",
            platform: "ESPN",
            draftPicks: [{
              imgUrl:
                "https://a.espncdn.com/i/headshots/nfl/players/full/4362628.png",
              name: "Ja'Marr Chase",
              team: "CIN",
              position: "WR",
              pick: "R1, P1 Team One",
            }],
          },
        },
      }))
    })

    expect(onDraftPlayer).not.toHaveBeenCalled()

    expect(result.current.pendingDraft?.title).toBe("Regression Mock")
    act(() => result.current.acceptPendingDraft())

    expect(onDraftPlayer).toHaveBeenCalledWith(
      "4362628",
      1,
      undefined,
      0,
    )
    expect(setCurrPick).toHaveBeenCalledWith(2)
    expect(setDraftStarted).toHaveBeenCalledWith(true)
  })

  it("merges every pending pick before the user accepts the draft", () => {
    const onDraftPlayer = jest.fn()
    const setCurrPick = jest.fn()
    const setDraftStarted = jest.fn()

    const {result} = renderHook(() =>
      useDraftListener({
        playerLib: {
          "4362628": {
            id: "4362628",
            firstName: "Ja'Marr",
            lastName: "Chase",
            fullName: "Ja'Marr Chase",
            team: NFLTeam.CIN,
            position: FantasyPosition.WIDE_RECEIVER,
            ranks: {},
          },
          "4430807": {
            id: "4430807",
            firstName: "Bijan",
            lastName: "Robinson",
            fullName: "Bijan Robinson",
            team: NFLTeam.ATL,
            position: FantasyPosition.RUNNING_BACK,
            ranks: {},
          },
        },
        playersByPosByTeam: {},
        settings: { numTeams: 10 },
        onDraftPlayer,
        setCurrPick,
        setDraftStarted,
      }),
    )

    const dispatchSnapshot = (
      id: string,
      name: string,
      team: string,
      position: string,
      pick: string,
    ) => {
      window.dispatchEvent(new MessageEvent("message", {
        source: window,
        data: {
          type: "FROM_EXT",
          draftData: {
            draftTitle: "Late Accept Mock",
            platform: "ESPN",
            draftPicks: [{
              imgUrl:
                `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`,
              name,
              team,
              position,
              pick,
            }],
          },
        },
      }))
    }

    act(() => {
      dispatchSnapshot("4362628", "Ja'Marr Chase", "CIN", "WR", "R1, P1")
      dispatchSnapshot("4430807", "Bijan Robinson", "ATL", "RB", "R1, P3")
    })

    act(() => result.current.acceptPendingDraft())

    expect(onDraftPlayer).toHaveBeenNthCalledWith(
      1,
      "4362628",
      1,
      undefined,
      0,
    )
    expect(onDraftPlayer).toHaveBeenNthCalledWith(
      2,
      "4430807",
      3,
      undefined,
      2,
    )
    expect(setCurrPick).toHaveBeenCalledWith(4)
  })

  it("adds an unranked ESPN player and still advances the draft", () => {
    const onDraftPlayer = jest.fn()
    const setCurrPick = jest.fn()
    const setDraftStarted = jest.fn()

    const {result} = renderHook(() =>
      useDraftListener({
        playerLib: {
          "4362628": {
            id: "4362628",
            firstName: "Ja'Marr",
            lastName: "Chase",
            fullName: "Ja'Marr Chase",
            team: NFLTeam.CIN,
            position: FantasyPosition.WIDE_RECEIVER,
            ranks: {},
          },
        },
        playersByPosByTeam: {},
        settings: { numTeams: 10 },
        onDraftPlayer,
        setCurrPick,
        setDraftStarted,
      }),
    )

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        source: window,
        data: {
          type: "FROM_EXT",
          draftData: {
            draftTitle: "Rookie Mock",
            platform: "ESPN",
            draftPicks: [{
              imgUrl:
                "https://a.espncdn.com/i/headshots/nfl/players/full/4870808.png",
              name: "Jeremiyah Love",
              team: "ARI",
              position: "RB",
              pick: "R2, P2 Team Nine",
            }],
          },
        },
      }))
    })

    act(() => result.current.acceptPendingDraft())

    expect(onDraftPlayer).toHaveBeenCalledWith(
      "4870808",
      12,
      expect.objectContaining({
        id: "4870808",
        fullName: "Jeremiyah Love",
        team: NFLTeam.ARI,
        position: FantasyPosition.RUNNING_BACK,
      }),
      8,
    )
    expect(setCurrPick).toHaveBeenCalledWith(13)
    expect(setDraftStarted).toHaveBeenCalledWith(true)
    expect(result.current.draftActivity).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Pick #12 · Jeremiyah Love",
        detail: "Live pick is missing ranking data",
        tone: "warning",
      }),
    ]))
  })

  it("uses ESPN league metadata instead of stale dashboard settings", () => {
    const onDraftPlayer = jest.fn()
    const onDraftMetadata = jest.fn()
    const setCurrPick = jest.fn()
    const setDraftStarted = jest.fn()

    const {result} = renderHook(() =>
      useDraftListener({
        playerLib: {
          "4429795": {
            id: "4429795",
            firstName: "Jahmyr",
            lastName: "Gibbs",
            fullName: "Jahmyr Gibbs",
            team: NFLTeam.DET,
            position: FantasyPosition.RUNNING_BACK,
            ranks: {},
          },
        },
        playersByPosByTeam: {},
        settings: { numTeams: 12 },
        onDraftPlayer,
        onDraftMetadata,
        setCurrPick,
        setDraftStarted,
      }),
    )

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        source: window,
        data: {
          type: "FF_DRAFT_DASHBOARD",
          payload: {
            version: 1,
            kind: "draft-snapshot",
            sentAt: 100,
            draft: {
              id: "ESPN:286766695",
              title: "10-Team PPR Mock",
              platform: "ESPN",
              capturedAt: 100,
              numTeams: 10,
              targetRosterIndex: 8,
              scoringFormat: "PPR",
              picks: [{
                imgUrl:
                  "https://a.espncdn.com/i/headshots/nfl/players/full/4429795.png",
                name: "Jahmyr Gibbs",
                team: "DET",
                position: "RB",
                pick: "R2, P2",
              }],
            },
          },
        },
      }))
    })

    act(() => result.current.acceptPendingDraft())

    expect(onDraftMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        numTeams: 10,
        targetRosterIndex: 8,
        scoringFormat: "PPR",
      }),
    )
    expect(onDraftPlayer).toHaveBeenCalledWith(
      "4429795",
      12,
      undefined,
      8,
    )

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        source: window,
        data: {
          type: "FF_DRAFT_DASHBOARD",
          payload: {
            version: 1,
            kind: "draft-snapshot",
            sentAt: 101,
            draft: {
              id: "ESPN:286766695",
              title: "10-Team PPR Mock",
              platform: "ESPN",
              capturedAt: 101,
              numTeams: 10,
              targetRosterIndex: 8,
              scoringFormat: "PPR",
              picks: [{
                imgUrl:
                  "https://a.espncdn.com/i/headshots/nfl/players/full/4429795.png",
                name: "Jahmyr Gibbs",
                team: "DET",
                position: "RB",
                pick: "R2, P2",
              }],
            },
          },
        },
      }))
    })

    expect(onDraftMetadata).toHaveBeenCalledTimes(2)
    expect(onDraftMetadata).toHaveBeenLastCalledWith(
      expect.objectContaining({ numTeams: 10, scoringFormat: "PPR" }),
    )
  })

  it("uses settings changed after a legacy draft prompt was created", () => {
    const onDraftPlayer = jest.fn()
    const setCurrPick = jest.fn()
    const setDraftStarted = jest.fn()
    const playerLib = {
      "4429795": {
        id: "4429795",
        firstName: "Jahmyr",
        lastName: "Gibbs",
        fullName: "Jahmyr Gibbs",
        team: NFLTeam.DET,
        position: FantasyPosition.RUNNING_BACK,
        ranks: {},
      },
    }

    const { result, rerender } = renderHook(
      ({ numTeams }) => useDraftListener({
        playerLib,
        playersByPosByTeam: {},
        settings: { numTeams },
        onDraftPlayer,
        setCurrPick,
        setDraftStarted,
      }),
      { initialProps: { numTeams: 12 } },
    )

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        source: window,
        data: {
          type: "FROM_EXT",
          draftData: {
            draftTitle: "10-Team PPR Mock",
            platform: "ESPN",
            draftPicks: [{
              imgUrl:
                "https://a.espncdn.com/i/headshots/nfl/players/full/4429795.png",
              name: "Jahmyr Gibbs",
              team: "DET",
              position: "RB",
              pick: "R2, P2",
            }],
          },
        },
      }))
    })

    rerender({ numTeams: 10 })

    act(() => result.current.acceptPendingDraft())

    expect(onDraftPlayer).toHaveBeenCalledWith(
      "4429795",
      12,
      undefined,
      8,
    )
  })
})
