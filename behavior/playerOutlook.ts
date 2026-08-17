import type {PlayerOutlook} from "../types"

export const PLAYER_OUTLOOK_MAX_LENGTH = 1_000
const PLAYER_OUTLOOK_INPUT_LIMIT = 20_000
const SOURCE_PATTERN = /^[a-z0-9][a-z0-9_:-]{0,39}$/

const decodeBasicEntities = (value: string): string => value.replace(
  /&(amp|lt|gt|quot|#39|nbsp);/gi,
  match => ({
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&nbsp;": " ",
  }[match.toLowerCase()] || " "),
)

export const normalizePlayerOutlookText = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const normalized = decodeBasicEntities(value.slice(0, PLAYER_OUTLOOK_INPUT_LIMIT))
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  if (!normalized) return null
  if (normalized.length <= PLAYER_OUTLOOK_MAX_LENGTH) return normalized
  const bounded = normalized.slice(0, PLAYER_OUTLOOK_MAX_LENGTH - 1).trimEnd()
  return `${bounded}…`
}

const normalizeSeason = (value: unknown): number | null => (
  typeof value === "number"
  && Number.isInteger(value)
  && value >= 2000
  && value <= 2100
    ? value
    : null
)

const normalizeObservedAt = (value: unknown): string | null => (
  typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value))
    ? value
    : null
)

const normalizeSource = (value: unknown): string | null => (
  typeof value === "string" && SOURCE_PATTERN.test(value)
    ? value
    : null
)

/**
 * Accepts the canonical object and the upstream ESPN parser's legacy text.
 * Fallback season/time are the enclosing ranking artifact's own provenance.
 */
export const normalizePlayerOutlook = (
  value: unknown,
  fallback: {season?: unknown; observedAt?: unknown; source?: unknown} = {},
): PlayerOutlook | null => {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  const text = normalizePlayerOutlookText(record ? record.text : value)
  if (!text) return null
  const source = normalizeSource(record?.source ?? fallback.source ?? "espn")
  if (!source) return null
  return {
    text,
    source,
    season: normalizeSeason(record?.season) ?? normalizeSeason(fallback.season),
    observedAt: normalizeObservedAt(record?.observedAt)
      ?? normalizeObservedAt(record?.observed_at)
      ?? normalizeObservedAt(fallback.observedAt),
  }
}

export type PlayerOutlookFreshness = "current" | "prior" | "unknown" | "mismatched"

export const playerOutlookFreshness = (
  outlook: PlayerOutlook,
  activeSeason: number | null | undefined,
): PlayerOutlookFreshness => {
  if (!outlook.season || !activeSeason) return "unknown"
  if (outlook.season === activeSeason) return "current"
  return outlook.season < activeSeason ? "prior" : "mismatched"
}

export const playerOutlookSourceLabel = (source: string): string => (
  source === "espn" ? "ESPN" : source.replaceAll("_", " ")
)
