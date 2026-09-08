import { useEffect, useRef } from "react";

interface Props {
  /** Short question, e.g. "이 측정을 삭제할까요?". */
  title: string;
  /** What disappears with it, including any cascading derived data. */
  body: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-app confirmation for an action that cannot be undone (UIX-001).
 *
 * Replaces `window.confirm` so the wording, the cascade count and the focus
 * behaviour are ours: focus moves to the dialog when it opens, Escape cancels,
 * and Tab stays inside while it is open.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button");
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" data-testid="confirm-dialog">
      <div
        className="dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
      >
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-body">{body}</p>
        <div className="dialog-actions">
          <button type="button" data-testid="confirm-cancel" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className="danger"
            ref={confirmRef}
            data-testid="confirm-accept"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "처리 중…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
