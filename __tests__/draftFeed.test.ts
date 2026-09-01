import {
  normalizeDraftFeedMessage,
} from "../behavior/draft-feed/types"
import {
  parseEspnDraftPicks,
} from "../behavior/draft-feed/parsers"
import { mergeDraftSnapshots } from "../behavior/draft-feed/snapshots"
import { FantasyPosition, NFLTeam } from "../types"

describe("draft feed compatibility", () => {
  it("normalizes the legacy extension heartbeat", () => {
    expect(
      normalizeDraftFeedMessage(
        { type: "FROM_EXT", draftData: true },
        123,
      ),
    ).toEqual({
      version: 1,
      kind: "heartbeat",
      sentAt: 123,
    })
  })

  it("normalizes a legacy pick batch into a snapshot", () => {
    const event = normalizeDraftFeedMessage(
      {
        type: "FROM_EXT",
        draftData: {
          draftTitle: "Mock 123",
          platform: "ESPN",
          draftPicks: [{
            imgUrl: "https://example.com/1.png",
            name: "Player",
            team: "BUF",
            position: "QB",
            pick: "R1, P1",
          }],
        },
      },
      456,
    )

    expect(event).toMatchObject({
      kind: "draft-snapshot",
      draft: {
        id: "ESPN:Mock 123",
        title: "Mock 123",
        capturedAt: 456,
      },
    })
  })

  it("rejects unrelated window messages", () => {
    expect(normalizeDraftFeedMessage({ type: "something-else" })).toBeNull()
  })

  it("normalizes bounded extension selector health", () => {
    const message = {
      type: "FF_DRAFT_DASHBOARD",
      payload: {
        version: 1,
        kind: "source-health",
        sentAt: 500,
        health: {
          selectorVersion: 2,
          platform: "ESPN",
          status: "degraded",
          mode: "live-board",
          checkedAt: 499,
          pickCount: 3,
          checks: [{
            name: "history-rows",
            selector: ".draft-column li",
            matched: 4,
            required: false,
            healthy: false,
          }],
          issues: ["history-rows-unhealthy"],
        },
      },
    }

    expect(normalizeDraftFeedMessage(message)).toEqual(message.payload)
  })

  it("rejects malformed selector health instead of trusting page data", () => {
    expect(normalizeDraftFeedMessage({
      type: "FF_DRAFT_DASHBOARD",
      payload: {
        version: 1,
        kind: "source-health",
        sentAt: 500,
        health: {
          selectorVersion: 1,
          platform: "ESPN",
          status: "fine",
          mode: "live-history",
          checkedAt: 499,
          pickCount: -1,
          checks: [],
          issues: [],
        },
      },
    })).toBeNull()
  })

  it("derives ESPN's zero-based target roster from a valid one-based URL team id", () => {
    const event = normalizeDraftFeedMessage({
      type: "FF_DRAFT_DASHBOARD",
      payload: {
        version: 1,
        kind: "draft-snapshot",
        sentAt: 500,
        draft: {
          id: "ESPN:236942237",
          title: "10-Team PPR Mock",
          platform: "ESPN",
          capturedAt: 500,
          sourceUrl: "https://fantasy.espn.com/football/draft?leagueId=236942237&seasonId=2026&teamId=3&memberId=private",
          numTeams: 10,
          picks: [],
        },
      },
    })

    expect(event).toMatchObject({
      kind: "draft-snapshot",
      draft: { targetRosterIndex: 2 },
    })
  })

  it("accepts bounded authoritative ESPN roster settings", () => {
    const event = normalizeDraftFeedMessage({
      type: "FF_DRAFT_DASHBOARD",
      payload: {
        version: 1,
        kind: "draft-snapshot",
        sentAt: 500,
        draft: {
          id: "ESPN:236942237",
          title: "10-Team PPR Draft",
          platform: "ESPN",
          capturedAt: 500,
          sourceUrl: "https://fantasy.espn.com/football/draft?leagueId=236942237&teamId=3",
          numTeams: 10,
          rosterSettings: {
            numStartingQbs: 1,
            numStartingRbs: 2,
            numStartingWrs: 3,
            numStartingTes: 1,
            numFlex: 3,
            numBenchPlayers: 5,
            unsupportedLineupSlots: [],
            source: "espn_league_settings",
          },
          picks: [],
        },
      },
    })

    expect(event).toMatchObject({
      kind: "draft-snapshot",
      draft: {rosterSettings: {numStartingWrs: 3, numFlex: 3, numBenchPlayers: 5}},
    })
  })

  it("drops malformed ESPN roster settings at the message boundary", () => {
    const event = normalizeDraftFeedMessage({
      type: "FF_DRAFT_DASHBOARD",
      payload: {
        version: 1,
        kind: "draft-snapshot",
        sentAt: 500,
        draft: {
          id: "ESPN:236942237",
          title: "10-Team PPR Draft",
          platform: "ESPN",
          capturedAt: 500,
          sourceUrl: "https://fantasy.espn.com/football/draft?leagueId=236942237&teamId=3",
          numTeams: 10,
          rosterSettings: {
            numStartingQbs: 1,
            numStartingRbs: 2,
            numStartingWrs: 3,
            numStartingTes: 1,
            numFlex: 99,
            numBenchPlayers: 5,
            unsupportedLineupSlots: [],
            source: "espn_league_settings",
          },
          picks: [],
        },
      },
    })

    expect(event).toMatchObject({kind: "draft-snapshot", draft: {rosterSettings: null}})
  })

  it.each([
    ["missing", "https://fantasy.espn.com/football/draft?leagueId=1"],
    ["non-numeric", "https://fantasy.espn.com/football/draft?teamId=3oops"],
    ["zero", "https://fantasy.espn.com/football/draft?teamId=0"],
    ["out of range", "https://fantasy.espn.com/football/draft?teamId=11"],
    ["untrusted host", "https://example.test/football/draft?teamId=3"],
  ])("fails closed for a %s ESPN team id", (_reason, sourceUrl) => {
    const event = normalizeDraftFeedMessage({
      type: "FF_DRAFT_DASHBOARD",
      payload: {
        version: 1,
        kind: "draft-snapshot",
        sentAt: 500,
        draft: {
          id: "ESPN:236942237",
          title: "10-Team PPR Mock",
          platform: "ESPN",
          capturedAt: 500,
          sourceUrl,
          numTeams: 10,
          targetRosterIndex: 2,
          picks: [],
        },
      },
    })

    expect(event).toMatchObject({
      kind: "draft-snapshot",
      draft: { targetRosterIndex: null },
    })
  })
})

describe("ESPN draft parsing", () => {
  it("converts round and slot into an overall pick", () => {
    expect(
      parseEspnDraftPicks(
        [{
          imgUrl:
            "https://a.espncdn.com/i/headshots/nfl/players/full/4362628.png",
          name: "Ja'Marr Chase",
          team: "CIN",
          position: "WR",
          pick: "R2, P3 Some Team",
        }],
        12,
      ),
    ).toEqual([{
      id: "4362628",
      overallPick: 15,
      name: "Ja'Marr Chase",
      team: "CIN",
      position: "WR",
    }])
  })

  it("drops incomplete placeholder rows", () => {
    expect(
      parseEspnDraftPicks(
        [{
          imgUrl: "",
          name: "",
          team: "",
          position: "",
          pick: "",
        }],
        12,
      ),
    ).toEqual([])
  })

  it("matches completed-board picks whose history image is unavailable", () => {
    expect(
      parseEspnDraftPicks(
        [{
          imgUrl: "",
          name: "Jahmyr Gibbs",
          team: "DET",
          position: "RB",
          pick: "R1, P2",
        }],
        10,
        {
          RB: {
            DET: [{
              id: "4429795",
              firstName: "Jahmyr",
              lastName: "Gibbs",
              fullName: "Jahmyr Gibbs",
              team: NFLTeam.DET,
              position: FantasyPosition.RUNNING_BACK,
              ranks: {},
            }],
          },
        },
      ),
    ).toEqual([{
      id: "4429795",
      overallPick: 2,
      name: "Jahmyr Gibbs",
      team: "DET",
      position: "RB",
    }])
  })

  it("ignores platform-only positions without corrupting rosters", () => {
    expect(
      parseEspnDraftPicks(
        [{
          imgUrl:
            "https://a.espncdn.com/i/headshots/nfl/players/full/123.png",
          name: "Some Kicker",
          team: "BUF",
          position: "K",
          pick: "R15, P1",
        }],
        10,
      ),
    ).toEqual([])
  })
})

describe("draft snapshot buffering", () => {
  it("retains picks that disappear from a later ESPN snapshot", () => {
    const firstSnapshot = {
      id: "ESPN:Mock 123",
      title: "Mock 123",
      platform: "ESPN" as const,
      capturedAt: 100,
      picks: [{
        imgUrl:
          "https://a.espncdn.com/i/headshots/nfl/players/full/4362628.png",
        name: "Ja'Marr Chase",
        team: "CIN",
        position: "WR",
        pick: "R1, P1 Team One",
      }],
    }
    const laterSnapshot = {
      ...firstSnapshot,
      capturedAt: 200,
      picks: [{
        imgUrl:
          "https://a.espncdn.com/i/headshots/nfl/players/full/4430807.png",
        name: "Bijan Robinson",
        team: "ATL",
        position: "RB",
        pick: "R1, P3 Team Three",
      }],
    }

    expect(
      mergeDraftSnapshots(firstSnapshot, laterSnapshot),
    ).toMatchObject({
      capturedAt: 200,
      picks: [
        expect.objectContaining({ name: "Ja'Marr Chase" }),
        expect.objectContaining({ name: "Bijan Robinson" }),
      ],
    })
  })
})
