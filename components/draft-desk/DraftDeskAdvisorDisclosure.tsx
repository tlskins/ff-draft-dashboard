import React, {useCallback, useEffect, useRef, useState} from "react"

import LiveAdvisorPanel, {type LiveAdvisorPanelProps} from "../LiveAdvisorPanel"
import styles from "../DraftDesk.module.css"

type DraftDeskAdvisorDisclosureProps = LiveAdvisorPanelProps

/** Desktop-secondary access to existing non-voice advisor operations. */
const DraftDeskAdvisorDisclosure = (props: DraftDeskAdvisorDisclosureProps) => {
  const disclosureRef = useRef<HTMLDetailsElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [drawerBounds, setDrawerBounds] = useState<React.CSSProperties>({})

  const updateDrawerBounds = useCallback(() => {
    const disclosure = disclosureRef.current
    const drawer = drawerRef.current
    const pane = disclosure?.closest<HTMLElement>(`.${styles.pane}`)
    if (!drawer || !pane) return
    const paneRect = pane.getBoundingClientRect()
    const drawerRect = drawer.getBoundingClientRect()
    setDrawerBounds({
      maxHeight: `${Math.max(1, Math.floor(paneRect.bottom - drawerRect.top))}px`,
      width: `${Math.max(1, Math.min(
        410,
        Math.floor(drawerRect.right - paneRect.left),
      ))}px`,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(updateDrawerBounds)
    const pane = disclosureRef.current?.closest<HTMLElement>(`.${styles.pane}`)
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateDrawerBounds)
    if (pane) observer?.observe(pane)
    window.addEventListener("resize", updateDrawerBounds)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener("resize", updateDrawerBounds)
    }
  }, [open, updateDrawerBounds])

  return (
    <details
      className={styles.advisorDisclosure}
      data-testid="draft-desk-advisor-disclosure"
      onToggle={event => setOpen(event.currentTarget.open)}
      ref={disclosureRef}
    >
      <summary aria-label="Advisor tools">Advisor</summary>
      <div
        className={styles.advisorDrawer}
        data-testid="draft-desk-advisor-drawer"
        ref={drawerRef}
        style={drawerBounds}
      >
        <LiveAdvisorPanel {...props} compact secondaryControlsOnly />
      </div>
    </details>
  )
}

export default DraftDeskAdvisorDisclosure
