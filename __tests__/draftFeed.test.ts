import {
  normalizeDraftFeedMessage,
} from "../behavior/draft-feed/types"
import {
  parseEspnDraftPicks,
} from "../behavior/draft-feed/parsers"
import { mergeDraftSnapshots } from "../behavior/draft-feed/snapshots"

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
