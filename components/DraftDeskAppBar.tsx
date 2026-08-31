import React, { ReactNode, useRef, useState } from "react"
import Image from "next/image"

import {
  FantasyRanker,
  ScoringFormat,
  ThirdPartyADPRanker,
  ThirdPartyRanker,
} from "../types"
import {scoringFormatFor, scoringFormatLabel} from "../behavior/scoringFormat"
import {
  DRAFTY_EXTENSION_STORE_URL,
  DRAFTY_EXTENSION_SUPPORT_PATH,
} from "../behavior/extensionStore"
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
  settings: {numTeams: number, ppr: boolean, scoringFormat?: ScoringFormat, numStartingQbs: number}
  boardSettings: {ranker: FantasyRanker, adpRanker: ThirdPartyADPRanker}
  draftStarted: boolean
  draftComplete?: boolean
  myPickNum: number
  setNumTeams: (numTeams: number) => void
  setIsPpr: (isPpr: boolean) => void
  setScoringFormat?: (scoringFormat: ScoringFormat) => void
  setMyPickNum: (pickNum: number) => void
  onSetRanker: (ranker: FantasyRanker) => void
  onSetAdpRanker: (ranker: ThirdPartyADPRanker) => void
  activeDraftListenerTitle: string | null
  draftCaptureState: DraftCaptureConnectionState
  draftSourceHealth: DraftSourceHealth | null
  draftSourceHealthFreshness: DraftSourceHealthFreshness
  draftPersistence: DraftPersistenceBoundary
  onRetryDraftPersistence: () => void
  setupOperations?: ReactNode
  workspaceOperations?: ReactNode
  rankingSources?: FantasyRanker[]
}

const DraftDeskAppBar = ({
  settings,
  boardSettings,
  draftStarted,
  draftComplete = false,
  myPickNum,
  setNumTeams,
  setIsPpr,
  setScoringFormat,
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
  workspaceOperations,
  rankingSources,
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
  const rankerOptions = Array.from(new Set(
    rankingSources?.length
      ? rankingSources
      : Object.values(ThirdPartyRanker),
  ))
  const scoringFormat = scoringFormatFor(settings)
  const applyScoringFormat = (format: ScoringFormat) => (
    setScoringFormat
      ? setScoringFormat(format)
      : setIsPpr(format !== "standard")
  )

  return (
    <header className={`${styles.desk} ${styles.appBar} hidden w-full text-left xl:grid`}>
      <div className={styles.appBarBrand}>
        <span className={styles.appBarMark}>
          <Image alt="Drafty Logo" height={25} src="/friedchickentechlogo.png" unoptimized width={25} />
        </span>
        <p>Drafty</p>
      </div>
      <div className={styles.appBarLeague}>
        <span>{activeDraftListenerTitle || "Draft workspace"}</span>
        <span>{settings.numTeams} team · {scoringFormatLabel(scoringFormat)} · {settings.numStartingQbs}QB</span>
      </div>
      <div className={styles.appBarStatus}>
        <span className={draftCaptureState === "live" ? styles.liveDot : styles.idleDot} aria-hidden="true" />
        <span>{draftComplete ? "Draft complete" : draftCaptureState === "live" ? "Draft live" : draftStarted ? "Draft active" : "Draft ready"}</span>
        <button
          aria-expanded={drawerOpen}
          aria-haspopup="dialog"
          aria-label="Settings"
          className={styles.appBarSettings}
          onClick={() => setDrawerOpen(true)}
          type="button"
        >
          <svg aria-hidden="true" fill="none" height="15" viewBox="0 0 24 24" width="15">
            <path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" stroke="currentColor" strokeWidth="1.7" />
            <path d="M19.1 13.5c.08-.49.08-2.51 0-3l2-1.55-2-3.46-2.45.98a8.35 8.35 0 0 0-2.6-1.5L13.7 2.4H9.7l-.36 2.57a8.35 8.35 0 0 0-2.6 1.5l-2.44-.98-2 3.46 2 1.55a9.44 9.44 0 0 0 0 3l-2 1.55 2 3.46 2.44-.98a8.35 8.35 0 0 0 2.6 1.5l.36 2.57h4l.35-2.57a8.35 8.35 0 0 0 2.6-1.5l2.45.98 2-3.46-2-1.55Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
          </svg>
        </button>
      </div>

      {drawerOpen && (
        <div
          className={styles.settingsBackdrop}
          onMouseDown={event => {
            if (event.target === event.currentTarget) setDrawerOpen(false)
          }}
        >
          <div
            aria-label="Draft setup"
            aria-modal="true"
            className={`${styles.desk} ${styles.settingsDrawer} flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-slate-600 bg-slate-900 p-5 shadow-2xl`}
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
                  onChange={event => applyScoringFormat(event.target.value as ScoringFormat)}
                  value={scoringFormat}
                >
                  <option value="standard">Standard</option>
                  <option value="half_ppr">Half PPR</option>
                  <option value="ppr">PPR</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Ranking source
                <select
                  aria-label="Ranking source"
                  className={`${styles.focusRing} mt-1 block w-full rounded border border-slate-500 bg-slate-800 p-2 text-sm`}
                  disabled={draftStarted}
                  onChange={event => onSetRanker(event.target.value)}
                  value={boardSettings.ranker}
                >
                  {rankerOptions.map(ranker => (
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
                  onClick={() => window.open(DRAFTY_EXTENSION_STORE_URL, "_blank", "noopener,noreferrer")}
                  type="button"
                >
                  Install Draft Sync
                </button>
                <button
                  className={`${styles.focusRing} rounded border border-slate-500 px-3 py-2 text-sm font-semibold hover:bg-slate-800`}
                  onClick={() => window.open(DRAFTY_EXTENSION_SUPPORT_PATH, "_blank", "noopener,noreferrer")}
                  type="button"
                >
                  Setup guide
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
            <div className="mt-5 border-t border-slate-700 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sky-300">
                Operational status
              </p>
              <div className="flex flex-wrap gap-1" style={{color: "#0f172a"}}>
                <DraftCaptureStatus
                  activeDraftTitle={activeDraftListenerTitle}
                  complete={draftComplete}
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
              {workspaceOperations && <div className="mt-3">{workspaceOperations}</div>}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

export default DraftDeskAppBar
