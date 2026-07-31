import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import EmpiricalBaseShadowCaptureReadiness from "../components/EmpiricalBaseShadowCaptureReadiness"
import LiveAdvisorPanel from "../components/LiveAdvisorPanel"
import {
  deriveEmpiricalBaseShadowCaptureStatus,
} from "../behavior/draft-advisor/empiricalBaseShadowCaptureStatus"
import type {
  ReplayEmpiricalBaseShadowEvidence,
  ReplayForecastEvidence,
} from "../behavior/draft-advisor/completedDraftReplay"
import {
  EMPIRICAL_BASE_SHADOW_ARTIFACT,
} from "../behavior/draft-advisor/empiricalBaseShadow"
import type { EmpiricalBaseShadowForecast } from "../behavior/draft-advisor/empiricalBaseShadow"
import type { ReplayCaptureStatus } from "../behavior/draft-advisor/replayCaptureStatus"
import type { OpponentForecast } from "../behavior/draft-advisor/types"
import type { DraftRecommendationSet } from "../behavior/draft-advisor/recommendations"

const frozenForecast: OpponentForecast = {
  schemaVersion: 1,
  model: "combined",
  targetRosterIndex: 0,
  picks: [{
    overallPick: 2,
    rosterIndex: 1,
    positionProbabilities: [],
    playerProbabilities: [],
  }],
  runProbabilities: [],
  tierBoundaryProbabilities: [],
}

const shadowForecast = (
  kind: "known_total" | "fallback_context_horizon" = "known_total",
): EmpiricalBaseShadowForecast => ({
  schemaVersion: 1,
  modelIdentity: "empirical_opponent_base_shadow_v1",
  artifactId: "empirical_opponent_base_shadow_v1",
  trainingCorpusFingerprint: EMPIRICAL_BASE_SHADOW_ARTIFACT.trainingCorpusFingerprint,
  targetRosterIndex: 0,
  phaseProvenance: { kind, totalDraftPicks: 160 },
  picks: [{ overallPick: 2, rosterIndex: 1, positionProbabilities: [] }],
  runProbabilities: [],
})

const frozenCaptureStatus: ReplayCaptureStatus = {
  state: "recording",
  reasonCode: "recording",
  message: "Recording local pre-pick opponent forecasts.",
  observationCount: 0,
  latestObservedThroughOverallPick: null,
}

const recommendations = {
  schemaVersion: 1,
  currentPick: 2,
  nextUserPick: 3,
  preferredView: "cross_position",
  viewExplanation: "Compare options.",
  candidates: [],
} as unknown as DraftRecommendationSet

const evidence = (): {
  frozen: ReplayForecastEvidence
  shadow: ReplayEmpiricalBaseShadowEvidence
} => ({
  frozen: {
    schemaVersion: 1,
    sessionId: "draft",
    observations: [{
      observedThroughOverallPick: 1,
      inputFingerprint: "12345678",
      observationFingerprint: "12345678",
      modelIdentity: "deterministic_opponent_v1",
      model: "combined",
      targetRosterIndex: 0,
      forecast: frozenForecast,
    }],
  },
  shadow: {
    schemaVersion: 1,
    sessionId: "draft",
    observations: [{
      observedThroughOverallPick: 1,
      inputFingerprint: "12345678",
      observationFingerprint: "12345678",
      modelIdentity: "empirical_opponent_base_shadow_v1",
      artifactId: "empirical_opponent_base_shadow_v1",
      trainingCorpusFingerprint: EMPIRICAL_BASE_SHADOW_ARTIFACT.trainingCorpusFingerprint,
      targetRosterIndex: 0,
      phaseProvenance: { kind: "known_total", totalDraftPicks: 160 },
      forecast: shadowForecast(),
    }],
  },
})

const derive = (
  overrides: Partial<Parameters<typeof deriveEmpiricalBaseShadowCaptureStatus>[0]> = {},
) => deriveEmpiricalBaseShadowCaptureStatus({
  sessionId: "draft",
  draftStarted: true,
  complete: false,
  historyAhead: false,
  frozenForecast,
  shadowForecast: shadowForecast(),
  frozenCaptureStatus,
  ...overrides,
})

describe("empirical base shadow capture readiness", () => {
  it("has deterministic waiting, phase, history, and frozen-v1 pause states", () => {
    expect(derive({ sessionId: null, draftStarted: false }).reasonCode).toBe("no_session")
    expect(derive({ draftStarted: false })).toMatchObject({
      reasonCode: "not_started",
      message: "Shadow capture is ready and will begin when the draft starts.",
    })
    expect(derive({
      draftStarted: false,
      shadowForecast: shadowForecast("fallback_context_horizon"),
    }).message).toBe(
      "Waiting for the draft provider total; shadow capture will stay paused until it arrives.",
    )
    expect(derive({ shadowForecast: shadowForecast("fallback_context_horizon") }).reasonCode)
      .toBe("fallback_phase")
    expect(derive({ historyAhead: true }).reasonCode).toBe("history_ahead")
    expect(derive({ frozenCaptureStatus: { ...frozenCaptureStatus, state: "paused" } }).reasonCode)
      .toBe("frozen_capture_paused")
  })

  it("requires exact known-total boundary and horizon matches before labels are comparable", () => {
    const matched = evidence()
    expect(derive({ frozenEvidence: matched.frozen, shadowEvidence: matched.shadow }))
      .toMatchObject({
        state: "recording",
        knownTotalPhase: true,
        boundariesMatch: true,
        horizonsMatch: true,
        comparableObservationCount: 1,
      })
    const wrongBoundary = evidence()
    wrongBoundary.shadow.observations[0].observedThroughOverallPick = 2
    expect(derive({ frozenEvidence: wrongBoundary.frozen, shadowEvidence: wrongBoundary.shadow }))
      .toMatchObject({ reasonCode: "mismatch", comparableObservationCount: 0 })
    const wrongHorizon = evidence()
    wrongHorizon.shadow.observations[0].forecast = {
      ...shadowForecast(),
      picks: [{ overallPick: 3, rosterIndex: 1, positionProbabilities: [] }],
    }
    expect(derive({ frozenEvidence: wrongHorizon.frozen, shadowEvidence: wrongHorizon.shadow }))
      .toMatchObject({ reasonCode: "mismatch", boundariesMatch: true, horizonsMatch: false })
    const fallbackStored = evidence()
    fallbackStored.shadow.observations[0].phaseProvenance = {
      kind: "fallback_context_horizon", totalDraftPicks: 160,
    }
    expect(derive({ frozenEvidence: fallbackStored.frozen, shadowEvidence: fallbackStored.shadow }))
      .toMatchObject({
        comparableObservationCount: 0,
        boundariesMatch: false,
        horizonsMatch: false,
        reasonCode: "mismatch",
      })
  })

  it("distinguishes a completed comparable capture from a completed draft without labels", () => {
    const matched = evidence()
    expect(derive({
      complete: true,
      frozenEvidence: matched.frozen,
      shadowEvidence: matched.shadow,
    })).toMatchObject({ state: "completed_usable", comparableObservationCount: 1 })
    expect(derive({ complete: true, frozenEvidence: matched.frozen })).toMatchObject({
      state: "completed_without_comparable_labels",
      reasonCode: "completed_without_comparable_labels",
    })
  })

  it("keeps details collapsed by default while exposing a labelled, polite status", () => {
    const status = derive()
    render(<EmpiricalBaseShadowCaptureReadiness status={status} />)
    const details = screen.getByText(/Shadow capture: recording/).closest("details")
    expect(details?.open).toBe(false)
    expect(screen.getByText(/Shadow capture: recording/).getAttribute("aria-live"))
      .toBe("polite")
    fireEvent.click(screen.getByText(/Shadow capture: recording/))
    expect(screen.getByLabelText("Shadow capture readiness details").textContent)
      .toContain("Draft phase: known total (160 picks).")
    expect(screen.getByLabelText("Shadow capture readiness details").textContent)
      .toContain("Observation boundaries: awaiting first labels; horizons: awaiting first labels.")
    expect(screen.getByRole("status").textContent)
      .toContain("Recording parallel frozen v1 and learned-base shadow labels locally.")
  })

  it("keeps completed capture readiness visible when a provider clears the active-draft flag", () => {
    const matched = evidence()
    const completedShadow = derive({
      complete: true,
      draftStarted: false,
      frozenEvidence: matched.frozen,
      shadowEvidence: matched.shadow,
    })
    render(
      <LiveAdvisorPanel
        draftStarted={false}
        onSelectPlayer={jest.fn()}
        recommendations={recommendations}
        replayCaptureStatus={{
          ...frozenCaptureStatus,
          state: "waiting",
          reasonCode: "not_started",
          message: "Forecast evidence will begin when the draft starts.",
        }}
        empiricalBaseShadowCaptureStatus={completedShadow}
      />,
    )
    expect(screen.getByLabelText("Completed local capture")).toBeTruthy()
    expect(screen.getByText(/Frozen v1 and learned-base shadow labels are comparable/))
      .toBeTruthy()
    expect(screen.queryByText("Forecast evidence will begin when the draft starts.")).toBeNull()
    expect(screen.queryByText("No legal roster selections remain.")).toBeNull()
  })

  it("shows selected-session pre-draft readiness but stays absent with no session", () => {
    const selectedSessionStatus = derive({ draftStarted: false })
    render(
      <LiveAdvisorPanel
        draftStarted={false}
        onSelectPlayer={jest.fn()}
        recommendations={recommendations}
        empiricalBaseShadowCaptureStatus={selectedSessionStatus}
      />,
    )
    expect(screen.getByLabelText("Shadow capture readiness")).toBeTruthy()
    expect(screen.getByText(/Shadow capture: ready to start/)).toBeTruthy()
    expect(screen.queryByLabelText("Deterministic draft advisor")).toBeNull()
    expect(screen.queryByText("No legal roster selections remain.")).toBeNull()

    render(
      <LiveAdvisorPanel
        draftStarted={false}
        onSelectPlayer={jest.fn()}
        recommendations={recommendations}
        empiricalBaseShadowCaptureStatus={derive({
          sessionId: null,
          draftStarted: false,
        })}
      />,
    )
    expect(screen.queryAllByLabelText("Shadow capture readiness")).toHaveLength(1)
  })
})
