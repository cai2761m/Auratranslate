import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function Modal({
  id,
  titleId,
  open,
  onClose,
  children,
  className = "",
  inert = false,
  initialFocus,
  returnFocus,
}) {
  const panel = useRef(null);
  const opener = useRef(null);
  useLayoutEffect(() => {
    if (!open) return;
    // The opener can already be blurred when its parent becomes inert.
    opener.current =
      (returnFocus && document.querySelector(returnFocus)) ||
      document.activeElement;
    (
      panel.current.querySelector(
        initialFocus || "button:not(:disabled), input, select",
      ) || panel.current
    ).focus();
    return () => {
      const target = opener.current;
      // Wait until React removes inert from the underlying page/dialog.
      queueMicrotask(() => {
        if (target?.isConnected) target.focus();
      });
    };
  }, [open, initialFocus, returnFocus]);
  function keyDown(event) {
    if (inert) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
    if (event.key !== "Tab") return;
    const fields = [
      ...panel.current.querySelectorAll(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex='0']",
      ),
    ];
    const first = fields[0],
      last = fields.at(-1);
    if (!panel.current.contains(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  useLayoutEffect(() => {
    if (!open || inert) return;
    // Disabling a focused request button can move focus to body. The active
    // dialog must still handle Escape and keep keyboard navigation inside it.
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, [open, inert, onClose]);
  return createPortal(
    <div
      className={`modal ${className}`}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      hidden={!open}
    >
      <div className="modal-backdrop" onClick={() => !inert && onClose()} />
      <div className="modal-panel" ref={panel} inert={inert} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
