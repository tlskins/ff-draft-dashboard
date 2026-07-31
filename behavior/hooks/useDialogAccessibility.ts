import {
  KeyboardEvent,
  RefObject,
  useEffect,
  useRef,
} from "react"

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

interface DialogAccessibilityOptions {
  active?: boolean
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef?: RefObject<HTMLElement | null>
  onClose: () => void
}

export const useDialogAccessibility = ({
  active = true,
  dialogRef,
  initialFocusRef,
  onClose,
}: DialogAccessibilityOptions) => {
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return
    openerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const timer = window.setTimeout(() => {
      (initialFocusRef?.current || dialogRef.current)?.focus()
    })

    return () => {
      window.clearTimeout(timer)
      openerRef.current?.focus()
    }
  }, [active, dialogRef, initialFocusRef])

  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== "Tab") return

    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(focusableSelector),
    )
    if (focusable.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}
