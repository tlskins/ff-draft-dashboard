import {FormEvent, useEffect, useMemo, useRef, useState} from "react"

import type {
  DraftConnectionConfirmation,
  DraftRosterSettings,
  DraftSnapshot,
} from "../behavior/draft-feed/types"
import type {FantasySettings, ScoringFormat} from "../types"


interface DraftConnectionConfirmationDialogProps {
  currentDraftSlot: number
  currentSettings: FantasySettings
  draft: DraftSnapshot
  onConfirm: (confirmation: DraftConnectionConfirmation) => void
  onIgnore: () => void
}

type RosterField = Exclude<keyof DraftRosterSettings,
  "source" | "unsupportedLineupSlots">

const rosterFields: Array<{key: RosterField, label: string}> = [
  {key: "numStartingQbs", label: "QB"},
  {key: "numStartingRbs", label: "RB"},
  {key: "numStartingWrs", label: "WR"},
  {key: "numStartingTes", label: "TE"},
  {key: "numFlex", label: "Flex"},
  {key: "numBenchPlayers", label: "Bench"},
]

const scoringFromDraft = (
  draft: DraftSnapshot,
  settings: FantasySettings,
): ScoringFormat => {
  if (draft.scoringFormat === "PPR") return "ppr"
  if (draft.scoringFormat === "HALF_PPR") return "half_ppr"
  if (draft.scoringFormat === "STANDARD") return "standard"
  return settings.scoringFormat || (settings.ppr ? "ppr" : "standard")
}

const scoringForFeed = (
  scoringFormat: ScoringFormat,
): DraftConnectionConfirmation["scoringFormat"] => {
  if (scoringFormat === "ppr") return "PPR"
  if (scoringFormat === "half_ppr") return "HALF_PPR"
  return "STANDARD"
}

const initialRosterSettings = (
  draft: DraftSnapshot,
  settings: FantasySettings,
): DraftRosterSettings => ({
  numStartingQbs: draft.rosterSettings?.numStartingQbs
    ?? settings.numStartingQbs,
  numStartingRbs: draft.rosterSettings?.numStartingRbs
    ?? settings.numStartingRbs,
  numStartingWrs: draft.rosterSettings?.numStartingWrs
    ?? settings.numStartingWrs,
  numStartingTes: draft.rosterSettings?.numStartingTes
    ?? settings.numStartingTes,
  numFlex: draft.rosterSettings?.numFlex ?? settings.numFlex,
  numBenchPlayers: draft.rosterSettings?.numBenchPlayers
    ?? settings.numBenchPlayers,
  unsupportedLineupSlots: draft.rosterSettings?.unsupportedLineupSlots || [],
  source: "user_confirmed",
})

export const DraftConnectionConfirmationDialog = ({
  currentDraftSlot,
  currentSettings,
  draft,
  onConfirm,
  onIgnore,
}: DraftConnectionConfirmationDialogProps) => {
  const detectedTeamCount = draft.numTeams
    || draft.completion?.numTeams
    || currentSettings.numTeams
  const [teamCount, setTeamCount] = useState(detectedTeamCount)
  const [draftSlot, setDraftSlot] = useState(
    Math.min(Math.max(1, currentDraftSlot), detectedTeamCount),
  )
  const [scoringFormat, setScoringFormat] = useState<ScoringFormat>(
    scoringFromDraft(draft, currentSettings),
  )
  const [rosterSettings, setRosterSettings] = useState(
    initialRosterSettings(draft, currentSettings),
  )
  const firstControl = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    const nextTeamCount = draft.numTeams
      || draft.completion?.numTeams
      || currentSettings.numTeams
    setTeamCount(nextTeamCount)
    setDraftSlot(Math.min(Math.max(1, currentDraftSlot), nextTeamCount))
    setScoringFormat(scoringFromDraft(draft, currentSettings))
    setRosterSettings(initialRosterSettings(draft, currentSettings))
    firstControl.current?.focus()
  }, [currentDraftSlot, currentSettings, draft])

  const teamCountOptions = useMemo(() => {
    const values = new Set([8, 10, 12, 14, 16, teamCount])
    return Array.from(values).filter(value => value >= 2 && value <= 20)
      .sort((left, right) => left - right)
  }, [teamCount])

  const updateTeamCount = (value: number) => {
    setTeamCount(value)
    setDraftSlot(current => Math.min(current, value))
  }

  const updateRosterField = (field: RosterField, value: number) => {
    setRosterSettings(current => ({
      ...current,
      [field]: Math.min(30, Math.max(0, value)),
    }))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onConfirm({
      numTeams: teamCount,
      targetRosterIndex: draftSlot - 1,
      scoringFormat: scoringForFeed(scoringFormat),
      rosterSettings: {...rosterSettings, source: "user_confirmed"},
    })
  }

  return (
    <div className="fixed inset-0 z-[1900] flex items-center justify-center bg-slate-950/70 p-3">
      <section
        aria-labelledby="draft-connection-title"
        aria-modal="true"
        className="max-h-[calc(100vh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-md border-2 border-blue-500 bg-slate-50 text-left text-slate-900 shadow-2xl"
        role="dialog"
      >
        <header className="border-b border-slate-300 bg-slate-900 px-4 py-3 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-blue-300">Live draft found</p>
          <h2 className="text-xl font-bold" id="draft-connection-title">Confirm your draft setup</h2>
          <p className="mt-1 truncate text-sm text-slate-300" title={draft.title}>{draft.title}</p>
        </header>

        <form className="grid gap-4 p-4" onSubmit={submit}>
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
            ESPN&apos;s team ID is not your randomized draft position. Select the
            position shown in the draft room before Drafty applies any picks.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm font-bold">
              League size
              <select
                className="rounded border border-slate-400 bg-white px-2 py-2 text-base"
                onChange={event => updateTeamCount(Number(event.target.value))}
                ref={firstControl}
                value={teamCount}
              >
                {teamCountOptions.map(value => <option key={value} value={value}>{value} teams</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Your draft position
              <select
                className="rounded border-2 border-blue-500 bg-white px-2 py-2 text-base"
                onChange={event => setDraftSlot(Number(event.target.value))}
                value={draftSlot}
              >
                {Array.from({length: teamCount}, (_, index) => (
                  <option key={index + 1} value={index + 1}>Pick {index + 1}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">
              Scoring
              <select
                className="rounded border border-slate-400 bg-white px-2 py-2 text-base"
                onChange={event => setScoringFormat(event.target.value as ScoringFormat)}
                value={scoringFormat}
              >
                <option value="standard">Standard</option>
                <option value="half_ppr">Half-PPR</option>
                <option value="ppr">PPR</option>
              </select>
            </label>
          </div>

          <fieldset className="rounded border border-slate-300 bg-white p-3">
            <legend className="px-1 text-sm font-bold">Starting lineup and bench</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {rosterFields.map(field => (
                <label className="grid gap-1 text-xs font-bold" key={field.key}>
                  {field.label}
                  <input
                    className="min-w-0 rounded border border-slate-400 px-2 py-1.5 text-base"
                    max={30}
                    min={0}
                    onChange={event => updateRosterField(
                      field.key,
                      Number(event.target.value),
                    )}
                    type="number"
                    value={rosterSettings[field.key]}
                  />
                </label>
              ))}
            </div>
          </fieldset>

          {rosterSettings.unsupportedLineupSlots.length > 0 && (
            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
              ESPN also reported unsupported lineup slots: {rosterSettings.unsupportedLineupSlots.join(", ")}.
              Drafty will preserve the board but will not model those slots.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-300 pt-3">
            <button
              className="rounded border border-slate-400 bg-white px-4 py-2 text-sm font-bold hover:bg-slate-100"
              onClick={onIgnore}
              type="button"
            >
              Ignore this draft
            </button>
            <button
              className="rounded bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
              type="submit"
            >
              Confirm and connect
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

