import React from "react"

interface TargetMarkerProps {
  className?: string
}

/** Decorative target identity; the surrounding surface owns the accessible copy. */
const TargetMarker = ({className = ""}: TargetMarkerProps) => (
  <span aria-hidden="true" className={className} data-target-marker="true">
    <svg fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" fill="currentColor" r="1.25" />
      <path d="M8 0.75v2M8 13.25v2M0.75 8h2M13.25 8h2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25" />
    </svg>
  </span>
)

export default TargetMarker
