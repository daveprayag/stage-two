/**
 * Indian delivery (CNC) equity charges and slippage. RULEBOOK "Open gaps / Costs": delivery STT 0.1% on buy and
 * on sell; with exchange charges, stamp duty and GST ~0.25% per round trip before slippage.
 * All rates live in CostsConfig and carry VERIFY notes there. No rupee rounding of STT/stamp (slightly conservative
 * vs exact contract-note rounding is not modelled either way).
 */
import type { CostsConfig } from './config.js';

export interface ChargeBreakdown {
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  stamp: number;
  gst: number;
  dp: number;
  total: number;
}

function charges(value: number, c: CostsConfig, side: 'buy' | 'sell'): ChargeBreakdown {
  const brokerage = (value * c.brokeragePct) / 100;
  const stt = (value * c.sttPct) / 100;
  const exchange = (value * c.exchangeTxnPct) / 100;
  const sebi = (value / 1e7) * c.sebiPerCrore;
  const stamp = side === 'buy' ? (value * c.stampDutyBuyPct) / 100 : 0;
  const gst = ((brokerage + exchange + sebi) * c.gstPct) / 100;
  const dp = side === 'sell' && value > 0 ? c.dpChargePerSell : 0;
  const total = brokerage + stt + exchange + sebi + stamp + gst + dp;
  return { brokerage, stt, exchange, sebi, stamp, gst, dp, total };
}

/** Charges on a delivery buy of `value` rupees. */
export function buyCharges(value: number, c: CostsConfig): ChargeBreakdown {
  return charges(value, c, 'buy');
}

/** Charges on one delivery sell order of `value` rupees (DP charge once per sell order per scrip). */
export function sellCharges(value: number, c: CostsConfig): ChargeBreakdown {
  return charges(value, c, 'sell');
}

/** Buy fill after slippage (price moves against us). */
export function slippedBuyPrice(price: number, c: CostsConfig): number {
  return price * (1 + c.slippageBps / 10_000);
}

/** Sell fill after slippage (price moves against us). */
export function slippedSellPrice(price: number, c: CostsConfig): number {
  return price * (1 - c.slippageBps / 10_000);
}

/** Total charges for a full round trip (one buy, one sell) excluding slippage. */
export function roundTripCharges(buyValue: number, sellValue: number, c: CostsConfig): number {
  return buyCharges(buyValue, c).total + sellCharges(sellValue, c).total;
}
