import React, { ReactNode } from "react"

import styles from "../DraftDesk.module.css"

interface DeskPaneHeaderProps {
  kicker: string
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}

const DeskPaneHeader = ({
  kicker,
  title,
  meta,
  actions,
  className = "",
}: DeskPaneHeaderProps) => (
  <header className={`${styles.paneHeader} ${className}`}>
    <div className={styles.paneHeading}>
      <span className={styles.paneKicker}>{kicker}</span>
      <h2>{title}{meta && <small>{meta}</small>}</h2>
    </div>
    {actions && <div className={styles.paneHeaderActions}>{actions}</div>}
  </header>
)

export default DeskPaneHeader
