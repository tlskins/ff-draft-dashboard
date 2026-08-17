import React from "react"

import styles from "../DraftDesk.module.css"

export interface DeskMetric {
  label: string
  value: React.ReactNode
  tone?: "default" | "urgent"
}

interface DeskMetricStripProps {
  items: DeskMetric[]
  ariaLabel: string
}

const DeskMetricStrip = ({items, ariaLabel}: DeskMetricStripProps) => (
  <dl aria-label={ariaLabel} className={styles.metricStrip}>
    {items.map(item => (
      <div key={item.label}>
        <dt>{item.label}</dt>
        <dd className={item.tone === "urgent" ? styles.metricUrgent : undefined}>
          {item.value}
        </dd>
      </div>
    ))}
  </dl>
)

export default DeskMetricStrip
