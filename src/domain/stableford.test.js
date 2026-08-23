import { describe, it, expect } from "vitest";
import { hasStrokeInput, calculateStablefordPoints, getHandicapStrokesForHole, strokesForIndex } from "./stableford";

describe("strokesForIndex", () => {
  it("no strokes when the hcp difference is 0", () => {
    expect(strokesForIndex(0, 1)).toBe(0);
  });

  it("1 stroke on holes at or below the difference's stroke index", () => {
    expect(strokesForIndex(5, 5)).toBe(1);
    expect(strokesForIndex(5, 6)).toBe(0);
  });

  it("a 2nd stroke on the hardest holes once the difference passes 18", () => {
    expect(strokesForIndex(22, 4)).toBe(2);
    expect(strokesForIndex(22, 5)).toBe(1);
  });
});

describe("hasStrokeInput", () => {
  it("true for finite numeric values, including 0 and numeric strings", () => {
    expect(hasStrokeInput(4)).toBe(true);
    expect(hasStrokeInput(0)).toBe(true);
    expect(hasStrokeInput("5")).toBe(true);
  });

  it("false for empty/null/undefined/NaN", () => {
    expect(hasStrokeInput("")).toBe(false);
    expect(hasStrokeInput(null)).toBe(false);
    expect(hasStrokeInput(undefined)).toBe(false);
    expect(hasStrokeInput("abc")).toBe(false);
  });
});

describe("calculateStablefordPoints", () => {
  it("matches BIRDIX_REGLAMENTO.md §2's table exactly", () => {
    expect(calculateStablefordPoints(1, 4)).toBe(5); // 3 bajo par o mejor
    expect(calculateStablefordPoints(2, 4)).toBe(4); // 2 bajo par
    expect(calculateStablefordPoints(3, 4)).toBe(3); // birdie neto
    expect(calculateStablefordPoints(4, 4)).toBe(2); // par
    expect(calculateStablefordPoints(5, 4)).toBe(1); // bogey neto
    expect(calculateStablefordPoints(6, 4)).toBe(0); // 2+ sobre par
    expect(calculateStablefordPoints(10, 4)).toBe(0);
  });
});

describe("getHandicapStrokesForHole", () => {
  it("equal hcp: nobody receives a stroke", () => {
    expect(getHandicapStrokesForHole(18, 18, 1)).toEqual({ player: 0, rival: 0 });
  });

  it("player has higher hcp: receives 1 stroke on the hardest holes up to the difference", () => {
    // diff of 5 -> strokes on stroke_index 1..5
    expect(getHandicapStrokesForHole(23, 18, 5).player).toBe(1);
    expect(getHandicapStrokesForHole(23, 18, 6).player).toBe(0);
    expect(getHandicapStrokesForHole(23, 18, 5).rival).toBe(0);
  });

  it("rival has higher hcp: rival receives the strokes instead", () => {
    expect(getHandicapStrokesForHole(18, 23, 5).rival).toBe(1);
    expect(getHandicapStrokesForHole(18, 23, 5).player).toBe(0);
  });

  it("a difference over 18 gives a 2nd stroke on the hardest holes (second full round)", () => {
    // birdixHcp caps at 36 (normalizeBirdixHcp) -> 36 vs 14 = diff of 22:
    // full round of 18 (every hole gets 1) + 4 extra -> holes 1-4 get a 2nd.
    expect(getHandicapStrokesForHole(36, 14, 1)).toEqual({ player: 2, rival: 0 });
    expect(getHandicapStrokesForHole(36, 14, 4)).toEqual({ player: 2, rival: 0 });
    expect(getHandicapStrokesForHole(36, 14, 5)).toEqual({ player: 1, rival: 0 });
  });
});
