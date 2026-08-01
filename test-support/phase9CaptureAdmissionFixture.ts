import campaignJson from "../prospective-campaign/phase9-prospective-run-shadow.json"
import fixtureJson from "../__tests__/fixtures/recorded-espn-2026-07-31-league-1788370838-slot-1.json"
import { createBoundedResidualRunShadowForecast } from "../behavior/draft-advisor/boundedResidualRunShadow"
import { createRecordedDraftAdvisorContextAtBoundary } from "../behavior/draft-advisor/completedDraftReplay"
import {
  ReplayForecastEvidenceRecorder,
  ReplayRunOnlyShadowEvidenceRecorder,
} from "../behavior/draft-advisor/replayForecastEvidence"
import { createOpponentForecast } from "../behavior/draft-advisor/opponentModel"
import { canonicalStaticWindowBoundaries } from "../behavior/draft-advisor/staticWindowBacktest"
import type {
  RecordedCompletedDraftReplay,
} from "../behavior/draft-advisor/completedDraftReplay"
import type {
  ProspectiveCampaignManifest,
} from "../behavior/draft-advisor/prospectiveRunShadow"

export const phase9AdmissionCampaign = campaignJson as unknown as ProspectiveCampaignManifest

const sourceFixture = fixtureJson as unknown as RecordedCompletedDraftReplay

const clone = <Value>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value

export const createSyntheticProspectiveFixture = (options: {
  id?: string
  targetRosterIndex?: number
  capturedAt?: number
  rosterShape?: "calibrated" | "wr3"
  omitBoundary?: number
  extraBoundaries?: number[]
} = {}): RecordedCompletedDraftReplay => {
  const fixture = clone(sourceFixture)
  if (options.id) fixture.id = options.id
  if (options.targetRosterIndex !== undefined) fixture.targetRosterIndex = options.targetRosterIndex
  fixture.source!.capturedAt = options.capturedAt || Date.parse("2026-08-02T10:06:00-04:00")
  if (options.rosterShape === "wr3") {
    fixture.settings.numStartingWrs = 3
    fixture.settings.numBenchPlayers = 6
  }
  const frozenRecorder = new ReplayForecastEvidenceRecorder()
  const shadowRecorder = new ReplayRunOnlyShadowEvidenceRecorder()
  const canonicalBoundaries = canonicalStaticWindowBoundaries(fixture)
    .map(window => window.observedThroughOverallPick)
  const boundaries = Array.from(new Set([
    ...canonicalBoundaries,
    ...(options.extraBoundaries || []),
  ])).sort((left, right) => left - right)
  boundaries
    .filter(boundary => boundary !== options.omitBoundary)
    .forEach(boundary => {
      const context = createRecordedDraftAdvisorContextAtBoundary(fixture, boundary)
      const frozen = createOpponentForecast(context, {
        model: "combined",
        targetRosterIndex: fixture.targetRosterIndex,
      })
      const shadow = createBoundedResidualRunShadowForecast(
        context,
        frozen,
        fixture.actualPicks.length,
      )
      frozenRecorder.record({
        sessionId: fixture.id,
        observedThroughOverallPick: boundary,
        forecast: frozen,
        targetRosterIndex: fixture.targetRosterIndex,
        inputFingerprint: "deadbeef",
      })
      shadowRecorder.record({
        sessionId: fixture.id,
        observedThroughOverallPick: boundary,
        forecast: shadow,
        targetRosterIndex: fixture.targetRosterIndex,
        inputFingerprint: "deadbeef",
      })
    })
  fixture.forecastEvidence = frozenRecorder.snapshot(fixture.id)
  fixture.runOnlyShadowEvidence = shadowRecorder.snapshot(fixture.id)
  return fixture
}

export const rawFixtureBytes = (fixture: RecordedCompletedDraftReplay): Uint8Array =>
  Buffer.from(JSON.stringify(fixture), "utf8")

export const cloneCampaign = (): ProspectiveCampaignManifest =>
  clone(phase9AdmissionCampaign)
