import {render} from "@testing-library/react"
import type {ReactNode} from "react"

import PageHead from "../components/pageHead"
import {normalizeWebMcpOriginTrialToken} from "../behavior/webmcp/originTrial"

jest.mock("next/head", () => ({
  __esModule: true,
  default: ({children}: {children: ReactNode}) => <>{children}</>,
}))

describe("Phase 17C WebMCP origin-trial boundary", () => {
  const original = process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN
    else process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN = original
  })

  it("omits missing, malformed, and suspicious token values", () => {
    expect(normalizeWebMcpOriginTrialToken(undefined)).toBeNull()
    expect(normalizeWebMcpOriginTrialToken("too-short")).toBeNull()
    expect(normalizeWebMcpOriginTrialToken(`${"a".repeat(90)}\" onload=\"bad`)).toBeNull()

    process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN = "too-short"
    const {container} = render(<PageHead />)
    expect(container.querySelector('meta[http-equiv="origin-trial"]')).toBeNull()
  })

  it("renders one validated first-party token before WebMCP registration", () => {
    const token = `${"A".repeat(120)}==`
    process.env.NEXT_PUBLIC_WEBMCP_ORIGIN_TRIAL_TOKEN = `  ${token}  `
    const {container} = render(<PageHead />)
    const meta = container.querySelector('meta[http-equiv="origin-trial"]')
    expect(meta?.getAttribute("content")).toBe(token)
    expect(container.querySelectorAll('meta[http-equiv="origin-trial"]')).toHaveLength(1)
  })
})
