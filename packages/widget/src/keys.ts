/**
 * Keyboard and editing events in the widget end at its shadow root. Page listeners see them retargeted to the widget's host element, so a host
 * shortcut handler that skips keys typed into inputs (`event.target.closest('input,textarea')`) would take them and may cancel
 * them: a space or "j" typed in a reply, or Space and Enter on the widget's buttons and pins, which then never activate. The page
 * has no use for edits inside the widget: beforeinput handlers can cancel them, and input/composition handlers can run expensive
 * page updates on every keystroke. Native editing and widget handlers still run; only outward bubbling is stopped.
 * Host capture-phase listeners have already run before events reach this boundary.
 * Escape goes on to the page, where the settings flyout and host dialogs close on
 * it; the widget's own document handlers for Escape and Cmd/Ctrl+Enter listen in the capture phase.
 */
export function isolateKeys(root: ShadowRoot) {
  for (const type of ['keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend']) root.addEventListener(type, stop);
}

function stop(event: Event) {
  if ((event as KeyboardEvent).key !== 'Escape') event.stopPropagation();
}
