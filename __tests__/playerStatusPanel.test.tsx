import React from "react"
import {
  render,
} from "@testing-library/react"

import PlayerStatusPanel from "../components/PlayerStatusPanel"


describe("player status panel", () => {
  it("shows bounded provenance, impact, confidence, and staleness", () => {
    const view = render(
      <PlayerStatusPanel
        playerId="101"
        playerName="Alpha Runner"
        status={{
          playerId: "101",
          state: "ready",
          loadedAt: Date.now(),
          response: {
            schema_version: 1,
            player_id: "101",
            last_updated_at: "2026-09-10T08:00:00Z",
            events: [{
              schema_version: 1,
              id: "status_1",
              player_id: "101",
              type: "injury",
              status: "out",
              short_summary: "Out — hamstring.",
              source: "nflverse_injuries",
              source_url: "https://example.test/injuries.csv",
              source_published_at: "2026-09-09T20:00:00Z",
              fetched_at: "2026-09-10T08:00:00Z",
              confidence: 0.95,
              recommendation_impact: "material",
              stale: true,
            }],
          },
        }}
      />,
    )

    expect(view.getByText("Out — hamstring.")).toBeTruthy()
    expect(view.getByText("material")).toBeTruthy()
    expect(view.getByText("stale")).toBeTruthy()
    expect(view.getByText(/95% confidence/)).toBeTruthy()
    expect(view.getByText(/published 2026-09-09 20:00 UTC/))
      .toBeTruthy()
    expect(view.getByRole("link", {
      name: "nflverse injury report",
    }).getAttribute("href")).toBe(
      "https://example.test/injuries.csv",
    )
  })

  it("fails quietly when status providers are unavailable", () => {
    const view = render(
      <PlayerStatusPanel
        playerId="101"
        status={{
          playerId: "101",
          state: "unavailable",
          loadedAt: Date.now(),
          response: null,
        }}
      />,
    )

    expect(view.getByText(
      "Status provider unavailable. Rankings and drafting are unaffected.",
    )).toBeTruthy()
  })

  it("labels bounded ESPN profile news without elevating its impact", () => {
    const view = render(
      <PlayerStatusPanel
        playerId="3915511"
        playerName="Joe Burrow"
        status={{
          playerId: "3915511",
          state: "ready",
          loadedAt: Date.now(),
          response: {
            schema_version: 1,
            player_id: "3915511",
            last_updated_at: "2026-07-30T15:50:00Z",
            events: [{
              schema_version: 1,
              id: "status_espn",
              player_id: "3915511",
              type: "profile_news",
              status: "published",
              short_summary: "Why this could be Joe Burrow's last year.",
              source: "espn_profile_news",
              source_url: "https://www.espn.com/video/clip/_/id/1002",
              source_published_at: "2026-07-30T14:42:12Z",
              fetched_at: "2026-07-30T15:50:00Z",
              confidence: 0.85,
              recommendation_impact: "none",
              stale: false,
            }],
          },
        }}
      />,
    )

    expect(view.getByText(
      "Why this could be Joe Burrow's last year.",
    )).toBeTruthy()
    expect(view.getByText("none")).toBeTruthy()
    expect(view.getByRole("link", {
      name: "ESPN player news",
    }).getAttribute("href")).toBe(
      "https://www.espn.com/video/clip/_/id/1002",
    )
  })

  it("labels an optional AI summary as structured-event-only", () => {
    const view = render(
      <PlayerStatusPanel
        playerId="101"
        playerName="Alpha Runner"
        status={{
          playerId: "101",
          state: "ready",
          loadedAt: Date.now(),
          response: {
            schema_version: 1,
            player_id: "101",
            last_updated_at: "2026-09-10T08:00:00Z",
            events: [],
            summary: {
              text: "Hamstring availability requires review.",
              method: "openai",
              model: "gpt-5.4-nano",
              generated_at: "2026-09-10T08:30:00Z",
              event_ids: ["status_1"],
            },
          },
        }}
      />,
    )

    expect(view.getByLabelText("Structured player status summary"))
      .toBeTruthy()
    expect(view.getByText(
      "Hamstring availability requires review.",
    )).toBeTruthy()
    expect(view.getByText(
      /AI summary from structured events only · gpt-5.4-nano/,
    )).toBeTruthy()
    expect(view.getByText(/generated 2026-09-10 08:30 UTC/))
      .toBeTruthy()
  })
})
