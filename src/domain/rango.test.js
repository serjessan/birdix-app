import { describe, it, expect } from "vitest";
import { calculateEloDelta, calculateBirdixHcpAfterMatch, calculateStreakAfterMatch, normalizeBirdixHcp } from "./rango";

describe("calculateEloDelta", () => {
  it("win as favorite gains fewer points than an underdog win", () => {
    const favoriteWin = calculateEloDelta(1200, 1000, "win");
    const underdogWin = calculateEloDelta(1000, 1200, "win");
    expect(favoriteWin).toBeLessThan(underdogWin);
  });

  it("equal ranks split 16/-16 on a win", () => {
    expect(calculateEloDelta(1000, 1000, "win")).toBe(16);
    expect(calculateEloDelta(1000, 1000, "loss")).toBe(-16);
  });

  it("loss as favorite loses more than loss as underdog", () => {
    const favoriteLoss = calculateEloDelta(1200, 1000, "loss");
    const underdogLoss = calculateEloDelta(1000, 1200, "loss");
    expect(favoriteLoss).toBeLessThan(underdogLoss);
    expect(favoriteLoss).toBeLessThan(0);
  });

  it("draw is always zero, regardless of rank gap", () => {
    expect(calculateEloDelta(1000, 1000, "draw")).toBe(0);
    expect(calculateEloDelta(1500, 800, "draw")).toBe(0);
  });

  it("clamps negative or NaN rank input via toRankingPoints", () => {
    expect(() => calculateEloDelta(-50, NaN, "win")).not.toThrow();
    expect(Number.isFinite(calculateEloDelta(-50, NaN, "win"))).toBe(true);
  });
});

describe("calculateBirdixHcpAfterMatch", () => {
  const profile = { birdixHcp: 18 };

  it("large positive margin lowers hcp, capped at -1.5", () => {
    const result = calculateBirdixHcpAfterMatch(profile, { holes: 18, playerPoints: 60 });
    expect(result).toBe(normalizeBirdixHcp(18 - 1.5));
  });

  it("small positive margin lowers hcp proportionally, no cap hit", () => {
    const result = calculateBirdixHcpAfterMatch(profile, { holes: 18, playerPoints: 38 });
    expect(result).toBe(normalizeBirdixHcp(18 - 2 / 8));
  });

  it("negative margin raises hcp, capped at +1.5", () => {
    const result = calculateBirdixHcpAfterMatch(profile, { holes: 18, playerPoints: 10 });
    expect(result).toBe(normalizeBirdixHcp(18 + 1.5));
  });

  it("margin near zero barely moves the hcp", () => {
    const result = calculateBirdixHcpAfterMatch(profile, { holes: 18, playerPoints: 36 });
    expect(result).toBeCloseTo(18, 5);
  });

  it("result stays within [0, 36]", () => {
    const highHcp = calculateBirdixHcpAfterMatch({ birdixHcp: 35.8 }, { holes: 18, playerPoints: 0 });
    expect(highHcp).toBeLessThanOrEqual(36);
    const lowHcp = calculateBirdixHcpAfterMatch({ birdixHcp: 0.2 }, { holes: 18, playerPoints: 90 });
    expect(lowHcp).toBeGreaterThanOrEqual(0);
  });

  it("scales expected points with holes played (9 vs 18)", () => {
    const nineHoles = calculateBirdixHcpAfterMatch(profile, { holes: 9, playerPoints: 26 });
    const eighteenHoles = calculateBirdixHcpAfterMatch(profile, { holes: 18, playerPoints: 26 });
    // Same raw points, but 26 over a 9-hole round (expected 18) is a much
    // bigger positive margin than over an 18-hole round (expected 36).
    expect(nineHoles).toBeLessThan(eighteenHoles);
  });
});

describe("calculateStreakAfterMatch", () => {
  const profile = { wins: 3, losses: 2, winStreak: 2, lossStreak: 0 };

  it("win: +1 win, win streak extends, loss streak resets", () => {
    const withLossStreak = { wins: 1, losses: 4, winStreak: 0, lossStreak: 3 };
    expect(calculateStreakAfterMatch(withLossStreak, "win")).toEqual({ wins: 2, losses: 4, winStreak: 1, lossStreak: 0 });
    expect(calculateStreakAfterMatch(profile, "win")).toEqual({ wins: 4, losses: 2, winStreak: 3, lossStreak: 0 });
  });

  it("loss: +1 loss, loss streak extends, win streak resets", () => {
    expect(calculateStreakAfterMatch(profile, "loss")).toEqual({ wins: 3, losses: 3, winStreak: 0, lossStreak: 1 });
  });

  it("draw: nothing changes", () => {
    expect(calculateStreakAfterMatch(profile, "draw")).toEqual({ wins: 3, losses: 2, winStreak: 2, lossStreak: 0 });
  });

  it("missing/non-numeric fields default to 0", () => {
    expect(calculateStreakAfterMatch({}, "win")).toEqual({ wins: 1, losses: 0, winStreak: 1, lossStreak: 0 });
    expect(calculateStreakAfterMatch(undefined, "loss")).toEqual({ wins: 0, losses: 1, winStreak: 0, lossStreak: 1 });
  });
});
