"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface Option {
  value: string;
  label: string;
}

/**
 * Dropdown that looks the same everywhere: a menu under the button on larger screens, a bottom sheet on phones.
 * Keyboard: Enter/Space/↓ opens, ↑/↓ move, Enter picks, Escape closes.
 */
export function Select({ label, value, options, onChange, className = "" }: { label: string; value: string; options: Option[]; onChange: (v: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    const selected = list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? list.current?.querySelector<HTMLButtonElement>("button");
    selected?.focus({ preventScroll: true });
    // Phones: keep the page behind the bottom sheet still.
    const phone = window.matchMedia("(max-width: 767px)").matches;
    const prev = document.body.style.overflow;
    if (phone) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const pick = (v: string) => {
    onChange(v);
    close();
  };
  const onListKey = (e: React.KeyboardEvent) => {
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const k = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[Math.min(items.length - 1, k + 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[Math.max(0, k - 1)]?.focus();
    } else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 text-left text-sm transition-colors hover:border-line-strong md:h-9"
      >
        <span className="shrink-0 text-ink-3">{label}</span>
        <span className="min-w-0 flex-1 truncate text-ink">{current?.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-hidden rounded-t-2xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl md:absolute md:inset-x-auto md:bottom-auto md:left-0 md:mt-1.5 md:max-h-80 md:w-full md:min-w-56 md:rounded-xl md:border md:pb-0 md:shadow-lg">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
              <span className="text-sm font-medium text-ink">{label}</span>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink-2">
                Done
              </button>
            </div>
            <ul ref={list} id={id} role="listbox" aria-label={label} onKeyDown={onListKey} className="max-h-[calc(70dvh-3rem)] overflow-y-auto py-1 md:max-h-80">
              {options.map((o) => {
                const on = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => pick(o.value)}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] outline-none hover:bg-surface-2 focus-visible:bg-surface-2 md:py-2 md:text-sm ${on ? "text-ink" : "text-ink-2"}`}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {on && <Check className="h-4 w-4 shrink-0 text-up" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
