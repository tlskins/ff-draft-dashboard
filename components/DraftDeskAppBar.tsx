import React, { ReactNode, useRef, useState } from "react"
import Image from "next/image"

import {
  FantasyRanker,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import type { DraftSourceHealth } from "../behavior/draft-feed/types"
import type {
  DraftCaptureConnectionState,
  DraftPersistenceBoundary,
  DraftSourceHealthFreshness,
} from "../behavior/boundaryState"
import { useDialogAccessibility } from "../behavior/hooks/useDialogAccessibility"
import DraftSourceHealthBadge from "./DraftSourceHealthBadge"
import {
  DraftCaptureStatus,
  DraftPersistenceStatus,
} from "./DraftBoundaryStatus"
import styles from "./DraftDesk.module.css"

interface DraftDeskAppBarProps {
  settings: {numTeams: number, ppr: boolean}
  boardSettings: {ranker: FantasyRanker, adpRanker: ThirdPartyADPRanker}
  draftStarted: boolean
  myPickNum: number
  setNumTeams: (numTeams: number) => void
  setIsPpr: (isPpr: boolean) => void
  setMyPickNum: (pickNum: number) => void
  onSetRanker: (ranker: ThirdPartyRanker) => void
  onSetAdpRanker: (ranker: ThirdPartyADPRanker) => void
  activeDraftListenerTitle: string | null
  draftCaptureState: DraftCaptureConnectionState
  draftSourceHealth: DraftSourceHealth | null
  draftSourceHealthFreshness: DraftSourceHealthFreshness
  draftPersistence: DraftPersistenceBoundary
  onRetryDraftPersistence: () => void
  setupOperations?: ReactNode
}

const DraftDeskAppBar = ({
  settings,
  boardSettings,
  draftStarted,
  myPickNum,
  setNumTeams,
  setIsPpr,
  setMyPickNum,
  onSetRanker,
  onSetAdpRanker,
  activeDraftListenerTitle,
  draftCaptureState,
  draftSourceHealth,
  draftSourceHealthFreshness,
  draftPersistence,
  onRetryDraftPersistence,
  setupOperations,
}: DraftDeskAppBarProps) => {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onDrawerKeyDown = useDialogAccessibility({
    active: drawerOpen,
    dialogRef: drawerRef,
    initialFocusRef: closeRef,
    onClose: () => setDrawerOpen(false),
  })
  const lockLabel = draftStarted
    ? "Draft setup is locked after the first pick."
    : "Draft setup is editable until the first pick."

  return (
    <header className={`${styles.desk} ${styles.surface} hidden w-full items-center justify-between gap-3 px-3 py-1.5 text-left xl:flex`}>
      <div className="flex min-w-0 items-center gap-2">
        <Image alt="Drafty Logo" className="h-7 w-7" height={28} src="/friedchickentechlogo.png" unoptimized width={28} />
        <div>
          <p className="text-sm font-bold tracking-wide">Drafty</p>
          <p className="text-[10px] text-slate-300">Integrated draft desk</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1" style={{color: "#0f172a"}}>
        <DraftCaptureStatus
          activeDraftTitle={activeDraftListenerTitle}
          state={draftCaptureState}
        />
        <DraftSourceHealthBadge
          freshness={draftSourceHealthFreshness}
          health={draftSourceHealth}
        />
        <DraftPersistenceStatus
          onRetry={onRetryDraftPersistence}
          persistence={draftPersistence}
        />
      </div>
      <button
        aria-expanded={drawerOpen}
        aria-haspopup="dialog"
        className={`${styles.focusRing} rounded border border-slate-400 bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-white`}
        onClick={() => setDrawerOpen(true)}
        type="button"
      >
        Settings
      </button>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/60"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setDrawerOpen(false)
          }}
        >
          <div
            aria-label="Draft setup"
            aria-modal="true"
            className={`${styles.desk} flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-600 bg-slate-900 p-5 shadow-2xl`}
            onKeyDown={onDrawerKeyDown}
            ref={drawerRef}
            role="dialog"
            tabIndex={-1}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-300">
                  Draft setup
                </p>
                <h2 className="text-xl font-bold">League and sources</h2>
                <p className={`${styles.muted} mt-1 text-sm`}>{lockLabel}</p>
              </div>
              <button
                aria-label="Close settings"
                className={`${styles.focusRing} rounded border border-slate-500 px-2 py-1 text-sm font-semibold hover:bg-slate-800`}
                onClick={() => setDrawerOpen(false)}
                ref={closeRef}
                type="button"
              >
                Close
              </button>
            </div>

            <fieldset className="space-y-3" disabled={draftStarted}>
              <legend className="sr-only">Draft configuration</legend>
              <label className="block text-sm font-semibold">
                League size
                <select
                  aria-label="League size"
                  className={`${styles.focusRing} mt-1 block w-full rounded border border-slate-500 bg-slate-800 p-2 text-sm`}
                  disabled={draftStarted}
                  onChange={event => {
                    setNumTeams(Number(event.target.value))
                    setMyPickNum(1)
                  }}
                  value={settings.numTeams}
                >
                  {[10, 12, 14].map(count => (
                    <option key={count} value={count}>{count} teams</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Your draft slot
                <select
                  aria-label="Your draft slot"
                  className={`${styles.focusRing} mt-1 block w-full rounded border border-slate-500 bg-slate-800 p-2 text-sm`}
                  disabled={draftStarted}
                  onChange={event => setMyPickNum(Number(event.target.value))}
                  value={myPickNum}
                >
                  {Array.from({length: settings.numTeams}, (_, index) => (
                    <option key={index + 1} value={index + 1}>Pick {index + 1}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Scoring
                <select
                  aria-label="Scoring"
                  className={`${styles.focusRing} mt-1 block w-full rounded border border-slate-500 bg-slate-800 p-2 text-sm`}
                  disabled={draftStarted}
                  onChange={event => setIsPpr(event.target.value === "PPR")}
                  value={settings.ppr ? "PPR" : "Standard"}
                >
                  <option value="Standard">Standard</option>
                  <option value="PPR">PPR</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Ranking source
                <select
                  aria-label="Ranking source"
                  className={`${styles.focusRing} mt-1 block w-full rounded border border-slate-500 bg-slate-800 p-2 text-sm`}
                  disabled={draftStarted}
                  onChange={event => onSetRanker(event.target.value as ThirdPartyRanker)}
                  value={boardSettings.ranker}
                >
                  {Object.values(ThirdPartyRanker).map(ranker => (
                    <option key={ranker} value={ranker}>{ranker}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                ADP source
                <select
                  aria-label="ADP source"
                  className={`${styles.focusRing} mt-1 block w-full rounded border border-slate-500 bg-slate-800 p-2 text-sm`}
                  disabled={draftStarted}
                  onChange={event => onSetAdpRanker(event.target.value as ThirdPartyADPRanker)}
                  value={boardSettings.adpRanker}
                >
                  {Object.values(ThirdPartyADPRanker).map(ranker => (
                    <option key={ranker} value={ranker}>{ranker}</option>
                  ))}
                </select>
              </label>
            </fieldset>

            <div className="mt-5 border-t border-slate-700 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sky-300">
                Connections and data
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className={`${styles.focusRing} rounded border border-slate-500 px-3 py-2 text-sm font-semibold hover:bg-slate-800`}
                  onClick={() => window.open("https://chrome.google.com/webstore/detail/ff-draft-pulse/cjbbljpchmkblfjaglkcdejcloedpnkh?utm_source=ext_sidebar&hl=en-US")}
                  type="button"
                >
                  Download extension
                </button>
                <button
                  className={`${styles.focusRing} rounded border border-slate-500 px-3 py-2 text-sm font-semibold hover:bg-slate-800`}
                  onClick={() => window.open(`https://fantasy.espn.com/football/mockdraftlobby?addata=right_rail_mock_ff${new Date().getFullYear()}`)}
                  type="button"
                >
                  Find ESPN mock
                </button>
              </div>
              {setupOperations && <div className="mt-3">{setupOperations}</div>}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

export default DraftDeskAppBar
