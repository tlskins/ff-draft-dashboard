import {
  DRAFTY_EXTENSION_STORE_URL,
  DRAFTY_EXTENSION_SUPPORT_PATH,
  DRAFTY_EXTENSION_VERSION,
} from "../behavior/extensionStore"

describe("published Drafty extension", () => {
  it("uses the approved version 11 Chrome Web Store listing", () => {
    expect(DRAFTY_EXTENSION_VERSION).toBe("0.0.0.11")
    expect(DRAFTY_EXTENSION_STORE_URL).toBe(
      "https://chromewebstore.google.com/detail/drafty-draft-sync/jminlnmnmhgnalnafammbefpllhlngni",
    )
    expect(DRAFTY_EXTENSION_SUPPORT_PATH).toBe("/extension-support")
  })
})
