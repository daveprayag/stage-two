import type { HoldingRow } from "@/engine/holdings";
import { titleCase } from "@/lib/format";

/** Names Paytm Money gives some ETFs are codes; everything else is the company name without "Ltd". */
const ETF_NAMES: Record<string, string> = { SILVERBEES: "Nippon India Silver ETF", GOLDBEES: "Nippon India Gold ETF", NIFTYBEES: "Nippon India Nifty 50 ETF" };

export const displayName = (r: Pick<HoldingRow, "symbol" | "name">) =>
  ETF_NAMES[r.symbol] ?? (titleCase(r.name).replace(/[\s,]+(ltd\.?|limited)$/i, "").trim() || r.symbol);
