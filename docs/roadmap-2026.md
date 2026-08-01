# Post-Phase-7 execution roadmap

The [product specification](ff-draft-harness-product-spec.md) remains the
product and architecture truth. This document is the execution and status
truth: it records what is implemented,
what still needs operational verification, and the bounded work planned after
Phase 7. It is intentionally concise and does not replace the specification.

## Phase 0-7 status

| Phase | Status | Remaining check or boundary |
| --- | --- | --- |
| 0. Contracts and replay foundation | Complete | No pending foundation implementation. |
| 1. Historical data foundation | Complete | No pending implementation. |
| 2. Rankings and tiers | Implementation and tests complete | Manual usability review remains. |
| 3. Manual analysis workspace | Implementation and tests complete | Manual visual review remains. |
| 4. Deterministic live advisor | Complete | The campaign has 5/5 qualifying recorded mocks and 5/4 distinct target slots, with no coverage gaps. |
| 5. Realtime text and voice | Implementation complete | Credential-backed browser/device Realtime smoke remains. |
| 6. Status enrichment | Complete | No pending implementation. |
| 7. Hardening | Complete | Manual screen-reader and narrow-viewport review remains. |

“Complete” means the implementation and its recorded or automated gates are
complete as stated in the source documents. Manual or credential-backed checks
are called out separately and are not silently treated as passed.
Those remaining checks are operationally unverified; Phases 8-13 below are
future work.

The live opponent model remains frozen v1. Offline challengers and the bounded
residual run-only shadow capture are observation-only. Only two existing
fixtures carry labeled opponent forecast evidence, and the new challenger has
no prospective accuracy evidence yet. Offline tuning and in-sample artifact
parity are not prospective evidence and do not establish promotion readiness.
Exact-player prediction is not a promotion gate; position/run calibration is.

## Phases 8-13

### Phase 8: Program reset and stable integration baseline

Dependency: the completed Phase 0-7 implementation and the current
refactor/realtime-foundation source state.

Reset the program around this roadmap, retire the completed foundation slice as
current work, and establish a stable integration baseline. Phase 8B owns the
integration, merge, and tag of that baseline; Phase 8A is documentation-only
and does not merge or push.

Phase 8A documentation reset is complete at
`993af66426a44c32407c2566cbe8ba85a36b75b6`, whose expected parent is
`a447eadd041a23f8a7c6461899430560a81df4e9`.

The Phase 8B integration-baseline candidate is verified on
`codex/phase-8b-integration-baseline`. Root-orchestrator review, fast-forward
integration into `refactor/realtime-foundation`, and annotated-tag approval
remain pending; Phase 8 is not yet complete.

Exit gate: the integration baseline is agreed, reproducible, and tagged or
otherwise recorded; the roadmap and session-packet workflow are the active
planning references; and no application behavior is changed by the reset.

### Phase 9: Prospective positional-run shadow validation

Dependency: the stable Phase 8 baseline, the frozen v1 forecast, and the
bounded run-only shadow boundary.

Build the evaluator and a low-token capture workflow, collect varied newly
completed mocks, and assemble a promotion dossier. Pair frozen v1 and shadow
forecasts at the same valid pre-pick boundaries, score position and run
calibration only on newly labeled horizons, and report coverage and
fail-closed reasons. The dossier is evidence for a later decision, not a
promotion action in Phase 9.

Exit gate: the predeclared prospective position/run gates pass on eligible new
evidence, the varied-format coverage and paired-boundary integrity are
documented, and no invalid or retrospective labels are counted. If evidence
is unavailable or fails, the result is explicitly evidence-blocked; v1 remains
live.

### Phase 10: Decision-workspace UX refinement

Dependency: the Phase 8 integration baseline and the existing Phase 2/3
implementation. Outstanding manual usability and visual reviews may inform
this work.

Refine the decision workspace across the tier landscape, realtime positional
bests, cross-position comparison, intra-position comparison, and
automatic/pinned navigation. Preserve deterministic calculation ownership,
user-tier authority, and the distinction between automatic navigation and a
user pin.

Exit gate: the four views and their transitions have a coherent acceptance
review, pinned and automatic navigation behave as specified, and manual
usability/visual checks are recorded. UX work does not change calculation or
model behavior.

### Phase 11: Realtime copilot quality

Dependency: the Phase 8 baseline, the Phase 5 implementation, and access to a
credentialed browser/device test session.

Run credentialed browser/device smoke and model-versioned transcript/tool
evaluations. Evaluate evidence and preference faithfulness, confirmation
safety, interruption behavior, and timing. Keep the deterministic boundary,
fallback, and existing credential-free contract gates in force.

Exit gate: credentialed smoke, transcript/tool evaluation, evidence and
preference faithfulness, confirmation safety, and interruption/timing review
all have recorded outcomes with no unresolved release-critical failure.

### Phase 12: Prediction-v2 promotion decision

Dependency: the Phase 9 prospective dossier and the stable integration
baseline. Phase 11 quality results remain a separate copilot-quality input,
not a substitute for prospective prediction evidence.

Promote prediction v2 only if the Phase 9 prospective position/run gates pass.
If they do not, perform a bounded diagnostic redesign, document the failed
gate and next evidence needed, and do not promote. In either path, preserve
frozen v1 as an explicit rollback target and keep the promotion decision
reversible.

Exit gate: the orchestrator records either a gate-backed v2 promotion with a
tested v1 rollback or a no-promotion diagnostic decision. Exact-player
prediction is not used as a promotion gate; position/run calibration is.

### Phase 13: Draft-season release readiness

Dependency: Phases 8-12 have resolved their integration and promotion
decisions, with either frozen v1 or an approved v2 selected for release.

Complete the data refresh, selector smoke, startup/recovery/migration checks,
full mock acceptance, and manual accessibility/device audit. Reconfirm
fallback and rollback paths against the release baseline.

Exit gate: all release checks pass, operational limitations are documented,
the selected model and rollback path are recorded, and no unresolved
release-critical blocker remains.

## Ordering and session policy

Prospective Phase 9 evidence collection may run opportunistically in parallel
with Phase 10 UX work once the Phase 8 baseline exists. Parallel capture does
not authorize promotion, model changes, or cross-session scope expansion.

The main planning thread is the orchestrator: it owns architecture,
prioritization, integration review, and promotion decisions. Separate Codex
sessions own bounded implementation. Prefer lower-cost models for
documentation, tests, and routine bounded work; reserve higher-effort or
frontier review for algorithms, migrations, cross-repo contracts, and
milestone gates.

Each session makes one implementation commit and runs focused tests or
acceptance commands. Full cross-repo gates run at milestone integration.
Browser sessions are separate, script-first, and minimize tabs and screenshots.
K3 repository-bounded review is optional at major milestone gates, not every
slice. Use [the session-packet template](session-packets/TEMPLATE.md) for the
handoff contract; keep one repository and one objective per session unless an
explicit cross-repo task requires otherwise.
