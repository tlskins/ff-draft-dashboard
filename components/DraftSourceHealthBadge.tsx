import type {
  DraftSourceHealth,
} from "../behavior/draft-feed/types"
import type { DraftSourceHealthFreshness } from "../behavior/boundaryState"


interface DraftSourceHealthBadgeProps {
  health: DraftSourceHealth | null
  freshness?: DraftSourceHealthFreshness
}

const messageForHealth = (health: DraftSourceHealth): string =>
  health.status === "unavailable"
    ? `${health.platform} capture unavailable — draft layout not recognized.`
    : `${health.platform} capture degraded — some picks may be missing.`

const DraftSourceHealthBadge = ({
  health,
  freshness = "unknown",
}: DraftSourceHealthBadgeProps) => {
  if (health && freshness === "stale") {
    return (
      <p
        aria-live="polite"
        className="bg-amber-200 font-semibold shadow rounded-md text-sm my-1 px-4"
        role="status"
      >
        ESPN selector health is stale — waiting for a fresh page check.
      </p>
    )
  }
  if (!health || health.status === "healthy") return null

  return (
    <p
      aria-live="polite"
      className="bg-red-200 font-semibold shadow rounded-md text-sm my-1 px-4"
      role="status"
      title={health.issues.join(", ")}
    >
      {messageForHealth(health)} Refresh the ESPN tab if this persists.
    </p>
  )
}

export default DraftSourceHealthBadge
