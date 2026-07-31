import { resolve } from "node:path"

import {
  resolveCampaignFixturePath,
} from "../scripts/calibrationCampaignRunner"

describe("calibration campaign runner", () => {
  it("loads evidence only from a relative path inside the repository", () => {
    const root = "/tmp/drafty-repository"
    expect(resolveCampaignFixturePath(root, "__tests__/fixtures/mock.json"))
      .toBe(resolve(root, "__tests__/fixtures/mock.json"))
    expect(() => resolveCampaignFixturePath(root, "../secret.json"))
      .toThrow("escapes the repository")
    expect(() => resolveCampaignFixturePath(root, "/tmp/secret.json"))
      .toThrow("must be relative")
  })
})
