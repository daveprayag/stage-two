import { describe, expect, it } from "vitest";
import { attachSince, SINCE_GAP, updateSince } from "./since";
import type { ScreenRow } from "./types";

const S = Array.from({ length: 40 }, (_, k) => new Date(Date.UTC(2026, 0, 1 + k)).toISOString().slice(0, 10));

function run(onList: boolean[]) {
  let st = null;
  for (let k = 0; k < onList.length; k++) st = updateSince(st, S[k]!, S, onList[k] ? ["INE1"] : []);
  return st!;
}

describe("momentum since", () => {
  it("keeps a stretch through short breaks and restarts after a long one", () => {
    const short = run([false, true, true, ...Array(SINCE_GAP).fill(false), true]);
    expect(short.runs.INE1).toEqual({ start: S[1], last: S[SINCE_GAP + 3] });
    const long = run([false, true, true, ...Array(SINCE_GAP + 1).fill(false), true]);
    expect(long.runs.INE1).toEqual({ start: S[SINCE_GAP + 4], last: S[SINCE_GAP + 4] });
  });

  it("is unchanged by a re-run of the same session and ignores older sessions", () => {
    const a = run([true, true, true]);
    expect(updateSince(a, S[2]!, S, ["INE1"])).toEqual(a);
    expect(updateSince(a, S[1]!, S, [])).toBe(a);
    expect(a.from).toBe(S[0]);
  });

  it("drops stretches whose break has run past the gap", () => {
    const st = run([true, ...Array(SINCE_GAP + 1).fill(false)]);
    expect(st.runs.INE1).toBeUndefined();
  });

  it("adds the stretch start and its close to rows on the list only", () => {
    const st = run([false, true, true]);
    const rows = [
      { isin: "INE1", tags: ["momentum"] },
      { isin: "INE2", tags: ["leader"] },
    ] as unknown as ScreenRow[];
    attachSince(rows, st, (isin, d) => (isin === "INE1" && d === S[1] ? 100 : null));
    expect(rows[0]!.momentumSince).toEqual({ date: S[1], close: 100, orEarlier: false });
    expect(rows[1]!.momentumSince).toBeNull();
  });
});
