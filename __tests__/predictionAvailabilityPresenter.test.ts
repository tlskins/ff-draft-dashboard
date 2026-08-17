import {
  predictionAvailabilityCompactCue,
  predictionAvailabilityWindowLabel,
} from "../behavior/presenters"

describe("prediction availability-window presentation", () => {
  it.each([
    [0, "In play on your current turn"],
    [1, "At risk before your next pick"],
    [2, "At risk before your following pick"],
    [4, "At risk before your 4th future pick"],
    [11, "At risk before your 11th future pick"],
  ])("presents window %s without implying exact draft-pick distance", (window, expected) => {
    expect(predictionAvailabilityWindowLabel(window)).toBe(expected)
  })

  it.each([-1, 1.5, Number.NaN])("omits invalid window %s", window => {
    expect(predictionAvailabilityWindowLabel(window)).toBeNull()
  })
})

describe("compact prediction availability cues", () => {
  it.each([
    [0, "RISK NOW"],
    [1, "RISK NEXT"],
    [2, "RISK NEXT+1"],
    [4, "RISK NEXT+3"],
  ])("presents window %s without draft-pick distance language", (window, expected) => {
    expect(predictionAvailabilityCompactCue(window)).toBe(expected)
  })

  it.each([-1, 1.5, Number.NaN])("omits invalid window %s", window => {
    expect(predictionAvailabilityCompactCue(window)).toBeNull()
  })
})
