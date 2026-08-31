import {useCallback, useEffect, useMemo, useRef, useState} from "react"
import type {User} from "firebase/auth"

import {
  getUserMockDraft,
  listUserMockDrafts,
  type UserMockDraftSummary,
} from "../behavior/api/userMockDrafts"
import {
  readLocalCompletedMocks,
  type LocalMockDraftArchive,
} from "../behavior/mockDraft/archive"
import {
  reviewCompletedMock,
  type ReviewPosition,
} from "../behavior/mockDraft/review"
import type {RecordedCompletedDraftReplay} from "../behavior/draft-advisor/completedDraftReplay"
import {FantasyPosition} from "../types"


const POSITIONS: Array<{value: ReviewPosition; label: string}> = [
  {value: FantasyPosition.QUARTERBACK, label: "QB"},
  {value: FantasyPosition.RUNNING_BACK, label: "RB"},
  {value: FantasyPosition.WIDE_RECEIVER, label: "WR"},
  {value: FantasyPosition.TIGHT_END, label: "TE"},
]

const playerName = (fixture: RecordedCompletedDraftReplay, id: string): string =>
  fixture.players.find(player => player.id === id)?.name || id

export const MockDraftReviewPanel = ({
  season,
  user,
  currentArchive,
  currentArchiveError,
  requestedArchive,
}: {
  season: number
  user: User | null
  currentArchive?: LocalMockDraftArchive | null
  currentArchiveError?: string | null
  requestedArchive?: LocalMockDraftArchive | null
}) => {
  const [open, setOpen] = useState(false)
  const [summaries, setSummaries] = useState<UserMockDraftSummary[]>([])
  const [selected, setSelected] = useState<LocalMockDraftArchive | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [firstPosition, setFirstPosition] = useState<ReviewPosition | "">("")
  const [secondPosition, setSecondPosition] = useState<ReviewPosition | "">("")
  const [reviewSeason, setReviewSeason] = useState(season)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!requestedArchive) return
    setReviewSeason(requestedArchive.season)
    setSelected(requestedArchive)
    setOpen(true)
  }, [requestedArchive])

  const local = useMemo(() => {
    const current = currentArchive?.season === reviewSeason ? currentArchive : null
    if (typeof localStorage === "undefined") return current ? [current] : []
    const stored = readLocalCompletedMocks(localStorage, reviewSeason)
    return current && !stored.some(item => item.mock_id === current.mock_id)
      ? [current, ...stored]
      : stored
  }, [currentArchive, reviewSeason])

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    setSelected(current => current && current.season === reviewSeason
      ? current
      : local[0] || null)
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
        if (active) setError(caught instanceof Error ? caught.message : "Mock history is unavailable")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [local, open, reviewSeason, user])

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
      const record = await getUserMockDraft(summary.mock_id, {token, season: reviewSeason})
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
      setError(caught instanceof Error ? caught.message : "Completed mock is unavailable")
    } finally {
      setLoading(false)
    }
  }, [local, reviewSeason, user])

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
        title: replay.source?.title || "Completed mock draft",
        team_count: replay.settings.numTeams,
        user_draft_slot: replay.targetRosterIndex + 1,
        pick_count: replay.actualPicks.length,
        ranking_source: item.ranking_source,
        adp_source: item.adp_source,
        content_fingerprint: "local",
      } satisfies UserMockDraftSummary
    })
    return [...localSummaries, ...summaries.filter(summary =>
      !localSummaries.some(localSummary => localSummary.mock_id === summary.mock_id))]
      .sort((left, right) => right.completed_at.localeCompare(left.completed_at))
  }, [local, summaries])

  return (
    <>
      <button
        className="rounded border border-slate-500 px-3 py-2 text-sm font-semibold hover:bg-slate-800"
        onClick={() => setOpen(true)}
        type="button"
      >
        Mock review{allSummaries.length ? ` (${allSummaries.length})` : ""}
      </button>
      {open && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-slate-950/75 p-5 text-left"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
          style={{zIndex: 1100}}
        >
          <section
            aria-label={`Season ${reviewSeason} mock draft review`}
            aria-modal="true"
            className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded border border-slate-500 bg-slate-100 text-slate-900 shadow-2xl"
            role="dialog"
          >
            <header className="flex items-center justify-between border-b border-slate-400 bg-slate-800 px-4 py-2 text-slate-50">
              <div>
                <p className="text-xs uppercase tracking-wider text-sky-300">Season {reviewSeason}</p>
                <h2 className="text-lg font-bold">Completed mock scorecards</h2>
              </div>
              <button
                className="rounded border border-slate-400 px-3 py-1 text-sm font-semibold"
                onClick={() => setOpen(false)}
                ref={closeRef}
                type="button"
              >
                Close
              </button>
            </header>
            <div className="grid min-h-0 flex-1 grid-cols-[250px_minmax(0,1fr)]">
              <aside className="overflow-y-auto border-r border-slate-300 bg-slate-200 p-2">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Mock history
                </p>
                {loading && <p className="px-2 py-2 text-sm">Loading…</p>}
                {error && <p className="px-2 py-2 text-sm text-red-700">{error}</p>}
                {!loading && currentArchiveError && (
                  <p className="px-2 py-2 text-sm text-red-700" role="status">
                    Scorecard could not be created: {currentArchiveError}
                  </p>
                )}
                {!loading && !currentArchiveError && allSummaries.length === 0 && (
                  <p className="px-2 py-2 text-sm text-slate-600">Complete a mock to create the first scorecard.</p>
                )}
                <div className="space-y-1">
                  {allSummaries.map(summary => (
                    <button
                      aria-pressed={selected?.mock_id === summary.mock_id}
                      className={`w-full rounded border px-2 py-2 text-left text-sm ${selected?.mock_id === summary.mock_id ? "border-sky-600 bg-white" : "border-slate-300 bg-slate-100"}`}
                      key={summary.mock_id}
                      onClick={() => void selectRemote(summary)}
                      type="button"
                    >
                      <strong className="block truncate">{summary.title}</strong>
                      <span className="block text-xs text-slate-600">
                        {summary.team_count} teams · slot {summary.user_draft_slot} · {new Date(summary.completed_at).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
              <main className="min-h-0 overflow-y-auto p-3">
                {review && selected ? (
                  <>
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-slate-300 pb-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-600">Actual roster</p>
                        <p className="text-4xl font-bold tabular-nums">{review.actual.compositeScore}<span className="text-lg text-slate-500">/100</span></p>
                        <p className="text-xs text-slate-600">{selected.ranking_source} ranks · {selected.adp_source} ADP</p>
                      </div>
                      <div className="flex gap-2">
                        {[firstPosition, secondPosition].map((value, index) => (
                          <label className="text-xs font-semibold" key={index}>
                            Pick {index + 1} position
                            <select
                              className="mt-1 block rounded border border-slate-400 bg-white px-2 py-1 text-sm"
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
                    <div className="grid grid-cols-5 gap-2">
                      {review.actual.categories.map(category => (
                        <article className="rounded border border-slate-300 bg-white p-2" key={category.key}>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{category.label}</p>
                          <p className="text-2xl font-bold tabular-nums">{category.score ?? "—"}</p>
                          <p className="mt-1 text-xs text-slate-600">{category.evidence[0]}</p>
                        </article>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <section className="rounded border border-slate-300 bg-white p-3">
                        <h3 className="text-sm font-bold">Actual roster</h3>
                        <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          {review.actual.selectedPlayerIds.map((id, index) => (
                            <li key={id}>{index + 1}. {playerName(selected.replay as unknown as RecordedCompletedDraftReplay, id)}</li>
                          ))}
                        </ol>
                      </section>
                      <section className="rounded border border-sky-400 bg-sky-50 p-3">
                        <h3 className="text-sm font-bold">Best alternate</h3>
                        {review.alternatives[0] ? (
                          <>
                            <p className="text-2xl font-bold tabular-nums">{review.alternatives[0].scorecard.compositeScore}<span className="ml-2 text-sm text-slate-600">{review.alternatives[0].compositeDelta >= 0 ? "+" : ""}{review.alternatives[0].compositeDelta} vs actual</span></p>
                            <ol className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              {review.alternatives[0].picks.map(pick => (
                                <li key={pick.overallPick}>#{pick.overallPick} {playerName(selected.replay as unknown as RecordedCompletedDraftReplay, pick.playerId)}</li>
                              ))}
                            </ol>
                            <p className="mt-2 text-xs text-slate-600">{review.alternatives[0].opponentReplacements.length} opponent collision replacements</p>
                          </>
                        ) : <p className="mt-2 text-sm">No complete roster satisfies this ADP path.</p>}
                      </section>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-600">Select a completed mock to review it.</p>
                )}
              </main>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
