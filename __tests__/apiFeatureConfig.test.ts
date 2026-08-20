import { getDashboardApiFeatures } from "../behavior/api/featureConfig"

describe("public API feature boundaries", () => {
  it("keeps a non-loopback production API read-only by default", () => {
    expect(getDashboardApiFeatures({
      NODE_ENV: "production",
      NEXT_PUBLIC_API_HOST: "https://drafty-api.example.com/",
    })).toEqual({
      apiHost: "https://drafty-api.example.com",
      readApiEnabled: true,
      draftSessionPersistenceEnabled: false,
      advisorSnapshotPersistenceEnabled: false,
      rankingProfilePersistenceEnabled: false,
      realtimeAdvisorEnabled: false,
    })
  })

  it("retains loopback persistence defaults for local development", () => {
    expect(getDashboardApiFeatures({
      NODE_ENV: "development",
      NEXT_PUBLIC_API_HOST: "http://127.0.0.1:5000",
    })).toMatchObject({
      readApiEnabled: true,
      draftSessionPersistenceEnabled: true,
      advisorSnapshotPersistenceEnabled: true,
      rankingProfilePersistenceEnabled: true,
      realtimeAdvisorEnabled: false,
    })
  })

  it("requires explicit opt-ins for public writes and Realtime", () => {
    expect(getDashboardApiFeatures({
      NODE_ENV: "production",
      NEXT_PUBLIC_API_HOST: "https://drafty-api.example.com",
      NEXT_PUBLIC_DRAFT_SESSION_PERSISTENCE_ENABLED: "true",
      NEXT_PUBLIC_ADVISOR_SNAPSHOT_PERSISTENCE_ENABLED: "true",
      NEXT_PUBLIC_RANKING_PROFILE_PERSISTENCE_ENABLED: "true",
      NEXT_PUBLIC_REALTIME_ADVISOR_ENABLED: "true",
    })).toMatchObject({
      draftSessionPersistenceEnabled: true,
      advisorSnapshotPersistenceEnabled: true,
      rankingProfilePersistenceEnabled: true,
      realtimeAdvisorEnabled: true,
    })
  })

  it("honors explicit local opt-outs", () => {
    expect(getDashboardApiFeatures({
      NODE_ENV: "development",
      NEXT_PUBLIC_API_HOST: "http://localhost:5000",
      NEXT_PUBLIC_DRAFT_SESSION_PERSISTENCE_ENABLED: "false",
      NEXT_PUBLIC_ADVISOR_SNAPSHOT_PERSISTENCE_ENABLED: "false",
      NEXT_PUBLIC_RANKING_PROFILE_PERSISTENCE_ENABLED: "false",
    })).toMatchObject({
      draftSessionPersistenceEnabled: false,
      advisorSnapshotPersistenceEnabled: false,
      rankingProfilePersistenceEnabled: false,
    })
  })
})
