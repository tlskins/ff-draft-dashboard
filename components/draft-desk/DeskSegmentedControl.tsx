import React from "react"

import styles from "../DraftDesk.module.css"

interface DeskSegmentedControlItem<T extends string> {
  id: T
  label: string
}

interface DeskSegmentedControlProps<T extends string> {
  ariaLabel: string
  items: Array<DeskSegmentedControlItem<T>>
  selectedId: T
  onSelect: (id: T) => void
  className?: string
  disabled?: boolean
}

const DeskSegmentedControl = <T extends string>({
  ariaLabel,
  items,
  selectedId,
  onSelect,
  className = "",
  disabled = false,
}: DeskSegmentedControlProps<T>) => (
  <div
    aria-label={ariaLabel}
    className={`${styles.modeToggle} ${className}`}
    role="group"
  >
    {items.map(item => (
      <button
        aria-pressed={selectedId === item.id}
        disabled={disabled}
        key={item.id}
        onClick={() => onSelect(item.id)}
        type="button"
      >
        {item.label}
      </button>
    ))}
  </div>
)

export default DeskSegmentedControl
