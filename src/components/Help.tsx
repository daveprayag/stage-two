"use client";
/**
 * A small "?" that opens the explanation in a dialog, so pages keep long notes out of the way. A centred dialog on
 * larger screens, a bottom sheet on phones. Escape, the close button or a tap outside closes it (native <dialog>:
 * focus stays inside while it is open and returns to the "?" after).
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function Help({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  const dlg = useRef<HTMLDialogElement>(null);
  // The dialog lives under <body>, not inside the heading or card it explains.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dialog = (
    <dialog
      ref={dlg}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) dlg.current?.close();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-left text-ink shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px] max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <h2 className="text-[15px] font-medium text-ink">{title}</h2>
        <button type="button" onClick={() => dlg.current?.close()} aria-label="Close" className="-mt-1 -mr-2 rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm leading-relaxed font-normal whitespace-normal text-ink-2 normal-case">
        {children}
      </div>
    </dialog>
  );
  return (
    <>
      <button
        type="button"
        aria-label={`About: ${title}`}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dlg.current?.showModal();
        }}
        className={`relative inline-flex h-[18px] w-[18px] shrink-0 after:absolute after:-inset-2.5 after:content-[''] items-center justify-center rounded-full border border-line-strong align-middle text-[11px] leading-none font-medium text-ink-3 transition-colors hover:border-ink-3 hover:text-ink focus-visible:border-ink focus-visible:text-ink focus-visible:outline-none ${className}`}
      >
        ?
      </button>
      {mounted && createPortal(dialog, document.body)}
    </>
  );
}

/** "Tested" / "Not tested" label for an explanation. */
export function Tested({ yes }: { yes: boolean }) {
  return (
    <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] tracking-wide uppercase ${yes ? "bg-surface-2 text-ink-2" : "bg-amber-soft text-amber"}`}>{yes ? "Tested" : "Not tested"}</span>
  );
}
