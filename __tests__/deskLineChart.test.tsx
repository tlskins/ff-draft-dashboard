import React from "react"
import {render, screen} from "@testing-library/react"

import {
  deskChartPoints,
  paddedZeroAwareDomain,
} from "../behavior/draftDeskCharts"
import DeskLineChart from "../components/draft-desk/DeskLineChart"

describe("Draft Desk line chart", () => {
  it("uses a zero-aware padded domain instead of observed min/max zoom", () => {
    const domain = paddedZeroAwareDomain([20.4, 21.2, 22])
    expect(domain.min).toBe(0)
    expect(domain.max).toBeGreaterThan(22)
    expect(domain.ticks[0]).toBe(0)
  })

  it("handles equal values and one point with a bounded domain", () => {
    expect(paddedZeroAwareDomain([12, 12, 12])).toMatchObject({min: 0})
    const domain = paddedZeroAwareDomain([8])
    const [point] = deskChartPoints([{label: "2025", value: 8}], domain)
    expect(point.x).toBe(171)
    expect(point.y).toBeGreaterThanOrEqual(10)
    expect(point.y).toBeLessThanOrEqual(92)
  })

  it("omits missing points while containing first and last endpoints", () => {
    const data = [
      {label: "2022", value: 10},
      {label: "2023", value: undefined},
      {label: "2024", value: 14},
    ]
    const points = deskChartPoints(data, paddedZeroAwareDomain(data.map(item => item.value)))
    expect(points).toHaveLength(2)
    expect(points[0].x).toBe(36)
    expect(points[1].x).toBe(306)
    points.forEach(point => {
      expect(point.y).toBeGreaterThanOrEqual(10)
      expect(point.y).toBeLessThanOrEqual(92)
    })
  })

  it("renders readable season, tick, unit, and point labels", () => {
    const {container} = render(
      <DeskLineChart
        ariaLabel="Player points per game by season"
        data={[{label: "2023", value: 18}, {label: "2024", value: 19.5}]}
        unitLabel="PPG"
      />,
    )
    expect(screen.getByRole("img", {name: "Player points per game by season"})).toBeTruthy()
    expect(screen.getByText("2023")).toBeTruthy()
    expect(screen.getByText("2024")).toBeTruthy()
    expect(screen.getByText("PPG")).toBeTruthy()
    expect(container.querySelectorAll("[data-chart-point]")).toHaveLength(2)
    expect(container.querySelectorAll(".chartTickLabel").length).toBeGreaterThan(2)
  })
})
