import React, { useLayoutEffect, useRef } from "react"
import { render, screen } from "@testing-library/react"

import { useRealtimeAdvisor } from "../behavior/hooks/useRealtimeAdvisor"
import { saveDraftPlan } from "../behavior/realtime/storage"
import type { DraftPlanDocument } from "../behavior/realtime/contracts"

const importedPlan: DraftPlanDocument = {
  schema_version: 1,
  draft_session_id: "import-session",
  revision: 1,
  updated_at: "2026-07-30T20:00:00.000Z",
  entries: [{
    id: "portable-import:1",
    proposal_id: "portable-import:1",
    text: "Keep this imported plan statement.",
    source_event_count: 0,
    created_at: "2026-07-30T20:00:00.000Z",
  }],
}

describe("useRealtimeAdvisor portable plan restore", () => {
  afterEach(() => localStorage.clear())

  it("installs a matching imported plan during hook initialization", () => {
    // Home's storage transaction happens before the hook state is refreshed.
    saveDraftPlan(importedPlan, localStorage)
    const Probe = () => {
      const advisor = useRealtimeAdvisor({
        draftSessionId: "import-session",
        sourceEventCount: 0,
      })
      const installed = useRef(false)
      // Layout effects run before useEffect initializes the advisor state,
      // reproducing a confirmation immediately after a session bridge opens.
      useLayoutEffect(() => {
        if (installed.current) return
        installed.current = true
        expect(advisor.replacePlanFromImport(importedPlan)).toBe(true)
      }, [advisor])
      return <p>{advisor.plan?.entries[0]?.text || "not ready"}</p>
    }

    render(<Probe />)
    expect(screen.getByText("Keep this imported plan statement.")).toBeTruthy()
  })
})
