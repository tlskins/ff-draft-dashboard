import {render} from "@testing-library/react"

import {
  DRAFTY_HELP_CATALOG,
  DRAFTY_HELP_TOPICS,
  getDraftyHelp,
  parseDraftyHelpInput,
} from "../behavior/help/draftyHelp"
import ExtensionSupport from "../pages/extension-support"


describe("Drafty shared help catalog", () => {
  it("parses a strict bounded topic request", () => {
    expect(parseDraftyHelpInput({})).toEqual({
      topic: "getting_started",
      platform: undefined,
    })
    expect(parseDraftyHelpInput({
      topic: "extension_setup",
      platform: "desktop",
    })).toEqual({topic: "extension_setup", platform: "desktop"})
    expect(() => parseDraftyHelpInput({topic: "everything"})).toThrow(
      "topic is not a supported Drafty help topic",
    )
    expect(() => parseDraftyHelpInput({topic: "getting_started", extra: true})).toThrow(
      "Unknown input field: extra",
    )
  })

  it("returns one compact article with current extension metadata", () => {
    const result = getDraftyHelp({topic: "extension_setup", platform: "mobile"})
    expect(result).toMatchObject({
      schema_version: 1,
      topic: "extension_setup",
      platform: "mobile",
      extension: {
        name: "Drafty Draft Sync",
        version: "0.0.0.11",
      },
    })
    expect(result.extension.store_url).toMatch(/^https:\/\/chromewebstore\.google\.com\//)
    expect(result.platform_note).toMatch(/connect live drafts from desktop Chrome/i)
    expect(result.related_tools).toContain("drafty_get_workspace")
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(12000)
  })

  it("renders the same catalog as a navigable human support guide", () => {
    const {container} = render(<ExtensionSupport />)
    expect(container.textContent).toContain("Version 0.0.0.11 is approved")
    DRAFTY_HELP_TOPICS.forEach(topic => {
      expect(container.textContent).toContain(DRAFTY_HELP_CATALOG[topic].title)
      expect(container.querySelector(`#${topic}`)).not.toBeNull()
    })
    expect(container.querySelector('a[href="/extension-privacy"]')).not.toBeNull()
    expect(container.querySelector('a[href^="https://chromewebstore.google.com/"]')).not.toBeNull()
  })
})
