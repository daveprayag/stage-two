import { describe, expect, it } from "vitest";
import { chooseFilings, growth, needsCheck, parseFilingList, parseResultsXbrl, quarterLabel, resultsLine, stockResults } from "./financials";

const ctx = (id: string, s: string, e: string, seg = "") =>
  `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier>${seg}</xbrli:entity><xbrli:period><xbrli:startDate>${s}</xbrli:startDate><xbrli:endDate>${e}</xbrli:endDate></xbrli:period></xbrli:context>`;
const xml = [
  ctx("OneD", "2026-07-01", "2026-09-30"),
  ctx("FourD", "2026-04-01", "2026-09-30"),
  ctx("Seg1", "2026-07-01", "2026-09-30", "<xbrli:segment><xbrldi:explicitMember dimension=\"a\">b</xbrldi:explicitMember></xbrli:segment>"),
  `<in-capmkt:RevenueFromOperations contextRef="Seg1" unitRef="INR" decimals="-5">999</in-capmkt:RevenueFromOperations>`,
  `<in-capmkt:RevenueFromOperations contextRef="FourD" unitRef="INR" decimals="-5">14308173000</in-capmkt:RevenueFromOperations>`,
  `<in-capmkt:RevenueFromOperations contextRef="OneD" unitRef="INR" decimals="-5">6515667000</in-capmkt:RevenueFromOperations>`,
  `<in-capmkt:ProfitLossForPeriod contextRef="OneD" unitRef="INR" decimals="-5">100443000</in-capmkt:ProfitLossForPeriod>`,
  `<in-capmkt:ProfitOrLossAttributableToOwnersOfParent contextRef="OneD" unitRef="INR" decimals="-5">-5000000</in-capmkt:ProfitOrLossAttributableToOwnersOfParent>`,
].join("");

describe("results filings", () => {
  it("reads the quarter's revenue and total profit, ignoring year-to-date and segment figures", () => {
    expect(parseResultsXbrl(xml, "2026-09-30")).toEqual({ revenueCr: 651.57, revenueKind: "operations", profitCr: 10.04, months: 3 });
    // The half-year context (FourD) stands in only when there is no quarter at all.
    expect(parseResultsXbrl(xml.replace("id=\"OneD\"", "id=\"X\""), "2026-09-30")).toEqual({ revenueCr: 1430.82, revenueKind: "operations", profitCr: null, months: 6 });
    expect(parseResultsXbrl(xml, "2026-12-31")).toEqual({ revenueCr: null, revenueKind: null, profitCr: null });
  });

  it("treats a 0 as not filled and falls back to the next profit figure", () => {
    const zero = xml.replace(">100443000<", ">0<");
    expect(parseResultsXbrl(zero, "2026-09-30").profitCr).toBe(-0.5);
  });

  it("keeps the latest broadcast per quarter and basis, and pairs the year-ago quarter on the same basis", () => {
    const row = (qe: string, basis: string, at: string, url: string, type = "Integrated Filing- Financials") =>
      ({ type, qe_Date: qe, consolidated: basis, broadcast_Date: at, xbrl: `${url}.xml` });
    const list = parseFilingList({ data: [
      row("30-SEP-2026", "Standalone", "05-Nov-2026 21:44:07", "s26"),
      row("30-SEP-2026", "Consolidated", "05-Nov-2026 21:50:00", "c26a"),
      row("30-SEP-2026", "Consolidated", "06-Nov-2026 10:00:00", "c26b"),
      row("30-SEP-2025", "Standalone", "10-Nov-2025 10:00:00", "s25"),
      row("30-SEP-2026", "", "05-Nov-2026 21:44:07", "gov", "Integrated Filing- Governance"),
    ] });
    expect(list.map((f) => f.xbrl)).toEqual(expect.arrayContaining(["c26b.xml", "s26.xml", "s25.xml"]));
    expect(list).toHaveLength(3);
    const pick = chooseFilings(list)!;
    expect([pick.now.xbrl, pick.yearAgo?.xbrl]).toEqual(["s26.xml", "s25.xml"]);
  });

  it("describes the quarter with growth only against a positive base", () => {
    expect(growth(120, 100)).toBe(20);
    expect(growth(5, -3)).toBeNull();
    expect(quarterLabel("2026-09-30")).toBe("Q2 FY27");
    expect(quarterLabel("2026-03-31")).toBe("Q4 FY26");
    const r = stockResults({ qe: "2026-09-30", basis: "Standalone", xbrl: "x", filed: "2026-11-05" },
      { revenueCr: 651.57, revenueKind: "operations", profitCr: 10.04 }, { revenueCr: 580, revenueKind: "operations", profitCr: -2 });
    expect(resultsLine(r)).toBe("Q2 FY27 standalone results (filed 2026-11-05): revenue ₹652 Cr (+12% YoY, from ₹580 Cr); net profit ₹10 Cr (from ₹-2 Cr a year earlier)");
  });

  it("looks again after a results meeting, monthly otherwise, and weekly for stocks with no filing", () => {
    const e = { qe: "2026-06-30", basis: "Standalone" as const, filed: "2026-08-03", now: { revenueCr: 1, revenueKind: "operations" as const, profitCr: 1 }, yearAgo: null, revenueYoY: null, profitYoY: null, checked: "2026-11-01T00:00:00Z" };
    expect(needsCheck(e, ["2026-11-05"], "2026-11-11")).toBe(true);
    expect(needsCheck(e, ["2026-10-20"], "2026-11-11")).toBe(false);
    expect(needsCheck({ ...e, filed: "2026-11-05" }, ["2026-11-05"], "2026-11-11")).toBe(false);
    expect(needsCheck(e, [], "2026-12-05")).toBe(true);
    expect(needsCheck(undefined, [], "2026-11-11", "2026-11-08T00:00:00Z")).toBe(false);
    expect(needsCheck(undefined, [], "2026-11-11")).toBe(true);
  });
});
