/** A grey placeholder block for a value that is still loading (pages never show an older copy of the data instead). */
export function Bone({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-md bg-surface-2 ${className}`} aria-hidden="true" />;
}
