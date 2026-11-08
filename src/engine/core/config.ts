/**
 * The one typed config for every tunable number in the rule engine.
 *
 * Keys follow docs/RULEBOOK.md: "Universe and exclusions", "His scanners", "Market regime and exposure",
 * "Position sizing", "Setups", "Entry mechanics", "Stop rules", "Trade management and exits" and
 * "Settings to test". Every row of "Settings to test" is present with its proposed default
 * (marked `SETTING:` below). Values marked `APPROX:` are our pick (see DECISIONS.md).
 */

/** v1 setups. VCP-classic, IPO and shakeout are v1.1 (see setups/index.ts). */
export type SetupName = 'reContraction' | 'ema20Pullback' | 'depProxy' | 'baseVcp';
/** Any setup a signal/position can carry: Ankur's setups plus the systematic strategies (systematic.ts). */
export type StrategySetup = SetupName | 'rsi2' | 'hi52';
/** Which strategy the engine runs. 'ankur' = the rulebook setups; others: docs/research/external_strategies.md. */
export type StrategyKind = 'ankur' | 'rsi2' | 'hi52';
export const SETUP_NAMES: readonly SetupName[] = ['reContraction', 'ema20Pullback', 'depProxy', 'baseVcp'];

/** Which trailing-EMA family a setup belongs to (RULEBOOK "Settings to test": trailing EMA). */
export type TrailFamily = 'flag' | 'base' | 'dep';

/** 20 EMA scan momentum leg variant (RULEBOOK "Settings to test": 1.2 × low 10d ago vs 1.3 × low 20d ago). */
export type Ema20MomentumVariant = '10d1.2' | '20d1.3';

/** A momentum leg: close ≥ multiple × low of the bar `barsAgo` bars ago (Chartink "low N days ago"). */
export interface MomentumLeg {
  barsAgo: number;
  multiple: number;
}

export interface UniverseConfig {
  /** Allowed NSE series. EQ only excludes BE (trade-to-trade) and SM/ST (SME). RULEBOOK Universe "Excluded categories" (CcVEU0M7uPQ, jfr-kMHSEI4). */
  series: string[];
  /** Close > ₹30. RULEBOOK Universe "Price" (all scanners). */
  minClose: number;
  /** SMA50(volume) × close / 1e7 ≥ 5 (₹ Cr). RULEBOOK Universe "Liquidity" (wnhGCYBk4Gg). */
  minTurnover50Cr: number;
  /** Close ≤ 1.25 × SMA50(close). RULEBOOK Universe "Not extended" (flag and momentum scans). */
  maxCloseToSma50: number;
  /** Close > EMA50 required. RULEBOOK Universe "Trend": below the 50 EMA = not trending (wnhGCYBk4Gg). */
  requireCloseAboveEma50: boolean;
  /** Optional ADR% floor (null = off). RULEBOOK Universe "Volatility" ADR ~3–4% (wnhGCYBk4Gg). APPROX. */
  minAdrPct: number | null;
  /** Do-not-buy: run-up from the lowest low of the last N bars to close. RULEBOOK Do-not-buy (jMhKXuR0kyk). */
  runUpLookbackBars: number;
  /** Skip if that run-up exceeds this % (null = off). RULEBOOK says 60–70% in 1–2 months. APPROX: 70. */
  maxRunUpPct: number | null;
  /**
   * Exclude bars whose NSE price band is one of these (%). RULEBOOK "Excluded categories": 5% price band — EXACT
   * (CcVEU0M7uPQ, ahFVnEzFcag, WABVcgG2MSE); 2% bands are stricter still. Unknown band = not excluded.
   */
  excludePriceBands: number[];
}

export interface VolumeScanConfig {
  /** SETTING "Range-expansion day change": 6.5% (he once said 5.5%). RULEBOOK scanner 1 (volume scan). */
  reDayChangePct: number;
  /** Volume > 3 × SMA50(volume). */
  volumeMultiple: number;
  minClose: number;
  /** SMA50(volume) ≥ 25,000. */
  minVolSma50: number;
  /** Volume > 50,000. */
  minVolume: number;
  minTurnover50Cr: number;
}

export interface Ema20ScanConfig {
  /** 0.95 × EMA20 ≤ close ≤ 1.05 × EMA20 → bandPct = 5. RULEBOOK scanner 3; glossary "Near the 20 EMA". */
  bandPct: number;
  minClose: number;
  minTurnover50Cr: number;
  /** Volume > 1,00,000. */
  minVolume: number;
  /** SETTING "20 EMA scan momentum leg": test both. Default '10d1.2' (the 20 EMA scan's own leg). */
  ema20ScanMomentumLeg: Ema20MomentumVariant;
  /** Legs that are always on (any one passes). 6 months = 126 bars, 11 months = 231 bars (21 bars/month). */
  momentumLegs: MomentumLeg[];
  /** The variant leg for '10d1.2'. */
  legVariant10d: MomentumLeg;
  /** The variant leg for '20d1.3'. */
  legVariant20d: MomentumLeg;
}

export interface ScannersConfig {
  volume: VolumeScanConfig;
  ema20: Ema20ScanConfig;
}

export interface StopClusterConfig {
  /** RULEBOOK Regime "Warning: stop cluster": 4–5 stops in about a week (CcVEU0M7uPQ, v2nFQiYX2P0). */
  enabled: boolean;
  /** ≥ this many losing stop-outs ... */
  minStops: number;
  /** ... within the last N trading days (incl. today) ... */
  lookbackDays: number;
  /** ... forces regime 'weak' (if it was healthy) for the next N trading days. APPROX. */
  forceWeakDays: number;
}

/** Breakout follow-through gauge (followThrough.ts). APPROX thresholds: his normal win rate is 40–45%, so > 60% failing = poor. */
export interface FollowThroughConfig {
  enabled: boolean;
  /** Bars after the trigger day (incl.) during which a close below the trigger or a stop hit = failed. */
  horizonBars: number;
  /** Outcomes known within the last N trading days count. */
  lookbackDays: number;
  /** Minimum outcomes before the gauge can say "poor". */
  minOutcomes: number;
  /** Fail share above which follow-through is poor → regime capped at 'off' for new entries. */
  maxFailRate: number;
  /**
   * What counts as a failed breakout: 'closeBelowTrigger' (a close back below the trigger or a stop hit) or 'stop' (a
   * low at/below the stop = back into the base, his "breakouts falling back into the base", 57XQ7p0yPTc).
   */
  failOn: 'closeBelowTrigger' | 'stop';
}

export interface RegimeConfig {
  /** false = regime always 'healthy' (CLI --no-regime). */
  enabled: boolean;
  /** RULEBOOK Regime "Healthy market": broad index (Nifty 500) above rising 10 and 20 EMA (w1sbooFlgLY). */
  indexName: string;
  fallbackIndexName: string;
  emaFast: number;
  emaMid: number;
  /** RULEBOOK Regime "Minimum trend": index above its 50 EMA (mwFLohDp8Lc). */
  emaSlow: number;
  stopCluster: StopClusterConfig;
  followThrough: FollowThroughConfig;
  /**
   * "4 of my last 6 trades hit the stop or the breakeven stop within 1–2 weeks → step away ≥ 1 week, no new buys"
   * (57XQ7p0yPTc @01:44–13:07). Stop/breakeven exits count as bad; window in trading days.
   */
  recentTrades: { enabled: boolean; lastN: number; maxBad: number; withinDays: number; pauseDays: number };
}

export interface SizingConfig {
  /** 'risk' = core positionSize (risk % with position caps); 'equalWeight' = equalWeightPct of capital per position. */
  mode: 'risk' | 'equalWeight';
  equalWeightPct: number;
  /** SETTING "Risk per trade": 0.5% of capital. RULEBOOK Position sizing (v2nFQiYX2P0, w1sbooFlgLY). */
  riskPct: number;
  /** SETTING "Position cap" 15% and "Weak-market cap" 5%. RULEBOOK Position sizing (w1sbooFlgLY ~80m). */
  positionCapPct: { healthy: number; weak: number };
  /** Max simultaneous open positions. RULEBOOK Open gaps: 15% cap implies ≤ ~6–7; we allow 10 (cap on value binds first). APPROX. */
  maxOpenPositions: number;
  /** Total position value at cost ≤ this % of capital (100 = no leverage). */
  maxExposurePct: number;
}

export interface EntryConfig {
  /** NSE price tick (₹0.05). */
  tick: number;
  /** Limit = trigger × (1 + 1%). RULEBOOK Entry "Order type": limit 0.5–1% above (YBl0Orf-5I4). */
  limitPct: number;
  /** SETTING "Gap skip above trigger": 3%. RULEBOOK Entry "Gap skip" (sO2bPsS9KwE, jfr-kMHSEI4, w1sbooFlgLY). */
  gapSkipPct: number;
  /** Don't buy a stock already up ≥ 8% on the day. RULEBOOK Entry "Day-move cap" (w1sbooFlgLY). */
  dayMoveCapPct: number;
  /** Max 3 attempts per setup instance. RULEBOOK Stop rules "Attempts" (KzJIVw2E7g8, jfr-kMHSEI4). */
  maxAttempts: number;
}

export interface StopsConfig {
  /** 'setupBarLow' = low of the tight bar; 'lowestLow' = lowest low of the last `lowestLowBars` bars. RULEBOOK Stop "Placement" (Eenfov1IwM4). */
  mode: 'setupBarLow' | 'lowestLow';
  lowestLowBars: number;
  /** A few rupees below the low, ~0.3–0.5%. RULEBOOK Stop "Buffer" (w1sbooFlgLY). */
  bufferPct: number;
  /** SETTING "Max stop (tight-range setups)": 4%. RULEBOOK Stop "Max by setup" (ZcK5RBAoIY8). */
  maxStopPctTight: number;
  /** SETTING "Max stop (delayed EP)": 5%. RULEBOOK Stop "Max by setup" (GPhf8HpPW_c). */
  maxStopPctDEP: number;
}

export interface ParabolicConfig {
  /** RULEBOOK Exits "Parabolic": +40–50% in 2 days → sell 70–80% (ZcK5RBAoIY8, 1q_GXwfoZqE). */
  enabled: boolean;
  /** close ≥ (1 + gainPct%) × close `bars` bars ago. */
  gainPct: number;
  bars: number;
  /** Fraction of the remaining position sold at the close. */
  sellFraction: number;
}

export interface ThirdStrongDayConfig {
  /** RULEBOOK Exits "3rd strong day": sell ≥ half on the 3rd consecutive strong up day late in a move (jMhKXuR0kyk, jfr-kMHSEI4). */
  enabled: boolean;
  /** Consecutive days each with change% ≥ minChangePct. APPROX: 3 days of ≥ +5%. */
  days: number;
  minChangePct: number;
  /** "Late in a move" proxy: position at least +minR open. APPROX: 3R. */
  minR: number;
  sellFraction: number;
}

export interface ClimaxConfig {
  /** RULEBOOK Exits "Climax top": largest weekly candle of the run after ~70–80% (n2XnFVrmdRs). */
  enabled: boolean;
  /** Current week's close-to-close % change is the largest of the last N weeks (incl. this one). */
  lookbackWeeks: number;
  /** ... and at least this big. APPROX: 20%. */
  minWeeklyChangePct: number;
  /** ... and close ≥ (1 + minGainFromEntryPct%) × entry. APPROX: 50%. */
  minGainFromEntryPct: number;
}

export interface TimeStopConfig {
  /** RULEBOOK Stop "Time stop" (JUDGEMENT, CcVEU0M7uPQ). Default OFF. */
  enabled: boolean;
  bars: number;
  /** Exit next open if max favourable excursion < this many R after `bars` bars. */
  minMfeR: number;
}

export interface EarningsBlackoutConfig {
  /** RULEBOOK Universe "Earnings blackout": exit before results within ~7 days (1q_GXwfoZqE, jvDKg7QzsMI). */
  enabled: boolean;
  calendarDays: number;
  /** Setups exempt (DEP is bought after results, the next results are ~3 months out). */
  exemptSetups: SetupName[];
}

export interface ExitsConfig {
  /** SETTING "Breakeven trigger": 3R. RULEBOOK Exits "Breakeven" (Eenfov1IwM4, KzJIVw2E7g8). */
  breakevenR: number;
  /** Stop moved to "just above entry": entry × (1 + 0.3%). APPROX. */
  breakevenOffsetPct: number;
  /** SETTING "First partial (50%)": 3R for EP, 5R otherwise. RULEBOOK Exits "First partial" (jfr-kMHSEI4, TJq0CkT-viw). */
  partialR: { dep: number; default: number };
  partialFraction: number;
  /** SETTING "Trailing EMA (on close)": 10 EMA flags, 20 EMA EPs and bases. RULEBOOK Exits "Trail the rest" (KzJIVw2E7g8). */
  trailEma: { flag: number; base: number; dep: number };
  /** SETTING "Decisive close below 20 EMA (ours)": close > 1% below. RULEBOOK glossary. */
  decisiveClosePct: number;
  parabolic: ParabolicConfig;
  thirdStrongDay: ThirdStrongDayConfig;
  climax: ClimaxConfig;
  timeStop: TimeStopConfig;
  earningsBlackout: EarningsBlackoutConfig;
  /**
   * Simulation assumption, not a rulebook rule: what a daily bar means when the entry day's low is at/below the stop.
   * 'conservative' (default, HANDOFF step 3): the stop was hit after the fill. 'lowFirst' (sensitivity only): if the
   * order filled intraday after opening below the fill price and the day closed above the stop, the low printed
   * before the buy-stop triggered, so the position survives the day.
   */
  entryDayStopPolicy: 'conservative' | 'lowFirst';
  /**
   * Failed breakout ("tennis ball", J6fSgtkB0gg @6–9m): a leader rarely comes back below its buy point; a close below the
   * entry price within `maxBars` bars (before the partial) → exit at the next open. EXACT idea, APPROX window.
   */
  closeBelowEntry: { enabled: boolean; maxBars: number };
  /** "A big red candle = setup failed" (w1sbooFlgLY @76m); purple-list rule: a 5–6% down candle (KPuDFFG0Mjc @6m). Exit at the close. */
  bigRedCandle: { enabled: boolean; minDropPct: number };
  /** First partial in a weak/choppy regime at entry: "start booking at 2R" (w1sbooFlgLY @43m). null = same as normal. */
  partialRWeak: number | null;
}

/** Indian delivery (CNC) charges. All VERIFY against the broker's current schedule before relying on them. */
export interface CostsConfig {
  /** Zerodha delivery brokerage = 0. VERIFY. */
  brokeragePct: number;
  /** STT 0.1% on buy and sell value (delivery). VERIFY. RULEBOOK "Costs". */
  sttPct: number;
  /** NSE transaction charge 0.00297% of turnover (from 1 Oct 2024). VERIFY. */
  exchangeTxnPct: number;
  /** SEBI turnover fee ₹10 per crore. VERIFY. */
  sebiPerCrore: number;
  /** Stamp duty 0.015% on buy value (delivery). VERIFY. */
  stampDutyBuyPct: number;
  /** GST 18% on (brokerage + transaction charge + SEBI fee). VERIFY. */
  gstPct: number;
  /** DP charge per scrip per sell day, incl. GST (Zerodha ₹13.5 + 18% = ₹15.93). VERIFY. */
  dpChargePerSell: number;
  /** Slippage per side in basis points, applied to fill prices. APPROX. */
  slippageBps: number;
}

export interface ReContractionConfig {
  /** Setup bar window after the RE day: d0 + minBars ≤ i ≤ d0 + maxBars. RULEBOOK Trade loop "usually 5–10 days". APPROX: 2..15. */
  minBarsAfterRe: number;
  maxBarsAfterRe: number;
  /** Tight bar range% ≤ 3.0. RULEBOOK glossary "Tight bar" ~2–2.5% (CcVEU0M7uPQ). APPROX: 3.0. */
  maxRangePct: number;
  /** |change%| ≤ 2.5. RULEBOOK scanner 5 flag tightness ±2.5%. */
  maxAbsChangePct: number;
  /** RVol ≤ 100 (volume at or below average). RULEBOOK Core engine (gmCnvstswjw). APPROX. */
  maxRvol: number;
  /** Not too far above the 10 EMA: close ≤ EMA10 × (1 + 6%). RULEBOOK Core engine "flags near 10 EMA". APPROX. */
  maxAboveEma10Pct: number;
  /** Regression slope of closes d0+1..i, % of mean price per bar, ≤ +0.4. RULEBOOK Flag "Slope" (D-UPlB1XQOk). APPROX. null = off. */
  maxSlopePctPerBar: number | null;
  trailFamily: TrailFamily;
}

export interface Ema20PullbackConfig {
  /** Touch: a bar in the last N bars with low ≤ EMA20 × (1 + touchPct%). RULEBOOK 20 EMA pullback (L3fiDFZIpzc). APPROX. */
  lookbackBars: number;
  touchPct: number;
  maxRangePct: number;
  maxAbsChangePct: number;
  maxRvol: number;
  /** Stop = lowest low of the last N bars (incl. setup bar), with buffer. APPROX: 3. */
  stopLowestLowBars: number;
  trailFamily: TrailFamily;
  /**
   * Rulebook v2 pullback quality (round-3 research), each null/0 = off:
   * - maxOffHighPct: close no more than 10–15% below the swing high (8zhDgDN7M8E @10:46). Swing high = highest high of
   *   the last `swingLookbackBars`.
   * - maxRedHighVolBars: reject if more red bars on above-average volume since the swing high, ignoring the first 2
   *   (a big red bar on day 1–2 is fine: ZcK5RBAoIY8 @15:20; 8zhDgDN7M8E @10:12).
   * - nearEma10Pct: constructive pullbacks sit at the 10 EMA; "the closer to the 10 EMA, the higher the accuracy"
   *   (ZcK5RBAoIY8 @07:27, @21:30). SETTING "Near the 10 EMA (ours)" ±3%.
   * - minTightDaysAfterReclaim: the recovery day is the watchlist day, not the entry; wait ~2 tight days
   *   (8zhDgDN7M8E @05:05–06:45; qN5pAxBcrOM @05:41).
   */
  maxOffHighPct: number | null;
  swingLookbackBars: number;
  maxRedHighVolBars: number | null;
  nearEma10Pct: number | null;
  minTightDaysAfterReclaim: number;
}

export interface DepProxyConfig {
  /** Reaction day must gap ≥ 3% at the open OR change ≥ 8%. RULEBOOK DEP "Reaction day" (jfr-kMHSEI4). APPROX. */
  minGapPct: number;
  minChangePct: number;
  /** Strong close: (close − low)/(high − low) ≥ 0.6 ("a fade rejects"). APPROX. */
  minCloseLocation: number;
  /** Neglected before: close of d0−1 ≤ (1 + 25%) × lowest low of the `preRunUpLookbackBars` bars before d0. */
  preRunUpLookbackBars: number;
  /** SETTING "Delayed-EP pre-run-up reject": 25%. RULEBOOK DEP "Neglected before" (jfr-kMHSEI4, 7gNrxbSksOE). */
  depPreRunUpRejectPct: number;
  /** Setup bar in d0+2 .. d0+10. RULEBOOK DEP "Entry": first tight consolidation 2–10 days later (jfr-kMHSEI4). */
  minBarsAfter: number;
  maxBarsAfter: number;
  maxRangePct: number;
  maxAbsChangePct: number;
  /** RVol back to ~40–60%. RULEBOOK DEP "Entry" (GPhf8HpPW_c). */
  maxRvol: number;
  /** Results date within [d0 − N calendar days, d0] marks meta.catalyst. */
  catalystWindowDays: number;
  /** If true, only emit when a catalyst date is present (needs resultsDates). Default false (proxy). */
  requireCatalyst: boolean;
  /** EP needs a price band ≥ 10% (prefers 20%) or no band (F&O). RULEBOOK DEP "Reaction day" (jfr-kMHSEI4). EXACT. */
  minPriceBand: number;
  trailFamily: TrailFamily;
}

/** Base / VCP pivot (rulebook v2), see setups/baseVcp.ts for sources. */
export interface BaseVcpConfig {
  /** Base length: the base high is between minBaseBars and maxBaseBars ago. VCP examples 3–10 weeks (JiAaLcY6Y1Y: 8W). APPROX. */
  minBaseBars: number;
  maxBaseBars: number;
  /** Prior advance into the base high ("~20–25% institutional footprint", JiAaLcY6Y1Y) over this many bars. */
  priorMovePct: number;
  priorMoveLookbackBars: number;
  /** Overall base depth ≤ 35% (re-base rule, WABVcgG2MSE). */
  maxDepthPct: number;
  /** ≥ 2 contractions (2T minimum, Eenfov1IwM4); each ≤ previous × ratio; last ≤ single digit (JiAaLcY6Y1Y). */
  minContractions: number;
  maxDepthRatio: number;
  maxLastContractionPct: number;
  /** Swings shallower than this are noise. APPROX. */
  minContractionPct: number;
  /** Setup bar: tight (~2–2.5%, CcVEU0M7uPQ) and dry (volume below the previous N bars' average, RVol ≤ 100). */
  maxRangePct: number;
  maxAbsChangePct: number;
  maxRvol: number;
  dryUpBars: number;
  /** Buy only in the upper two thirds of the base (bICwUuwOgNU). */
  upperFraction: number;
  /** Stop under the setup bar (tight-bar low) or under the last contraction's low (Eenfov1IwM4 @10:43), capped by max stop. */
  stopMode: 'setupBar' | 'lastContraction';
  trailFamily: TrailFamily;
}

export interface RankingConfig {
  /** RULEBOOK glossary "Ranking": prefer the hit closest to its 52-week high (w1sbooFlgLY). */
  highLookbackBars: number;
  /** 3-month relative strength vs the regime index, weight of the bonus. APPROX. */
  rsLookbackBars: number;
  rsWeight: number;
  /** RS is clamped to ±rsClamp before weighting. */
  rsClamp: number;
}

export interface SetupsConfig {
  enabled: SetupName[];
  reContraction: ReContractionConfig;
  ema20Pullback: Ema20PullbackConfig;
  depProxy: DepProxyConfig;
  baseVcp: BaseVcpConfig;
}

/** Setup-quality ("identification") filters, rulebook v2. See quality.ts for sources. */
export interface QualityConfig {
  choppyBase: { enabled: boolean; lookbackBars: number; rightSideBars: number; maxRedHighVolBars: number; exemptSetups: SetupName[] };
  lateStage: { enabled: boolean; lookbackBars: number; minRunUpPct: number };
  legCount: { enabled: boolean; lookbackBars: number; maxLegs: number };
  upperTwoThirds: { enabled: boolean; lookbackBars: number };
  pullbackCount: { enabled: boolean; lookbackBars: number; maxPullbacks: number };
}

/** Sector gate and sector-chase block (sectors.ts). */
export interface SectorConfig {
  /** Equal-weight basket needs at least this many traded members on a day. */
  minMembers: number;
  gateEma: number;
  /** No new entries while the stock's sector basket is below its 50 EMA — EXACT (6v7NxlyhahE, wkSf4tDwmx0, 64gqyT84iEQ). */
  gate: { enabled: boolean };
  /** No new buys after the sector ran ≥ maxGainPct in lookbackDays (Pharma +6–8%, Auto +8–10% "very quickly"). APPROX: 8% in 5 days. */
  chase: { enabled: boolean; lookbackDays: number; maxGainPct: number };
}

/** Connors RSI(2) pullback (systematic.ts). */
export interface Rsi2Config {
  /** Buy when RSI(2) closes at or below this (5; 10 trades more). */
  entryRsiMax: number;
  /** Exit at the next open after a close above the 5-day SMA (built in); time stop after this many bars. */
  maxHoldBars: number;
  /** Catastrophe stop below the signal close (Connors uses none; defines R). */
  catastropheStopPct: number;
  /** Skip the order if the next open is more than this % above the signal close. */
  maxGapUpPct: number;
  minClose: number;
  minTurnover50Cr: number;
}

/** 52-week-high momentum rotation (systematic.ts). */
export interface Hi52Config {
  lookbackBars: number;
  /** Hold the top N; keep holdings while they stay in the top keepRank. */
  holdN: number;
  keepRank: number;
  /** Nominal stop for R accounting; a hard stop is traded only if hardStop is true. */
  nominalStopPct: number;
  hardStop: boolean;
  /** No new buys while the regime index is below its 200-day SMA (optional market gate). */
  regimeGate: boolean;
  maxGapUpPct: number;
  minClose: number;
  minTurnover50Cr: number;
}

export interface StrategyConfig {
  /** Which strategy runs ('ankur' = the rulebook). */
  kind: StrategyKind;
  rsi2: Rsi2Config;
  hi52: Hi52Config;
  /** Fixed capital for sizing (₹). No compounding (CLAUDE.md "Backtest results ... at fixed capital"). */
  capital: number;
  universe: UniverseConfig;
  scanners: ScannersConfig;
  regime: RegimeConfig;
  sizing: SizingConfig;
  entry: EntryConfig;
  stops: StopsConfig;
  exits: ExitsConfig;
  costs: CostsConfig;
  setups: SetupsConfig;
  ranking: RankingConfig;
  quality: QualityConfig;
  sectors: SectorConfig;
  /** SETTING "Near the 10 EMA (ours)": ±3%. Used by depProxy (close ≥ EMA10 × (1 − 3%)). RULEBOOK glossary. */
  nearEma10Pct: number;
}

export const defaultConfig: StrategyConfig = {
  kind: 'ankur',
  rsi2: { entryRsiMax: 5, maxHoldBars: 10, catastropheStopPct: 10, maxGapUpPct: 3, minClose: 30, minTurnover50Cr: 5 },
  hi52: {
    lookbackBars: 252, holdN: 20, keepRank: 40, nominalStopPct: 10, hardStop: false, regimeGate: false,
    maxGapUpPct: 3, minClose: 30, minTurnover50Cr: 5,
  },
  capital: 1_000_000,
  universe: {
    series: ['EQ'],
    minClose: 30,
    minTurnover50Cr: 5,
    maxCloseToSma50: 1.25,
    requireCloseAboveEma50: true,
    minAdrPct: null,
    runUpLookbackBars: 40,
    maxRunUpPct: 70,
    excludePriceBands: [2, 5],
  },
  scanners: {
    volume: {
      reDayChangePct: 6.5,
      volumeMultiple: 3,
      minClose: 30,
      minVolSma50: 25_000,
      minVolume: 50_000,
      minTurnover50Cr: 5,
    },
    ema20: {
      bandPct: 5,
      minClose: 30,
      minTurnover50Cr: 5,
      minVolume: 100_000,
      ema20ScanMomentumLeg: '10d1.2',
      momentumLegs: [
        { barsAgo: 5, multiple: 1.1 },
        { barsAgo: 30, multiple: 1.2 },
        { barsAgo: 90, multiple: 1.3 },
        { barsAgo: 126, multiple: 1.8 },
        { barsAgo: 231, multiple: 1.9 },
      ],
      legVariant10d: { barsAgo: 10, multiple: 1.2 },
      legVariant20d: { barsAgo: 20, multiple: 1.3 },
    },
  },
  regime: {
    enabled: true,
    indexName: 'NIFTY 500',
    fallbackIndexName: 'NIFTY 50',
    emaFast: 10,
    emaMid: 20,
    emaSlow: 50,
    stopCluster: { enabled: true, minStops: 4, lookbackDays: 5, forceWeakDays: 10 },
    followThrough: { enabled: false, horizonBars: 3, lookbackDays: 10, minOutcomes: 10, maxFailRate: 0.6, failOn: 'closeBelowTrigger' },
    recentTrades: { enabled: false, lastN: 6, maxBad: 4, withinDays: 10, pauseDays: 5 },
  },
  sizing: {
    mode: 'risk',
    equalWeightPct: 10,
    riskPct: 0.5,
    positionCapPct: { healthy: 15, weak: 5 },
    maxOpenPositions: 10,
    maxExposurePct: 100,
  },
  entry: {
    tick: 0.05,
    limitPct: 1,
    gapSkipPct: 3,
    dayMoveCapPct: 8,
    maxAttempts: 3,
  },
  stops: {
    mode: 'setupBarLow',
    lowestLowBars: 2,
    bufferPct: 0.3,
    maxStopPctTight: 4,
    maxStopPctDEP: 5,
  },
  exits: {
    breakevenR: 3,
    breakevenOffsetPct: 0.3,
    partialR: { dep: 3, default: 5 },
    partialFraction: 0.5,
    trailEma: { flag: 10, base: 20, dep: 20 },
    decisiveClosePct: 1,
    parabolic: { enabled: true, gainPct: 40, bars: 2, sellFraction: 0.75 },
    thirdStrongDay: { enabled: true, days: 3, minChangePct: 5, minR: 3, sellFraction: 0.5 },
    climax: { enabled: true, lookbackWeeks: 13, minWeeklyChangePct: 20, minGainFromEntryPct: 50 },
    timeStop: { enabled: false, bars: 20, minMfeR: 1 },
    earningsBlackout: { enabled: true, calendarDays: 7, exemptSetups: ['depProxy'] },
    entryDayStopPolicy: 'conservative',
    closeBelowEntry: { enabled: false, maxBars: 10 },
    bigRedCandle: { enabled: false, minDropPct: 5 },
    partialRWeak: null,
  },
  costs: {
    brokeragePct: 0,
    sttPct: 0.1,
    exchangeTxnPct: 0.00297,
    sebiPerCrore: 10,
    stampDutyBuyPct: 0.015,
    gstPct: 18,
    dpChargePerSell: 15.93,
    slippageBps: 10,
  },
  setups: {
    enabled: ['depProxy', 'reContraction', 'ema20Pullback'],
    reContraction: {
      minBarsAfterRe: 2,
      maxBarsAfterRe: 15,
      maxRangePct: 3.0,
      maxAbsChangePct: 2.5,
      maxRvol: 100,
      maxAboveEma10Pct: 6,
      maxSlopePctPerBar: 0.4,
      trailFamily: 'flag',
    },
    ema20Pullback: {
      lookbackBars: 10,
      touchPct: 1,
      maxRangePct: 3.0,
      maxAbsChangePct: 2.5,
      maxRvol: 100,
      stopLowestLowBars: 3,
      trailFamily: 'base',
      maxOffHighPct: null,
      swingLookbackBars: 20,
      maxRedHighVolBars: null,
      nearEma10Pct: null,
      minTightDaysAfterReclaim: 0,
    },
    depProxy: {
      minGapPct: 3,
      minChangePct: 8,
      minCloseLocation: 0.6,
      preRunUpLookbackBars: 60,
      depPreRunUpRejectPct: 25,
      minBarsAfter: 2,
      maxBarsAfter: 10,
      maxRangePct: 3.0,
      maxAbsChangePct: 2.5,
      maxRvol: 60,
      catalystWindowDays: 2,
      requireCatalyst: false,
      minPriceBand: 10,
      trailFamily: 'dep',
    },
    baseVcp: {
      minBaseBars: 15,
      maxBaseBars: 65,
      priorMovePct: 25,
      priorMoveLookbackBars: 60,
      maxDepthPct: 35,
      minContractions: 2,
      maxDepthRatio: 0.9,
      maxLastContractionPct: 10,
      minContractionPct: 3,
      maxRangePct: 3.0,
      maxAbsChangePct: 2.5,
      maxRvol: 100,
      dryUpBars: 5,
      upperFraction: 2 / 3,
      stopMode: 'setupBar',
      trailFamily: 'base',
    },
  },
  ranking: {
    highLookbackBars: 252,
    rsLookbackBars: 63,
    rsWeight: 0.1,
    rsClamp: 0.5,
  },
  quality: {
    // Base window 20 bars (≈ a 3–4 week base / flag); right side = last 10 bars; > 1 high-volume red bar = "repeated".
    choppyBase: { enabled: false, lookbackBars: 20, rightSideBars: 10, maxRedHighVolBars: 1, exemptSetups: ['depProxy'] },
    // "+60–70% in 2–3 months": 60% over 60 bars (≈ 3 months).
    lateStage: { enabled: false, lookbackBars: 60, minRunUpPct: 60 },
    // "already have 3 legs": > 2 legs in 80 bars (≈ 4 months: "no move in the prior 3–4 months" = young).
    legCount: { enabled: false, lookbackBars: 80, maxLegs: 2 },
    upperTwoThirds: { enabled: false, lookbackBars: 40 },
    pullbackCount: { enabled: false, lookbackBars: 60, maxPullbacks: 2 },
  },
  sectors: {
    minMembers: 5,
    gateEma: 50,
    gate: { enabled: false },
    chase: { enabled: false, lookbackDays: 5, maxGainPct: 8 },
  },
  nearEma10Pct: 3,
};

/** Recursive partial for config overrides. Arrays are replaced wholesale, never merged. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Deep-merge `override` into a copy of `base`. Objects merge recursively; arrays and scalars replace.
 * Throws on keys that do not exist in `base` so a typo in an experiment file fails loudly.
 */
export function deepMerge<T>(base: T, override: DeepPartial<T> | undefined, path = ''): T {
  if (override === undefined) return structuredClone(base);
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return structuredClone(override as T);
  }
  const out: Record<string, unknown> = structuredClone(base) as Record<string, unknown>;
  for (const [k, v] of Object.entries(override)) {
    const p = path === '' ? k : `${path}.${k}`;
    if (!(k in out)) throw new Error(`Unknown config key: ${p}`);
    if (v === undefined) continue;
    const cur = out[k];
    if (isPlainObject(cur) && isPlainObject(v)) {
      out[k] = deepMerge(cur, v as DeepPartial<typeof cur>, p);
    } else {
      if (cur !== null && v !== null && typeof cur !== typeof v) {
        throw new Error(`Config key ${p}: expected ${typeof cur}, got ${typeof v}`);
      }
      out[k] = structuredClone(v);
    }
  }
  return out as T;
}

/** Return a copy of `cfg` with the dotted `path` (e.g. 'exits.partialR.default') set to `value`. */
export function setConfigPath(cfg: StrategyConfig, path: string, value: unknown): StrategyConfig {
  const parts = path.split('.');
  let override: unknown = value;
  for (let i = parts.length - 1; i >= 0; i--) {
    const key = parts[i] as string;
    override = { [key]: override };
  }
  return deepMerge<StrategyConfig>(cfg, override as DeepPartial<StrategyConfig>);
}

/** Read a dotted path from the config (for reports and sweeps). */
export function getConfigPath(cfg: StrategyConfig, path: string): unknown {
  let cur: unknown = cfg;
  for (const p of path.split('.')) {
    if (!isPlainObject(cur) || !(p in cur)) throw new Error(`Unknown config key: ${path}`);
    cur = cur[p];
  }
  return cur;
}

/** EMA periods the engine needs features for, derived from config. */
export function requiredEmaPeriods(cfg: StrategyConfig): number[] {
  const s = new Set<number>([10, 20, 50, 200, cfg.exits.trailEma.flag, cfg.exits.trailEma.base, cfg.exits.trailEma.dep]);
  return [...s].sort((a, b) => a - b);
}

/** Trailing EMA period for a setup's trail family. */
export function trailEmaPeriod(cfg: StrategyConfig, setup: SetupName): number {
  const fam = cfg.setups[setup].trailFamily;
  return cfg.exits.trailEma[fam];
}

/** Max stop % for a setup (RULEBOOK Stop rules "Max by setup"). */
export function maxStopPct(cfg: StrategyConfig, setup: SetupName): number {
  return setup === 'depProxy' ? cfg.stops.maxStopPctDEP : cfg.stops.maxStopPctTight;
}

/** Partial-target R for a setup (RULEBOOK Exits "First partial"). */
export function partialR(cfg: StrategyConfig, setup: SetupName): number {
  return setup === 'depProxy' ? cfg.exits.partialR.dep : cfg.exits.partialR.default;
}

/** Partial-target R given the regime at entry: 2R in a weak/choppy market when exits.partialRWeak is set (w1sbooFlgLY @43m). */
export function partialRFor(cfg: StrategyConfig, setup: SetupName, regimeWeak: boolean): number {
  const base = partialR(cfg, setup);
  return regimeWeak && cfg.exits.partialRWeak !== null ? Math.min(base, cfg.exits.partialRWeak) : base;
}
