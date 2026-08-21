export const PROFILE_MODULE_IDS = [
  "draft_context",
  "outlook",
  "production",
] as const

export type ProfileModuleId = typeof PROFILE_MODULE_IDS[number]

export interface ProfileModuleEvidence {
  hasDraftContext: boolean
  historySeasonCount: number
  hasOutlook: boolean
  hasPlayerNotes: boolean
  statusImpact: "none" | "review" | "material"
}

export interface ProfileModuleDecision {
  id: ProfileModuleId
  explanation: string
  score: number
}

export const PROFILE_MODULE_LABELS: Record<ProfileModuleId, string> = {
  draft_context: "Draft value",
  outlook: "Outlook",
  production: "Production",
}

const moduleScore = (
  id: ProfileModuleId,
  evidence: ProfileModuleEvidence,
): number => {
  if (id === "outlook") {
    if (evidence.statusImpact === "material") return 100
    if (evidence.statusImpact === "review") return 82
    if (evidence.hasOutlook) return 58
    if (evidence.hasPlayerNotes) return 48
    return 0
  }
  if (id === "production") {
    if (evidence.historySeasonCount >= 3) return 76
    if (evidence.historySeasonCount === 2) return 70
    if (evidence.historySeasonCount === 1) return 44
    return 0
  }
  return evidence.hasDraftContext ? 62 : 24
}

const explanation = (
  id: ProfileModuleId,
  evidence: ProfileModuleEvidence,
): string => {
  if (id === "outlook") {
    if (evidence.statusImpact === "material") {
      return "Material availability evidence needs review before draft value."
    }
    if (evidence.statusImpact === "review") {
      return "A current status item may affect this draft decision."
    }
    return "Current outlook evidence is the strongest available player context."
  }
  if (id === "production") {
    return `${evidence.historySeasonCount} seasons make the production trend the strongest evidence.`
  }
  if (evidence.historySeasonCount === 0) {
    return "Draft context leads because no NFL production history is available."
  }
  return "Rank, tier, ADP, and replacement context are the strongest available evidence."
}

export const selectProfileModule = (
  evidence: ProfileModuleEvidence,
): ProfileModuleDecision => {
  const ranked = PROFILE_MODULE_IDS.map(id => ({
    id,
    score: moduleScore(id, evidence),
  })).sort((left, right) => (
    right.score - left.score
    || PROFILE_MODULE_IDS.indexOf(left.id) - PROFILE_MODULE_IDS.indexOf(right.id)
  ))
  const selected = ranked[0]
  return {
    ...selected,
    explanation: explanation(selected.id, evidence),
  }
}
