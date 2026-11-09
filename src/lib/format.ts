const IN = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const IN0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export const price = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : IN.format(x));
export const int = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : IN0.format(x));
export const pct = (x: number | null | undefined, digits = 1, sign = true) =>
  x === null || x === undefined || !Number.isFinite(x) ? "—" : `${sign && x > 0 ? "+" : ""}${x.toFixed(digits)}%`;
export const crore = (x: number) => (x >= 100 ? `₹${IN0.format(x)} Cr` : `₹${x.toFixed(1)} Cr`);

/** "2026-11-06" → "6 Nov 2026". */
export function day(d: string): string {
  const t = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** ISO timestamp → "6 Nov, 8:14 pm IST". */
export function istTime(iso: string): string {
  const t = new Date(iso);
  return `${t.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })} IST`;
}

const KEEP_UPPER = new Set(["ABB", "ACC", "BSE", "CDSL", "HDFC", "ICICI", "IDBI", "IDFC", "IRCTC", "ITC", "LIC", "NTPC", "ONGC", "SBI", "TVS", "UPL", "IT", "AI", "II", "III"]);
const NOT_ACRONYMS = new Set(["ltd", "pvt", "mfg", "bros"]);
const SMALL_WORDS = new Set(["of", "in", "on", "an", "to", "co", "a"]);
/**
 * "GUFIC BIOSCIENCES LTD." → "Gufic Biosciences Ltd.", "MM FORGINGS LTD" → "MM Forgings Ltd"; vowel-less short words stay
 * capitals as acronyms ("PVR INOX LIMITED" → "PVR Inox Limited", "JSW STEEL" → "JSW Steel"). NSE names arrive in capitals.
 */
export function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(/(\s+|-|\(|\))/)
    .map((w, k) =>
      k > 0 && SMALL_WORDS.has(w) && w !== "co"
        ? w
        : KEEP_UPPER.has(w.toUpperCase()) || (/^[a-z]{1,2}$/.test(w) && !SMALL_WORDS.has(w)) || (/^[^aeiou\W\d]{3,4}$/.test(w) && !NOT_ACRONYMS.has(w))
        ? w.toUpperCase() // initials such as "MM", "JK", "SG"
        : w.replace(/^[a-z]/, (c) => c.toUpperCase()),
    )
    .join("");
}
