import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import type {User} from "firebase/auth"

import {
  getUserMockDraft,
  listUserMockDrafts,
  markUserMockDraftReviewed,
  type UserMockDraftSummary,
} from "../behavior/api/userMockDrafts"
import {
  completedMockPutRequest,
  isLocalCompletedMockArchive,
  readLocalCompletedMocks,
  storeLocalCompletedMock,
  type LocalMockDraftArchive,
} from "../behavior/mockDraft/archive"
import {
  reviewCompletedMock,
  type ReviewPosition,
} from "../behavior/mockDraft/review"
import type {RecordedCompletedDraftReplay} from "../behavior/draft-advisor/completedDraftReplay"
import {validateCompletedDraftReplay} from "../behavior/draft-advisor/replayFixtures"
import {putUserMockDraft} from "../behavior/api/userMockDrafts"
import {FantasyPosition} from "../types"
import type {CompletedMockArchiveState} from "../behavior/hooks/useCompletedMockArchive"
import {
  markLocalMockReviewReviewed,
  MOCK_REVIEW_RECEIPTS_CHANGED_EVENT,
  readLocalMockReviewReceipts,
} from "../behavior/mockDraft/reviewReceipts"
import reviewStyles from "./MockDraftReviewPanel.module.css"


const POSITIONS: Array<{value: ReviewPosition; label: string}> = [
  {value: FantasyPosition.QUARTERBACK, label: "QB"},
  {value: FantasyPosition.RUNNING_BACK, label: "RB"},
  {value: FantasyPosition.WIDE_RECEIVER, label: "WR"},
  {value: FantasyPosition.TIGHT_END, label: "TE"},
]

const playerName = (fixture: RecordedCompletedDraftReplay, id: string): string =>
  fixture.players.find(player => player.id === id)?.name || id

const playerTier = (fixture: RecordedCompletedDraftReplay, id: string): number | null => {
  const tier = fixture.players.find(player => player.id === id)?.userTier
  return typeof tier === "number" && Number.isInteger(tier) && tier > 0 ? tier : null
}

export const draftScorecardTitle = (
  title: string | null | undefined,
  platform: string,
  completedAt: string,
): string => {
  const cleaned = (title || "")
    .replace(/^ESPN\s+Fantasy\s+Football\s+Draft\s*(?:[-–—:|]\s*)?/i, "")
    .replace(/^Fantasy\s+Football\s+Draft\s*(?:[-–—:|]\s*)?/i, "")
    .trim()
  if (cleaned) return cleaned
  const date = new Date(completedAt)
  const dateLabel = Number.isNaN(date.valueOf())
    ? "Completed draft"
    : date.toLocaleDateString(undefined, {month: "short", day: "numeric", year: "numeric"})
  return `${platform === "UNKNOWN" ? "Draft" : platform} · ${dateLabel}`
}

const signed = (value: number): string => `${value > 0 ? "+" : ""}${value.toFixed(1)}`

const tierSummary = (tiers: Record<string, number>): string => Object.entries(tiers)
  .sort(([left], [right]) => Number(left.slice(1)) - Number(right.slice(1)))
  .map(([tier, count]) => `${count} ${tier}`)
  .join(" · ") || "—"

type ReviewView = "overview" | "position" | "picks" | "alternatives" | "method"

const readTextFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(new Error("Completed draft file could not be read"))
  reader.onload = () => typeof reader.result === "string"
    ? resolve(reader.result)
    : reject(new Error("Completed draft file is not text"))
  reader.readAsText(file)
})

export const MockDraftReviewPanel = ({
  season,
  user,
  currentArchive,
  currentArchiveError,
  requestedArchive,
  showTrigger = true,
  showUnreviewedBanner = false,
  archiveSyncState = "idle",
  archiveSyncError,
}: {
  season: number
  user: User | null
  currentArchive?: LocalMockDraftArchive | null
  currentArchiveError?: string | null
  requestedArchive?: LocalMockDraftArchive | null
  showTrigger?: boolean
  showUnreviewedBanner?: boolean
  archiveSyncState?: CompletedMockArchiveState
  archiveSyncError?: string | null
}) => {
  const [open, setOpen] = useState(false)
  const [summaries, setSummaries] = useState<UserMockDraftSummary[]>([])
  const [selected, setSelected] = useState<LocalMockDraftArchive | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [firstPosition, setFirstPosition] = useState<ReviewPosition | "">("")
  const [secondPosition, setSecondPosition] = useState<ReviewPosition | "">("")
  const [reviewSeason, setReviewSeason] = useState(season)
  const [archiveRevision, setArchiveRevision] = useState(0)
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [reviewView, setReviewView] = useState<ReviewView>("overview")
  const [receiptRevision, setReceiptRevision] = useState(0)
  const [dismissedBannerId, setDismissedBannerId] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const markingReviewed = useRef(new Set<string>())

  useEffect(() => {
    if (!requestedArchive) return
    setReviewSeason(requestedArchive.season)
    setSelected(requestedArchive)
    setOpen(true)
  }, [requestedArchive])

  useEffect(() => {
    if (typeof window === "undefined") return
    const update = () => setReceiptRevision(value => value + 1)
    window.addEventListener(MOCK_REVIEW_RECEIPTS_CHANGED_EVENT, update)
    return () => window.removeEventListener(MOCK_REVIEW_RECEIPTS_CHANGED_EVENT, update)
  }, [])

  const archiveSyncCopy = archiveSyncState === "saving_local"
    ? "Saving completed draft locally…"
    : archiveSyncState === "saved_local"
      ? user ? "Saved locally; waiting to sync." : "Saved on this device."
      : archiveSyncState === "syncing"
        ? "Syncing completed drafts…"
        : archiveSyncState === "synced"
          ? "Completed drafts saved and synced."
          : archiveSyncState === "offline"
            ? "Saved locally; cloud sync will retry."
            : archiveSyncState === "error"
              ? "Completed draft sync needs attention."
              : null

  const local = useMemo(() => {
    void archiveRevision
    const current = currentArchive?.season === reviewSeason ? currentArchive : null
    if (typeof localStorage === "undefined") return current ? [current] : []
    const stored = readLocalCompletedMocks(localStorage, reviewSeason)
    return current && !stored.some(item => item.mock_id === current.mock_id)
      ? [current, ...stored]
      : stored
  }, [archiveRevision, currentArchive, reviewSeason])

  const localReceipts = useMemo(() => {
    void receiptRevision
    return typeof localStorage === "undefined"
      ? {}
      : readLocalMockReviewReceipts(localStorage, reviewSeason)
  }, [receiptRevision, reviewSeason])

  const importCompletedMock = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setError(null)
    setImportStatus(null)
    try {
      if (file.size > 5_000_000) throw new Error("Completed draft import exceeds 5 MB")
      const value = JSON.parse(await readTextFile(file)) as unknown
      if (!isLocalCompletedMockArchive(value)) {
        throw new Error("Completed draft import does not satisfy the archive contract")
      }
      const replayErrors = validateCompletedDraftReplay(
        value.replay as unknown as RecordedCompletedDraftReplay,
      )
      if (replayErrors.length) {
        throw new Error(`Completed draft replay is invalid: ${replayErrors[0]}`)
      }
      storeLocalCompletedMock(localStorage, value)
      setReviewSeason(value.season)
      setSelected(value)
      setArchiveRevision(revision => revision + 1)
      if (!user) {
        setImportStatus("Imported locally.")
        return
      }
      try {
        const token = await user.getIdToken()
        await putUserMockDraft(
          value.mock_id,
          completedMockPutRequest(value),
          {token, season: value.season},
        )
        setImportStatus("Imported locally and synced.")
      } catch {
        setImportStatus("Imported locally; cloud sync will retry automatically.")
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Completed draft import failed")
    }
  }, [user])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    setReviewView("overview")
  }, [open])

  useEffect(() => {
    if (!open) return
    setSelected(current => current && current.season === reviewSeason
      ? current
      : local[0] || null)
  }, [local, open, reviewSeason])

  useEffect(() => {
    if (!open && !showUnreviewedBanner) return
    if (!user) {
      setSummaries([])
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    void user.getIdToken()
      .then(token => listUserMockDrafts({token, season: reviewSeason}))
      .then(result => {
        if (active) setSummaries(result.mocks)
      })
      .catch(caught => {
        if (active) setError(caught instanceof Error ? caught.message : "Draft history is unavailable")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, reviewSeason, showUnreviewedBanner, user])

  const selectRemote = useCallback(async (summary: UserMockDraftSummary) => {
    const localMatch = local.find(item => item.mock_id === summary.mock_id)
    if (localMatch) {
      setSelected(localMatch)
      return
    }
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const token = await user.getIdToken()
      const record = await getUserMockDraft(summary.mock_id, {token, season: summary.season})
      setSelected({
        schema_version: 1,
        season: record.season,
        mock_id: record.mock_id,
        completed_at: record.completed_at,
        ranking_source: record.ranking_source,
        adp_source: record.adp_source,
        targets: record.targets,
        replay: record.replay,
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Completed draft is unavailable")
    } finally {
      setLoading(false)
    }
  }, [local, user])

  const review = useMemo(() => {
    if (!selected) return null
    const positionSequence = [firstPosition, secondPosition]
      .filter((position): position is ReviewPosition => position !== "")
    return reviewCompletedMock({
      fixture: selected.replay as unknown as RecordedCompletedDraftReplay,
      targetPlayerIds: selected.targets.map(target => target.player_id),
      request: {positionSequence},
    })
  }, [firstPosition, secondPosition, selected])

  const allSummaries = useMemo(() => {
    const localSummaries = local.map(item => {
      const replay = item.replay as unknown as RecordedCompletedDraftReplay
      return {
        schema_version: 1 as const,
        season: item.season,
        mock_id: item.mock_id,
        completed_at: item.completed_at,
        platform: replay.source?.platform || "UNKNOWN",
        title: replay.source?.title || "Completed draft",
        team_count: replay.settings.numTeams,
        user_draft_slot: replay.targetRosterIndex + 1,
        pick_count: replay.actualPicks.length,
        ranking_source: item.ranking_source,
        adp_source: item.adp_source,
        content_fingerprint: "local",
        reviewed_at: localReceipts[item.mock_id] || null,
      } satisfies UserMockDraftSummary
    })
    return [...localSummaries, ...summaries.filter(summary =>
      !localSummaries.some(localSummary => localSummary.mock_id === summary.mock_id))]
      .sort((left, right) => right.completed_at.localeCompare(left.completed_at))
  }, [local, localReceipts, summaries])

  const unreviewedSummaries = useMemo(() => allSummaries.filter(summary =>
    !summary.reviewed_at && !localReceipts[summary.mock_id]), [allSummaries, localReceipts])
  const latestUnreviewed = unreviewedSummaries[0] || null

  const openSummary = useCallback((summary: UserMockDraftSummary) => {
    setReviewSeason(summary.season)
    void selectRemote(summary).then(() => setOpen(true))
  }, [selectRemote])

  useEffect(() => {
    if (!open || !selected || typeof localStorage === "undefined") return
    const reviewedAt = localReceipts[selected.mock_id] || new Date().toISOString()
    if (!localReceipts[selected.mock_id]) {
      markLocalMockReviewReviewed(
        localStorage,
        selected.season,
        selected.mock_id,
        reviewedAt,
      )
    }
    setSummaries(current => {
      if (!current.some(summary => summary.mock_id === selected.mock_id && !summary.reviewed_at)) {
        return current
      }
      return current.map(summary => summary.mock_id === selected.mock_id
        ? {...summary, reviewed_at: reviewedAt}
        : summary)
    })
    const cloudRecordExists = summaries.some(summary => summary.mock_id === selected.mock_id)
      || archiveSyncState === "synced"
    const cloudAlreadyReviewed = summaries.some(summary =>
      summary.mock_id === selected.mock_id && summary.reviewed_at)
    const receiptKey = `${selected.season}:${selected.mock_id}`
    if (!user || !cloudRecordExists || cloudAlreadyReviewed
      || markingReviewed.current.has(receiptKey)) return
    markingReviewed.current.add(receiptKey)
    void user.getIdToken()
      .then(token => markUserMockDraftReviewed(selected.mock_id, {
        token,
        season: selected.season,
      }))
      .then(receipt => {
        setSummaries(current => current.map(summary => summary.mock_id === receipt.mock_id
          ? {...summary, reviewed_at: receipt.reviewed_at}
          : summary))
      })
      .catch(() => markingReviewed.current.delete(receiptKey))
  }, [archiveSyncState, localReceipts, open, selected, summaries, user])

  useEffect(() => {
    if (!user) return
    const pending = summaries.filter(summary =>
      !summary.reviewed_at
      && localReceipts[summary.mock_id]
      && !markingReviewed.current.has(`${summary.season}:${summary.mock_id}`))
    if (!pending.length) return
    let active = true
    pending.forEach(summary => markingReviewed.current.add(`${summary.season}:${summary.mock_id}`))
    void user.getIdToken().then(async token => {
      for (const summary of pending) {
        const receiptKey = `${summary.season}:${summary.mock_id}`
        try {
          const receipt = await markUserMockDraftReviewed(summary.mock_id, {
            token,
            season: summary.season,
          })
          if (!active) return
          setSummaries(current => current.map(item => item.mock_id === receipt.mock_id
            ? {...item, reviewed_at: receipt.reviewed_at}
            : item))
        } catch {
          markingReviewed.current.delete(receiptKey)
        }
      }
    })
    return () => {
      active = false
    }
  }, [localReceipts, summaries, user])

  return (
    <>
      {showUnreviewedBanner && latestUnreviewed
        && dismissedBannerId !== latestUnreviewed.mock_id && (
        <aside
          aria-label="Unreviewed draft results"
          className="fixed bottom-24 left-1/2 flex -translate-x-1/2 items-center justify-between gap-4 rounded border border-blue-400 bg-gray-900 px-4 py-3 text-left text-white shadow-2xl"
          style={{
            backgroundColor: "#111827",
            maxWidth: 680,
            width: "calc(100vw - 32px)",
            zIndex: 1050,
          }}
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">
              Draft results ready{unreviewedSummaries.length > 1 ? ` · ${unreviewedSummaries.length} unreviewed` : ""}
            </p>
            <p className="truncate text-sm font-bold">{draftScorecardTitle(latestUnreviewed.title, latestUnreviewed.platform, latestUnreviewed.completed_at)}</p>
            <p className="text-xs text-gray-300">
              {latestUnreviewed.team_count} teams · slot {latestUnreviewed.user_draft_slot} · Review the scorecard and legal alternate paths.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              className="rounded border border-blue-300 bg-blue-600 px-3 py-2 text-sm font-semibold hover:bg-blue-500"
              onClick={() => openSummary(latestUnreviewed)}
              type="button"
            >
              Review
            </button>
            <button
              aria-label="Dismiss draft scorecard reminder for this session"
              className="rounded border border-gray-500 px-3 py-2 text-sm font-semibold hover:bg-gray-800"
              onClick={() => setDismissedBannerId(latestUnreviewed.mock_id)}
              type="button"
            >
              Later
            </button>
          </div>
        </aside>
      )}
      {showTrigger && (
        <button
          className="rounded border border-gray-500 px-3 py-2 text-sm font-semibold hover:bg-gray-800"
          onClick={() => setOpen(true)}
          type="button"
        >
          Draft scorecards{unreviewedSummaries.length
            ? ` (${unreviewedSummaries.length} new)`
            : allSummaries.length ? ` (${allSummaries.length})` : ""}
        </button>
      )}
      {open && (
        <div
          className={`${reviewStyles.reviewOverlay} fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 text-left`}
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
          style={{zIndex: 1100}}
        >
          <section
            aria-label={`Season ${reviewSeason} draft scorecards`}
            aria-modal="true"
            className={`${reviewStyles.reviewDialog} flex flex-col overflow-hidden rounded border border-gray-500 bg-gray-100 text-gray-900 shadow-2xl`}
            role="dialog"
          >
            <header className={`${reviewStyles.reviewHeader} flex items-center justify-between border-b border-gray-400 bg-gray-800 px-4 py-2 text-gray-50`}>
              <div>
                <p className="text-xs uppercase tracking-wider text-blue-300">Season {reviewSeason}</p>
                <h2 className="text-lg font-bold">Draft scorecards</h2>
              </div>
              <button
                className="rounded border border-gray-400 px-3 py-1 text-sm font-semibold"
                onClick={() => setOpen(false)}
                ref={closeRef}
                type="button"
              >
                Close
              </button>
            </header>
            <div className={reviewStyles.reviewLayout}>
              <aside className={`${reviewStyles.reviewHistory} border-r border-gray-300 bg-gray-200 p-2 text-gray-900`}>
                <div className="flex items-center justify-between gap-2 px-2 py-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Draft history
                  </p>
                  <label className="cursor-pointer rounded border border-gray-400 bg-white px-2 py-1 text-xs font-semibold">
                    Import
                    <input
                      accept="application/json,.json"
                      aria-label="Import completed draft"
                      className="sr-only"
                      onChange={event => void importCompletedMock(event)}
                      type="file"
                    />
                  </label>
                </div>
                {loading && <p className="px-2 py-2 text-sm">Loading…</p>}
                {error && <p className="px-2 py-2 text-sm text-red-700">{error}</p>}
                {importStatus && <p className="px-2 py-2 text-sm text-green-700" role="status">{importStatus}</p>}
                {archiveSyncCopy && (
                  <p
                    className={`px-2 py-2 text-sm ${archiveSyncState === "offline" || archiveSyncState === "error" ? "text-amber-700" : "text-gray-700"}`}
                    role="status"
                    title={archiveSyncError || undefined}
                  >
                    {archiveSyncCopy}
                  </p>
                )}
                {!loading && currentArchiveError && (
                  <p className="px-2 py-2 text-sm text-red-700" role="status">
                    Scorecard could not be created: {currentArchiveError}
                  </p>
                )}
                {!loading && !currentArchiveError && allSummaries.length === 0 && (
                  <p className="px-2 py-2 text-sm text-gray-600">Complete a draft to create the first scorecard.</p>
                )}
                <div className={reviewStyles.historyList}>
                  {allSummaries.map(summary => (
                    <button
                      aria-pressed={selected?.mock_id === summary.mock_id}
                      className={`w-full rounded border px-2 py-2 text-left text-sm ${selected?.mock_id === summary.mock_id ? "border-blue-600 bg-white" : "border-gray-300 bg-gray-100"}`}
                      key={summary.mock_id}
                      onClick={() => void selectRemote(summary)}
                      type="button"
                    >
                      <span className="flex items-center gap-2">
                        {!summary.reviewed_at && !localReceipts[summary.mock_id] && (
                          <span aria-label="Unreviewed" className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                        )}
                        <strong className={reviewStyles.historyTitle} title={summary.title}>
                          {draftScorecardTitle(summary.title, summary.platform, summary.completed_at)}
                        </strong>
                      </span>
                      <span className="block text-xs text-gray-600">
                        {summary.team_count} teams · slot {summary.user_draft_slot} · {new Date(summary.completed_at).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
              <main className={`${reviewStyles.reviewContent} bg-gray-100 p-3 text-gray-900`}>
                {review && selected ? (
                  <>
                    <div className={`${reviewStyles.reviewScoreHeader} flex flex-wrap items-end justify-between gap-3 border-b border-gray-300 pb-3`}>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-600">Actual scorecard</p>
                        <div className="flex items-baseline gap-3">
                          <p className="text-4xl font-bold tabular-nums">{review.actual.compositeScore}<span className="text-lg text-gray-500">/100</span></p>
                          {review.alternatives[0] && (
                            <p className="text-sm font-semibold text-blue-700">
                              Best PAR alternate · {signed(review.alternatives[0].objective.starterProjectedPointsAboveReplacement)} starter PAR
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-gray-600">{selected.ranking_source} ranks · {selected.adp_source} ADP</p>
                      </div>
                      <div className={`${reviewStyles.positionSelectors} flex gap-2`}>
                        {[firstPosition, secondPosition].map((value, index) => (
                          <label className="text-xs font-semibold" key={index}>
                            Pick {index + 1} position
                            <select
                              className="mt-1 block rounded border border-gray-400 bg-white px-2 py-1 text-sm"
                              onChange={event => (index === 0 ? setFirstPosition : setSecondPosition)(event.target.value as ReviewPosition | "")}
                              value={value}
                            >
                              <option value="">Auto</option>
                              {POSITIONS.map(position => <option key={position.value} value={position.value}>{position.label}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    </div>
                    <nav aria-label="Draft scorecard views" className={`${reviewStyles.reviewTabs} my-3 border-b border-gray-300 pb-2`}>
                      {([
                        ["overview", "Overview"],
                        ["position", "Position capital"],
                        ["picks", "Pick decisions"],
                        ["alternatives", "Alternate paths"],
                        ["method", "Method"],
                      ] as Array<[ReviewView, string]>).map(([value, label]) => (
                        <button
                          aria-pressed={reviewView === value}
                          className={`rounded border px-3 py-1.5 text-sm font-semibold ${reviewView === value ? "border-blue-600 bg-blue-600 text-white" : "border-gray-400 bg-white"}`}
                          key={value}
                          onClick={() => setReviewView(value)}
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </nav>

                    {reviewView === "overview" && (
                      <div className="space-y-3">
                        <div className={reviewStyles.categoryGrid}>
                          {review.actual.categories.map(category => (
                            <article className="rounded border border-gray-300 bg-white p-2 text-gray-900" key={category.key}>
                              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{category.label}</p>
                              <p className="text-2xl font-bold tabular-nums">{category.score ?? "—"}</p>
                              <p className="mt-1 text-xs font-medium">{category.explanation}</p>
                              {category.evidence.map(evidence => (
                                <p className="mt-1 text-xs text-gray-600" key={evidence}>{evidence}</p>
                              ))}
                            </article>
                          ))}
                        </div>
                        <div className={reviewStyles.overviewGrid}>
                          <section className="rounded border border-gray-300 bg-white p-3">
                            <h3 className="text-sm font-bold">Actual roster</h3>
                            <p className="mt-1 text-xs text-gray-600">
                              {review.actual.totals.starterCount}/{review.actual.totals.requiredStarterSlots} starters · {signed(review.actual.totals.starterProjectedPointsAboveReplacement)} starter PAR · {signed(review.actual.totals.benchProjectedPointsAboveReplacement)} bench PAR
                            </p>
                            <ol className={`${reviewStyles.rosterList} mt-2 text-sm`}>
                              {review.actual.selectedPlayerIds.map((id, index) => {
                                const fixture = selected.replay as unknown as RecordedCompletedDraftReplay
                                const tier = playerTier(fixture, id)
                                const position = fixture.players.find(player => player.id === id)?.position
                                const metric = review.actual.playerMetrics.find(player => player.playerId === id)
                                return <li key={id}>
                                  <span>{index + 1}. {playerName(fixture, id)}</span>
                                  <small>{metric?.lineupRole || position || "—"}{tier ? ` · Tier ${tier}` : " · Tier —"}{metric ? ` · ${signed(metric.projectedPointsAboveReplacement)} PAR` : ""}</small>
                                </li>
                              })}
                            </ol>
                          </section>
                          <section className="rounded border border-blue-400 bg-blue-50 p-3">
                            <h3 className="text-sm font-bold">Why the best PAR alternate won</h3>
                            {review.alternatives[0] ? (
                              <>
                                <div className="mt-1 flex items-baseline justify-between gap-3">
                                  <p className="text-2xl font-bold tabular-nums">{signed(review.alternatives[0].objective.starterProjectedPointsAboveReplacement)}<span className="ml-2 text-sm text-gray-600">starter PAR</span></p>
                                  <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${review.alternatives[0].replayFidelity.level === "high" ? "bg-green-100 text-green-800" : review.alternatives[0].replayFidelity.level === "moderate" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>
                                    {review.alternatives[0].replayFidelity.level} replay fidelity
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-700">{review.alternatives[0].replayFidelity.explanation}</p>
                                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                                  <div><span className="block text-gray-600">Starter PAR</span><strong>{signed(review.alternatives[0].objective.starterProjectedPointsAboveReplacement)}</strong></div>
                                  <div><span className="block text-gray-600">Bench PAR</span><strong>{signed(review.alternatives[0].objective.benchProjectedPointsAboveReplacement)}</strong></div>
                                  <div><span className="block text-gray-600">Total PAR</span><strong>{signed(review.alternatives[0].objective.totalProjectedPointsAboveReplacement)}</strong></div>
                                </div>
                                <div className={`${reviewStyles.deltaGrid} mt-2 text-xs`}>
                                  {review.alternatives[0].categoryDeltas.map(delta => (
                                    <div className="flex justify-between border-b border-blue-200 py-1" key={delta.key}>
                                      <span>{delta.label}</span>
                                      <strong>{delta.delta === null ? "—" : `${delta.delta > 0 ? "+" : ""}${delta.delta}`}</strong>
                                    </div>
                                  ))}
                                </div>
                                <p className="mt-2 text-xs text-gray-600">
                                  {review.alternatives[0].replayFidelity.changedUserPickCount} user picks changed · {review.alternatives[0].objective.earlySelectionCount} picks made before their latest safe turn · {review.alternatives[0].replayFidelity.collisionCount}/{review.alternatives[0].replayFidelity.opponentPickCount} opponent picks replaced ({review.alternatives[0].replayFidelity.collisionRate.toFixed(1)}%)
                                </p>
                              </>
                            ) : <p className="mt-2 text-sm">No legal complete alternate was found.</p>}
                          </section>
                        </div>
                      </div>
                    )}

                    {reviewView === "position" && (
                      <section className="rounded border border-gray-300 bg-white">
                        <div className="border-b border-gray-300 px-3 py-2">
                          <h3 className="text-sm font-bold">Raw position capital</h3>
                          <p className="text-xs text-gray-600">Projection sums are descriptive, not additional score components. PAR means projected median points above the captured positional replacement baseline.</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className={`${reviewStyles.wideTable} w-full border-collapse text-left text-xs`}>
                            <thead className="bg-gray-200">
                              <tr>
                                <th className="px-2 py-2">Pos</th>
                                <th className="px-2 py-2">Roster A / Alt</th>
                                <th className="px-2 py-2">Starter A / Alt</th>
                                <th className="px-2 py-2">Actual tiers</th>
                                <th className="px-2 py-2">Alternate tiers</th>
                                <th className="px-2 py-2 text-right">Starter median A / Alt</th>
                                <th className="px-2 py-2 text-right">Total PAR A / Alt</th>
                                <th className="px-2 py-2 text-right">Starter PAR A / Alt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {POSITIONS.map(({value}) => {
                                const actual = review.actual.positionMetrics[value]
                                const alternate = review.alternatives[0]?.scorecard.positionMetrics[value]
                                return (
                                  <tr className="border-t border-gray-200" key={value}>
                                    <th className="px-2 py-2 text-sm">{value}</th>
                                    <td className="px-2 py-2 tabular-nums">{actual.rosterCount} / {alternate?.rosterCount ?? "—"}</td>
                                    <td className="px-2 py-2 tabular-nums">{actual.starterCount} / {alternate?.starterCount ?? "—"}</td>
                                    <td className="px-2 py-2">{tierSummary(actual.tierCounts)}</td>
                                    <td className="px-2 py-2">{alternate ? tierSummary(alternate.tierCounts) : "—"}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{actual.starterProjectedMedian.toFixed(1)} / {alternate?.starterProjectedMedian.toFixed(1) ?? "—"}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{signed(actual.projectedPointsAboveReplacement)} / {alternate ? signed(alternate.projectedPointsAboveReplacement) : "—"}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{signed(actual.starterProjectedPointsAboveReplacement)} / {alternate ? signed(alternate.starterProjectedPointsAboveReplacement) : "—"}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot className="border-t-2 border-gray-400 bg-gray-100 font-bold">
                              <tr>
                                <th className="px-2 py-2">Total</th>
                                <td className="px-2 py-2">{review.actual.totals.rosterCount} / {review.alternatives[0]?.scorecard.totals.rosterCount ?? "—"}</td>
                                <td className="px-2 py-2">{review.actual.totals.starterCount} / {review.alternatives[0]?.scorecard.totals.starterCount ?? "—"}</td>
                                <td className="px-2 py-2" colSpan={2}>Floor / median / ceiling: {review.actual.totals.projectedFloor.toFixed(1)} / {review.actual.totals.projectedMedian.toFixed(1)} / {review.actual.totals.projectedCeiling.toFixed(1)}</td>
                                <td className="px-2 py-2 text-right">{review.actual.totals.starterProjectedMedian.toFixed(1)} / {review.alternatives[0]?.scorecard.totals.starterProjectedMedian.toFixed(1) ?? "—"}</td>
                                <td className="px-2 py-2 text-right">{signed(review.actual.totals.projectedPointsAboveReplacement)} / {review.alternatives[0] ? signed(review.alternatives[0].scorecard.totals.projectedPointsAboveReplacement) : "—"}</td>
                                <td className="px-2 py-2 text-right">{signed(review.actual.totals.starterProjectedPointsAboveReplacement)} / {review.alternatives[0] ? signed(review.alternatives[0].scorecard.totals.starterProjectedPointsAboveReplacement) : "—"}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        <div className="border-t border-gray-300 px-3 py-2">
                          <h4 className="text-sm font-bold">Per-player PAR</h4>
                          <p className="text-xs text-gray-600">Each player is measured against the captured replacement baseline for his position; starter and bench totals are the sums of these rows.</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className={`${reviewStyles.wideTable} w-full border-collapse text-left text-xs`}>
                            <thead className="bg-gray-200"><tr><th className="px-2 py-2">Roster</th><th className="px-2 py-2">Player</th><th className="px-2 py-2">Role</th><th className="px-2 py-2 text-right">Median</th><th className="px-2 py-2 text-right">Replacement</th><th className="px-2 py-2 text-right">PAR</th></tr></thead>
                            <tbody>
                              {[
                                ...review.actual.playerMetrics.map(metric => ({roster: "Actual", metric})),
                                ...(review.alternatives[0]?.scorecard.playerMetrics || []).map(metric => ({roster: "Alternate", metric})),
                              ].map(({roster, metric}) => (
                                <tr className="border-t border-gray-200" key={`${roster}:${metric.playerId}`}>
                                  <td className="px-2 py-2">{roster}</td><th className="px-2 py-2">{metric.name} <span className="font-normal text-gray-600">{metric.position}{metric.positionRank} · T{metric.tier}</span></th><td className="px-2 py-2">{metric.lineupRole}</td><td className="px-2 py-2 text-right">{metric.projectedMedian.toFixed(1)}</td><td className="px-2 py-2 text-right">{metric.replacementPoints.toFixed(1)}</td><td className="px-2 py-2 text-right font-semibold">{signed(metric.projectedPointsAboveReplacement)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}

                    {reviewView === "picks" && (
                      <section className="rounded border border-gray-300 bg-white">
                        <div className="border-b border-gray-300 px-3 py-2">
                          <h3 className="text-sm font-bold">Actual versus best-alternate decisions</h3>
                          <p className="text-xs text-gray-600">PAR, observed selection deadlines, and direct opponent-board consequences at every user pick.</p>
                        </div>
                        {review.alternatives[0] ? (
                          <div className="overflow-x-auto">
                            <table className={`${reviewStyles.wideTable} w-full border-collapse text-left text-xs`}>
                              <thead className="bg-gray-200"><tr><th className="px-2 py-2">Pick</th><th className="px-2 py-2">Actual</th><th className="px-2 py-2">Alternate</th><th className="px-2 py-2">Evidence</th><th className="px-2 py-2">Replay effect</th></tr></thead>
                              <tbody>
                                {review.alternatives[0].decisionLedger.map(entry => (
                                  <tr className={`border-t border-gray-200 ${entry.changed ? "bg-blue-50" : ""}`} key={entry.overallPick}>
                                    <th className="px-2 py-2">#{entry.overallPick}</th>
                                    <td className="px-2 py-2">{entry.actual ? <><strong>{entry.actual.name}</strong><br />{entry.actual.position}{entry.actual.positionRank} · T{entry.actual.tier} · ADP {entry.actual.adp.toFixed(1)}</> : "Unavailable"}</td>
                                    <td className="px-2 py-2"><strong>{entry.alternate.name}</strong><br />{entry.alternate.position}{entry.alternate.positionRank} · T{entry.alternate.tier} · ADP {entry.alternate.adp.toFixed(1)}</td>
                                    <td className="px-2 py-2">{entry.alternate.projectedMedian.toFixed(1)} median · {signed(entry.alternate.projectedPointsAboveReplacement)} PAR<br /><span className="text-gray-600">{entry.reason}</span><br /><span className="font-semibold">Latest safe: {entry.latestSafeOverallPick ? `#${entry.latestSafeOverallPick}` : "undrafted"}{entry.turnsEarly ? ` · ${entry.turnsEarly} turn${entry.turnsEarly === 1 ? "" : "s"} early` : " · on deadline"}</span></td>
                                    <td className="px-2 py-2">{entry.directOpponentCollisionAt ? `Direct collision at #${entry.directOpponentCollisionAt}` : entry.changed ? "No direct collision" : "Recorded pick retained"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : <p className="p-3 text-sm">No legal alternate decision ledger is available.</p>}
                      </section>
                    )}

                    {reviewView === "alternatives" && (
                      <div className="grid gap-3 lg:grid-cols-3">
                        {review.alternatives.map(alternative => (
                          <article className={`rounded border p-3 ${alternative.rank === 1 ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white"}`} key={alternative.rank}>
                            <div className="flex items-start justify-between gap-2">
                              <div><p className="text-xs font-semibold uppercase text-gray-600">PAR path {alternative.rank}</p><p className="text-2xl font-bold">{signed(alternative.objective.starterProjectedPointsAboveReplacement)}<span className="ml-1 text-sm text-gray-600">starter</span></p></div>
                              <span className="rounded bg-gray-200 px-2 py-1 text-xs font-bold uppercase">{alternative.replayFidelity.level} fidelity</span>
                            </div>
                            <p className="mt-1 text-xs text-gray-600">{alternative.replayFidelity.explanation}</p>
                            <p className="mt-1 text-xs font-semibold">Bench {signed(alternative.objective.benchProjectedPointsAboveReplacement)} · Total {signed(alternative.objective.totalProjectedPointsAboveReplacement)} · {alternative.objective.totalTurnsEarly} total turns early</p>
                            <ol className="mt-2 space-y-1 text-xs">
                              {alternative.picks.map(pick => <li key={pick.overallPick}>#{pick.overallPick} <strong>{playerName(selected.replay as unknown as RecordedCompletedDraftReplay, pick.playerId)}</strong>{pick.turnsEarly ? ` · ${pick.turnsEarly} early` : " · latest safe turn"}</li>)}
                            </ol>
                            <p className="mt-2 border-t border-gray-300 pt-2 text-xs">{alternative.replayFidelity.collisionCount} collisions · {alternative.replayFidelity.collisionRate.toFixed(1)}% of opponent picks</p>
                          </article>
                        ))}
                        {!review.alternatives.length && <p className="text-sm">No complete roster satisfies this path.</p>}
                      </div>
                    )}

                    {reviewView === "method" && (
                      <section className="rounded border border-gray-300 bg-white p-3">
                        <h3 className="text-sm font-bold">Deterministic replay method</h3>
                        <p className="mt-1 text-sm">Alternate paths use the captured league format, maximize starter projected points above replacement first, then total roster PAR, and use the recorded selection order as the availability deadline for each player. This is deterministic roster analysis, not a projection of wins.</p>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
                          {review.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}
                        </ul>
                      </section>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-600">Select a completed draft to review it.</p>
                )}
              </main>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
