export const isEditableKeyboardTarget = (
  target: EventTarget | null,
): boolean => {
  if (!(target instanceof HTMLElement)) return false

  return target.isContentEditable
    || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

export const isInteractiveKeyboardTarget = (
  target: EventTarget | null,
): boolean => target instanceof HTMLElement && Boolean(target.closest([
  "button",
  "a[href]",
  "[role='button']",
  "[role='menuitem']",
  "[role='option']",
].join(",")))

interface GlobalShortcutEvent {
  altKey: boolean
  code: string
  ctrlKey: boolean
  metaKey: boolean
  target: EventTarget | null
}

export const shouldIgnoreGlobalDraftShortcut = (
  event: GlobalShortcutEvent,
): boolean => isEditableKeyboardTarget(event.target)
  || isInteractiveKeyboardTarget(event.target)
  || event.ctrlKey
  || event.altKey
  // Keep Drafty's deliberate Meta-key hold state, but never take over Cmd+key.
  || (event.metaKey && !["MetaLeft", "MetaRight"].includes(event.code))
