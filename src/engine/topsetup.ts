/**
 * Top setups: stocks that pass every check at once — a live uptrend (not a dying one), stacked moving averages,
 * price above its EMAs, healthy RSI, strong relative strength, buyers in control on volume, an actionable pattern
 * (breaking out today or tight near the high), enough liquidity, and positive news with no red flags.
 * Passing them all raises the odds; it does not guarantee anything. Pure, shared by the screener and stock page.
 */
import type { NewsBundle, ScreenRow } from "./types";

export interface Check {
  key: string;
  label: string;
  pass: boolean;
  value: string;
}

const pct = (x: number, d = 1) => `${x.toFixed(d)}%`;

export function technicalChecks(r: ScreenRow): Check[] {
  const rsi = r.rsi14 ?? Number.NaN;
  const ema20 = r.ema20 ?? Number.NaN;
  const ema50 = r.ema50 ?? Number.NaN;
  const udv = r.upDownVol ?? Number.NaN;
  const runUp = r.runUp2m ?? Number.NaN;
  const pattern = r.tags.includes("breakout") ? "Breaking out today" : r.tags.includes("setup") ? "Tight near its high" : "No entry pattern";
  return [
    {
      key: "trend",
      label: "Live uptrend, not a dying one",
      pass: r.stage === 2 && !!r.ma200Rising && !!r.ma50Rising,
      value: `Stage ${r.stage}; 50-day ${r.ma50Rising ? "rising" : "not rising"}, 200-day ${r.ma200Rising ? "rising" : "not rising"}`,
    },
    { key: "template", label: "All moving averages stacked (trend template 8/8)", pass: r.template >= 8, value: `${r.template} of 8` },
    {
      key: "ema",
      label: "Price above the 20- and 50-day EMAs",
      pass: r.close > ema20 && r.close > ema50,
      value: Number.isFinite(ema20) ? `${pct((r.close / ema20 - 1) * 100)} / ${pct((r.close / ema50 - 1) * 100)} above` : "n/a",
    },
    { key: "rsi", label: "RSI(14) between 50 and 75: strong, not overbought", pass: rsi >= 50 && rsi <= 75, value: Number.isFinite(rsi) ? `RSI ${rsi.toFixed(0)}` : "n/a" },
    { key: "rs", label: "RS rating 80 or more", pass: r.rs >= 80, value: `RS ${r.rs}` },
    {
      key: "stretch",
      label: "Near the high but not stretched",
      pass: r.pctFromHigh <= 15 && r.close <= 1.25 * r.sma50 && runUp <= 60,
      value: `${pct(r.pctFromHigh)} below high, ${pct((r.close / r.sma50 - 1) * 100)} above 50-day, ${Number.isFinite(runUp) ? pct(runUp, 0) : "?"} in 2 months`,
    },
    {
      key: "volume",
      label: "Buyers in control on volume",
      pass: udv >= 1.2 && !(r.chgPct < 0 && r.rvol >= 150),
      value: Number.isFinite(udv) ? `Up-day volume ${udv.toFixed(2)}× down-day volume` : "n/a",
    },
    { key: "pattern", label: "An entry pattern: breaking out or tight near the high", pass: r.tags.includes("breakout") || r.tags.includes("setup"), value: pattern },
    {
      key: "liquidity",
      label: "Liquid: ₹5 Cr+ traded a day, not in a 2%/5% band",
      pass: r.turnoverCr >= 5 && !(r.band === 2 || r.band === 5),
      value: `₹${r.turnoverCr.toFixed(1)} Cr a day${r.band !== null ? `, ${r.band}% band` : ""}`,
    },
  ];
}

export function newsCheck(n: NewsBundle | undefined): Check {
  const ai = n?.ai;
  return {
    key: "news",
    label: "Backed by positive news, no red flags",
    pass: !!ai && ai.sentiment === "positive" && ai.redFlags.length === 0,
    value: !ai ? "No news summary" : ai.redFlags.length ? `Red flag: ${ai.redFlags[0]}` : `News ${ai.sentiment}`,
  };
}

export const technicalPass = (r: ScreenRow) => technicalChecks(r).every((c) => c.pass);

export function topSetupChecks(r: ScreenRow, n: NewsBundle | undefined): Check[] {
  return [...technicalChecks(r), newsCheck(n)];
}

export const isTopSetup = (r: ScreenRow, n: NewsBundle | undefined) => r.tags.includes("qualified") && newsCheck(n).pass;
