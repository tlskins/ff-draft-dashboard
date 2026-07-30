import { act, renderHook } from "@testing-library/react"
import { toast } from "react-toastify"
import { useDraftListener } from "../behavior/hooks/useDraftListener"
import { FantasyPosition, NFLTeam } from "../types"

jest.mock("react-toastify", () => {
  const mockedToast = Object.assign(jest.fn(), { dismiss: jest.fn() })
  return { toast: mockedToast }
})

describe("useDraftListener", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("buffers the first snapshot until the user accepts the draft", () => {
    const onDraftPlayer = jest.fn()
    const setCurrPick = jest.fn()
    const setDraftStarted = jest.fn()

    renderHook(() =>
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

    const toastMock = toast as unknown as jest.Mock
    const acceptOptions = toastMock.mock.calls[0][1]
    act(() => acceptOptions.onClick())

    expect(onDraftPlayer).toHaveBeenCalledWith("4362628", 1)
    expect(setCurrPick).toHaveBeenCalledWith(2)
    expect(setDraftStarted).toHaveBeenCalledWith(true)
  })

  it("merges every pending pick before the user accepts the draft", () => {
    const onDraftPlayer = jest.fn()
    const setCurrPick = jest.fn()
    const setDraftStarted = jest.fn()

    renderHook(() =>
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

    const toastMock = toast as unknown as jest.Mock
    const acceptOptions = toastMock.mock.calls[0][1]
    act(() => acceptOptions.onClick())

    expect(onDraftPlayer).toHaveBeenNthCalledWith(1, "4362628", 1)
    expect(onDraftPlayer).toHaveBeenNthCalledWith(2, "4430807", 3)
    expect(setCurrPick).toHaveBeenCalledWith(4)
  })

  it("adds an unranked ESPN player and still advances the draft", () => {
    const onDraftPlayer = jest.fn()
    const setCurrPick = jest.fn()
    const setDraftStarted = jest.fn()

    renderHook(() =>
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

    const toastMock = toast as unknown as jest.Mock
    const acceptOptions = toastMock.mock.calls[0][1]
    act(() => acceptOptions.onClick())

    expect(onDraftPlayer).toHaveBeenCalledWith(
      "4870808",
      12,
      expect.objectContaining({
        id: "4870808",
        fullName: "Jeremiyah Love",
        team: NFLTeam.ARI,
        position: FantasyPosition.RUNNING_BACK,
      }),
    )
    expect(setCurrPick).toHaveBeenCalledWith(13)
    expect(setDraftStarted).toHaveBeenCalledWith(true)
    expect(toastMock).toHaveBeenCalledWith(
      expect.stringContaining("missing ranking data"),
      expect.objectContaining({ type: "warning" }),
    )
  })
})
