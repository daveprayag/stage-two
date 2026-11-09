/**
 * NSE end-of-day sources (all public, no login). Same files livermore uses (livermore/docs/DATA_SOURCES.md):
 *  - UDiFF bhavcopy: every security's OHLCV for one session (one zip per day).
 *  - ind_close_all: every NSE index's close for one session.
 *  - sec_list: daily price bands.
 *  - corporates-corporateActions / corporate-announcements JSON APIs.
 * Etiquette: browser UA, one request at a time with a pause, nothing re-downloaded within a run.
 */
import { strFromU8, unzipSync } from "fflate";
import type { Filing, ISODate } from "./types";

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const ARCHIVES = "https://nsearchives.nseindia.com";

export const bhavcopyUrl = (d: ISODate) => `${ARCHIVES}/content/cm/BhavCopy_NSE_CM_0_0_0_${d.replaceAll("-", "")}_F_0000.csv.zip`;
export const indexCloseUrl = (d: ISODate) => `${ARCHIVES}/content/indices/ind_close_all_${ddmmyyyy(d, "")}.csv`;
export const priceBandUrl = (d: ISODate) => `${ARCHIVES}/content/equities/sec_list_${ddmmyyyy(d, "")}.csv`;
export const corpActionsUrl = (from: ISODate, to: ISODate) =>
  `https://www.nseindia.com/api/corporates-corporateActions?index=equities&from_date=${ddmmyyyy(from, "-")}&to_date=${ddmmyyyy(to, "-")}`;
export const announcementsUrl = (from: ISODate, to: ISODate) =>
  `https://www.nseindia.com/api/corporate-announcements?index=equities&from_date=${ddmmyyyy(from, "-")}&to_date=${ddmmyyyy(to, "-")}`;

export function ddmmyyyy(d: ISODate, sep: string): string {
  const [y, m, day] = d.split("-");
  return `${day}${sep}${m}${sep}${y}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;

/** GET with a browser UA, ≥ 700 ms between requests, retry on 403/429/5xx. Returns null on 404. */
export async function politeGet(url: string, accept = "*/*", attempts = 3): Promise<ArrayBuffer | null> {
  for (let a = 1; a <= attempts; a++) {
    const wait = lastRequest + 700 - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-US,en;q=0.9", Referer: "https://www.nseindia.com/" },
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
    } catch (e) {
      if (a === attempts) throw e;
      await sleep(1500 * a);
      continue;
    }
    if (res.status === 404) return null;
    if (res.ok) return res.arrayBuffer();
    if (a === attempts || !(res.status === 403 || res.status === 429 || res.status >= 500)) {
      throw new Error(`GET ${url} → HTTP ${res.status}`);
    }
    await sleep(2000 * a);
  }
  return null;
}

/** HEAD request: does the file exist yet? (Same etiquette as politeGet; one attempt.) */
export async function politeHead(url: string): Promise<boolean> {
  const wait = lastRequest + 700 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  const res = await fetch(url, {
    method: "HEAD",
    headers: { "User-Agent": UA, Accept: "*/*", Referer: "https://www.nseindia.com/" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok;
}

/** Minimal RFC-4180 CSV parser (quoted fields, embedded commas/quotes). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") out.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}

function columns(header: string[]): (name: string) => number {
  const m = new Map(header.map((h, i) => [h.trim().toLowerCase(), i]));
  return (name) => m.get(name.toLowerCase()) ?? -1;
}

export interface BhavRow {
  isin: string;
  symbol: string;
  series: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Exchange previous close (NOT adjusted for a split on its ex-date). */
  prevClose: number;
  volume: number;
}

/** Parse a UDiFF bhavcopy zip → EQ/BE stock rows. */
export function parseBhavcopyZip(zip: Uint8Array, series: readonly string[] = ["EQ", "BE"]): { date: ISODate | null; rows: BhavRow[] } {
  const files = unzipSync(zip);
  const first = Object.values(files)[0];
  if (!first) throw new Error("empty bhavcopy zip");
  return parseBhavcopyCsv(strFromU8(first), series);
}

export function parseBhavcopyCsv(csv: string, series: readonly string[] = ["EQ", "BE"]): { date: ISODate | null; rows: BhavRow[] } {
  const table = parseCsv(csv);
  const header = table[0];
  if (!header) return { date: null, rows: [] };
  const col = columns(header);
  const need = ["TradDt", "ISIN", "TckrSymb", "SctySrs", "OpnPric", "HghPric", "LwPric", "ClsPric", "PrvsClsgPric", "TtlTradgVol"];
  for (const n of need) if (col(n) < 0) throw new Error(`bhavcopy: missing column ${n}`);
  const iTp = col("FinInstrmTp");
  const iName = col("FinInstrmNm");
  const want = new Set(series);
  const rows: BhavRow[] = [];
  let date: ISODate | null = null;
  for (const r of table.slice(1)) {
    if (iTp >= 0 && r[iTp] && r[iTp] !== "STK") continue;
    const s = (r[col("SctySrs")] ?? "").trim().toUpperCase();
    if (!want.has(s)) continue;
    date ??= (r[col("TradDt")] ?? "").trim() || null;
    const n = (name: string) => Number(r[col(name)]);
    const row: BhavRow = {
      isin: (r[col("ISIN")] ?? "").trim().toUpperCase(),
      symbol: (r[col("TckrSymb")] ?? "").trim().toUpperCase(),
      series: s,
      name: iName >= 0 ? (r[iName] ?? "").trim() : "",
      open: n("OpnPric"),
      high: n("HghPric"),
      low: n("LwPric"),
      close: n("ClsPric"),
      prevClose: n("PrvsClsgPric"),
      volume: n("TtlTradgVol"),
    };
    if (row.isin && row.close > 0 && row.high >= row.low) rows.push(row);
  }
  return { date, rows };
}

/** ind_close_all CSV → index name → close. Names are upper-cased and trimmed. */
export function parseIndexClose(csv: string): Map<string, number> {
  const table = parseCsv(csv);
  const header = table[0];
  const out = new Map<string, number>();
  if (!header) return out;
  const col = columns(header);
  const iName = col("Index Name");
  const iClose = col("Closing Index Value");
  if (iName < 0 || iClose < 0) throw new Error("ind_close_all: unexpected header");
  for (const r of table.slice(1)) {
    const name = (r[iName] ?? "").trim().toUpperCase();
    const close = Number(r[iClose]);
    if (name && Number.isFinite(close) && close > 0) out.set(name, close);
  }
  return out;
}

/** sec_list CSV → symbol → band %, null for "No Band". Only EQ/BE rows. */
export function parsePriceBands(csv: string): Map<string, number | null> {
  const table = parseCsv(csv);
  const header = table[0];
  const out = new Map<string, number | null>();
  if (!header) return out;
  const col = columns(header);
  const iSym = col("Symbol");
  const iSer = col("Series");
  const iBand = col("Band");
  if (iSym < 0 || iBand < 0) throw new Error("sec_list: unexpected header");
  for (const r of table.slice(1)) {
    const ser = iSer >= 0 ? (r[iSer] ?? "").trim().toUpperCase() : "EQ";
    if (ser !== "EQ" && ser !== "BE") continue;
    const b = Number.parseFloat(r[iBand] ?? "");
    out.set((r[iSym] ?? "").trim().toUpperCase(), Number.isFinite(b) ? b : null);
  }
  return out;
}

const MONTHS: Record<string, string> = { JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06", JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12" };

/** "06-Nov-2026", "06-11-2026", "2026-11-06" (optionally followed by a time) → ISO date. */
export function parseNseDate(s: string | undefined | null): ISODate | null {
  if (!s) return null;
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(t);
  if (m) {
    const mm = MONTHS[(m[2] as string).toUpperCase()];
    return mm ? `${m[3]}-${mm}-${(m[1] as string).padStart(2, "0")}` : null;
  }
  m = /^(\d{1,2})-(\d{1,2})-(\d{4})/.exec(t);
  if (m) return `${m[3]}-${(m[2] as string).padStart(2, "0")}-${(m[1] as string).padStart(2, "0")}`;
  return null;
}

function records(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)) return (json as { data: Record<string, unknown>[] }).data;
  return [];
}

const str = (r: Record<string, unknown>, ...keys: string[]): string => {
  for (const k of keys) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

export interface CorpAction {
  symbol: string;
  isin: string | null;
  exDate: ISODate;
  subject: string;
}

export function parseCorpActions(json: unknown): CorpAction[] {
  const out: CorpAction[] = [];
  for (const r of records(json)) {
    const symbol = str(r, "symbol", "SYMBOL").toUpperCase();
    const subject = str(r, "subject", "SUBJECT", "purpose");
    const exDate = parseNseDate(str(r, "exDate", "EX-DATE", "ex_date"));
    if (symbol && subject && exDate) out.push({ symbol, isin: str(r, "isin", "ISIN") || null, exDate, subject });
  }
  return out;
}

/** Announcement categories that carry no information about the business. */
const NOISE = [
  /trading window/i,
  /newspaper/i,
  /depositories and participants/i,
  /loss of share certificate|duplicate share/i,
  /^general updates?$/i,
  /record date/i,
  /book closure/i,
  /notice of (?:postal ballot|agm|egm)/i,
  /esop|esos|esps/i,
  /certificate under/i,
  /compliance certificate|reg\.? ?74|regulation 74/i,
];

export interface Announcement extends Filing {
  symbol: string;
}

export function parseAnnouncements(json: unknown): Announcement[] {
  const out: Announcement[] = [];
  for (const r of records(json)) {
    const symbol = str(r, "symbol").toUpperCase();
    const category = str(r, "desc");
    if (!symbol || !category || NOISE.some((re) => re.test(category))) continue;
    const text = str(r, "attchmntText").replace(/\s+/g, " ");
    out.push({
      symbol,
      date: str(r, "an_dt", "sort_date"),
      category,
      text: text.length > 320 ? `${text.slice(0, 317)}…` : text,
      url: str(r, "attchmntFile") || null,
    });
  }
  return out;
}
