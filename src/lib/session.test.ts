import { describe, expect, it } from "vitest";
import { makeSession, safeNext, validSession } from "./session";

describe("login cookie", () => {
  it("accepts its own cookie, and nothing forged, expired or signed with another key", async () => {
    const now = Date.parse("2026-11-16T07:00:00Z");
    const { value, maxAge } = await makeSession("k1", now);
    expect(maxAge).toBe(60 * 86_400);
    expect(await validSession("k1", value, now)).toBe(true);
    expect(await validSession("k2", value, now)).toBe(false);
    expect(await validSession("k1", value, now + 61 * 86_400_000)).toBe(false);
    const [exp, sig] = value.split(".");
    expect(await validSession("k1", `${Number(exp) + 1}.${sig}`, now)).toBe(false);
    expect(await validSession("k1", undefined, now)).toBe(false);
    expect(await validSession("k1", "garbage", now)).toBe(false);
  });

  it("only goes back to pages on this site after login", () => {
    expect(safeNext("/stock/SAREGAMA?x=1")).toBe("/stock/SAREGAMA?x=1");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
