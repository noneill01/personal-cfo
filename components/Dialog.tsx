"use client";

import { useEffect, useRef, type ReactNode } from "react";

type DialogProps = {
  children: ReactNode;
  className: string;
  onClose: () => void;
  labelledBy?: string;
  label?: string;
  describedBy?: string;
  backdropClassName?: string;
};

/** Shared keyboard and focus behaviour for drawers and confirmation dialogs. */
export default function Dialog({ children, className, onClose, labelledBy, label, describedBy, backdropClassName = "detail-backdrop" }: DialogProps) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...element.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      .filter(control => !control.closest('[hidden],[inert]') && control.getClientRects().length > 0);
    if (!element.contains(document.activeElement)) (focusable()[0] ?? element).focus();
    const handleKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== element) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current(); return; }
      if (event.key !== "Tab") return;
      const controls = focusable(), first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); element.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element || !element.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("keydown", handleKey); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className={backdropClassName} role="presentation" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className={className} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={label} aria-describedby={describedBy} tabIndex={-1}>{children}</section>
  </div>;
}
