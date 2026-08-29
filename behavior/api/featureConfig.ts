/**
 * Public API capability boundaries.
 *
 * A configured API host is sufficient for read-only, published data. Browser
 * draft state remains authoritative unless a narrowly scoped mutation feature
 * is enabled. This lets the production dashboard use a stateless API without
 * exposing draft-session or profile write endpoints by default.
 */

export interface DashboardApiFeatureEnvironment {
  NODE_ENV?: string
  NEXT_PUBLIC_API_HOST?: string
  NEXT_PUBLIC_DRAFT_SESSION_PERSISTENCE_ENABLED?: string
  NEXT_PUBLIC_ADVISOR_SNAPSHOT_PERSISTENCE_ENABLED?: string
  NEXT_PUBLIC_RANKING_PROFILE_PERSISTENCE_ENABLED?: string
  NEXT_PUBLIC_CLOUD_PROFILE_SYNC_ENABLED?: string
  NEXT_PUBLIC_REALTIME_ADVISOR_ENABLED?: string
}

export interface DashboardApiFeatures {
  apiHost?: string
  readApiEnabled: boolean
  draftSessionPersistenceEnabled: boolean
  advisorSnapshotPersistenceEnabled: boolean
  rankingProfilePersistenceEnabled: boolean
  cloudProfileSyncEnabled: boolean
  realtimeAdvisorEnabled: boolean
}

const dashboardApiEnvironment = (): DashboardApiFeatureEnvironment => ({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_API_HOST: process.env.NEXT_PUBLIC_API_HOST,
  NEXT_PUBLIC_DRAFT_SESSION_PERSISTENCE_ENABLED:
    process.env.NEXT_PUBLIC_DRAFT_SESSION_PERSISTENCE_ENABLED,
  NEXT_PUBLIC_ADVISOR_SNAPSHOT_PERSISTENCE_ENABLED:
    process.env.NEXT_PUBLIC_ADVISOR_SNAPSHOT_PERSISTENCE_ENABLED,
  NEXT_PUBLIC_RANKING_PROFILE_PERSISTENCE_ENABLED:
    process.env.NEXT_PUBLIC_RANKING_PROFILE_PERSISTENCE_ENABLED,
  NEXT_PUBLIC_CLOUD_PROFILE_SYNC_ENABLED:
    process.env.NEXT_PUBLIC_CLOUD_PROFILE_SYNC_ENABLED,
  NEXT_PUBLIC_REALTIME_ADVISOR_ENABLED:
    process.env.NEXT_PUBLIC_REALTIME_ADVISOR_ENABLED,
})

const booleanValue = (value: string | undefined): boolean | undefined => {
  if (value === undefined || value.trim() === "") return undefined
  return value.trim().toLowerCase() === "true"
}

const isLoopbackApiHost = (apiHost: string | undefined): boolean => {
  if (!apiHost) return false
  try {
    const hostname = new URL(apiHost).hostname.toLowerCase()
    return hostname === "localhost"
      || hostname === "127.0.0.1"
      || hostname === "::1"
  } catch {
    return false
  }
}

const enabledWithLocalDefault = (
  explicitValue: string | undefined,
  localDevelopmentApi: boolean,
): boolean => booleanValue(explicitValue) ?? localDevelopmentApi

/**
 * Resolve API behavior at the boundary where a browser request could occur.
 * Tests can pass an environment directly; browser builds use only public
 * compile-time environment values.
 */
export const getDashboardApiFeatures = (
  environment: DashboardApiFeatureEnvironment = dashboardApiEnvironment(),
): DashboardApiFeatures => {
  const configuredApiHost = environment.NEXT_PUBLIC_API_HOST?.trim()
  const apiHost = configuredApiHost
    ? configuredApiHost.replace(/\/$/, "")
    : undefined
  const localDevelopmentApi = environment.NODE_ENV !== "production"
    && isLoopbackApiHost(apiHost)

  return {
    apiHost,
    readApiEnabled: Boolean(apiHost),
    // Preserve existing local-dev and test behavior for a loopback API, while
    // requiring an explicit opt-in for any non-loopback deployment.
    draftSessionPersistenceEnabled: enabledWithLocalDefault(
      environment.NEXT_PUBLIC_DRAFT_SESSION_PERSISTENCE_ENABLED,
      localDevelopmentApi,
    ),
    advisorSnapshotPersistenceEnabled: enabledWithLocalDefault(
      environment.NEXT_PUBLIC_ADVISOR_SNAPSHOT_PERSISTENCE_ENABLED,
      localDevelopmentApi,
    ),
    rankingProfilePersistenceEnabled: enabledWithLocalDefault(
      environment.NEXT_PUBLIC_RANKING_PROFILE_PERSISTENCE_ENABLED,
      localDevelopmentApi,
    ),
    // Authenticated cross-device profiles are a separate, narrow mutation
    // boundary and always require an explicit browser-build opt-in.
    cloudProfileSyncEnabled: booleanValue(
      environment.NEXT_PUBLIC_CLOUD_PROFILE_SYNC_ENABLED,
    ) === true,
    // Realtime always requires an explicit opt-in, including locally.
    realtimeAdvisorEnabled: booleanValue(
      environment.NEXT_PUBLIC_REALTIME_ADVISOR_ENABLED,
    ) === true,
  }
}
