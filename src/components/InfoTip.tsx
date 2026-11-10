"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * A small ⓘ that explains a label: opens on hover or focus (desktop) and on tap (phones); Escape, a tap elsewhere or
 * scrolling closes it. Positioned against the viewport so cards with overflow-hidden don't clip it.
 */
export function InfoTip({ label, children, align = "left" }: { label: string; children: React.ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  const W = 272;

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = align === "right" ? r.right - W : r.left - 8;
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(left, window.innerWidth - W - 8)) });
  };
  const show = () => {
    place();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "pointerdown" && btn.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`What "${label}" means`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && pos && (
        <span
          id={id}
          role="tooltip"
          style={{ top: pos.top, left: pos.left, width: W }}
          className="fixed z-50 rounded-xl border border-line bg-surface p-3 text-left text-xs leading-relaxed font-normal whitespace-normal text-ink-2 normal-case shadow-lg"
        >
          <span className="mb-1 block text-[13px] font-medium text-ink">{label}</span>
          {children}
        </span>
      )}
    </>
  );
}
