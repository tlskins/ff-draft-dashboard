import React from "react"

import type {
  AdvisorProposal,
  DraftPlanDocument,
} from "../behavior/realtime/contracts"

interface DraftPlanPanelProps {
  plan: DraftPlanDocument
  proposals: AdvisorProposal[]
  onAcceptProposal: (proposalId: string) => void
  onRejectProposal: (proposalId: string) => void
}

const DraftPlanPanel: React.FC<DraftPlanPanelProps> = ({
  plan,
  proposals,
  onAcceptProposal,
  onRejectProposal,
}) => {
  const pending = proposals.filter(proposal =>
    proposal.status === "pending")
  const staleCount = proposals.filter(proposal =>
    proposal.status === "stale").length

  return (
    <section
      aria-label="Live draft plan"
      className="mt-3 rounded-lg border border-slate-200 bg-white p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-950">
          Live draft plan
        </h3>
        <span className="text-xs text-slate-500">
          Revision {plan.revision}
        </span>
      </div>

      {pending.length > 0 && (
        <div className="mt-2 space-y-2">
          {pending.map(proposal => (
            <article
              className="rounded border border-amber-200 bg-amber-50 p-2"
              key={proposal.id}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Confirmation required
              </p>
              <p className="sr-only" role="alert">
                Confirmation required: {proposal.title}
              </p>
              <p className="text-sm font-semibold text-slate-950">
                {proposal.title}
              </p>
              <p className="text-xs text-slate-700">
                {proposal.explanation}
              </p>
              {proposal.kind === "draft_plan" && (
                <p className="mt-1 text-sm text-slate-900">
                  “{proposal.payload.text}”
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded bg-emerald-700 px-2 py-1 text-xs font-semibold text-white"
                  onClick={() => onAcceptProposal(proposal.id)}
                >
                  Accept
                </button>
                <button
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                  onClick={() => onRejectProposal(proposal.id)}
                >
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {plan.entries.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          No confirmed plan statements yet.
        </p>
      ) : (
        <ol className="mt-2 space-y-1 text-sm text-slate-800">
          {plan.entries.map(entry => (
            <li key={entry.id}>
              <span className="mr-2 text-xs font-semibold text-slate-400">
                P{entry.source_event_count + 1}
              </span>
              {entry.text}
            </li>
          ))}
        </ol>
      )}

      {staleCount > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {staleCount} outdated proposal{staleCount === 1 ? "" : "s"}{" "}
          expired after the draft changed.
        </p>
      )}
    </section>
  )
}

export default DraftPlanPanel
