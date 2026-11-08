/** Stage Two mark: a flat base (stage 1) that steps up into an advance (stage 2). */
export function Mark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M2.5 17.5h7.5l3-4.5h3.5l5-8.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21.5" cy="4.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-ink">
      <span className="text-up">
        <Mark />
      </span>
      <span className="font-display text-[22px] leading-none tracking-tight">Stage Two</span>
    </span>
  );
}
