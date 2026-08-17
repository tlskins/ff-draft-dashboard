export interface DeskChartDatum {
  label: string
  value?: number
}

export interface DeskChartDomain {
  min: number
  max: number
  ticks: number[]
}

export interface DeskChartPoint {
  label: string
  value: number
  x: number
  y: number
  sourceIndex: number
}

const niceStep = (roughStep: number): number => {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(roughStep, .1)))
  const normalized = roughStep / magnitude
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return factor * magnitude
}

/**
 * Fantasy PPG is intentionally zero-aware. A 15% headroom pad and a nice
 * upper tick provide context without allowing a small observed change to fill
 * the entire plot.
 */
export const paddedZeroAwareDomain = (
  values: Array<number | undefined>,
  desiredTickCount = 4,
): DeskChartDomain => {
  const finite = values.filter(
    (value): value is number => typeof value === "number"
      && Number.isFinite(value)
      && value >= 0,
  )
  const observedMax = finite.length ? Math.max(...finite) : 0
  const paddedMax = Math.max(5, observedMax * 1.15)
  const step = niceStep(paddedMax / Math.max(2, desiredTickCount))
  const max = Math.ceil(paddedMax / step) * step
  const ticks = Array.from(
    {length: Math.round(max / step) + 1},
    (_, index) => index * step,
  )
  return {min: 0, max, ticks}
}

export const deskChartPoints = (
  data: DeskChartDatum[],
  domain: DeskChartDomain,
  bounds = {left: 36, right: 306, top: 10, bottom: 92},
): DeskChartPoint[] => data.flatMap((datum, sourceIndex) => {
  if (!Number.isFinite(datum.value)) return []
  const x = data.length <= 1
    ? (bounds.left + bounds.right) / 2
    : bounds.left + sourceIndex * ((bounds.right - bounds.left) / (data.length - 1))
  const ratio = (datum.value! - domain.min) / Math.max(1, domain.max - domain.min)
  const y = bounds.bottom - ratio * (bounds.bottom - bounds.top)
  return [{...datum, value: datum.value!, x, y, sourceIndex}]
})
