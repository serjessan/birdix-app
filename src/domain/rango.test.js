import { describe, it, expect } from "vitest";
import {
  calculateEloDelta,
  calculateBirdixHcpAfterMatch,
  calculateBirdixHcpCalibration,
  REAL_HCP_CALIBRATION_MATCHES,
  calculateStreakAfterMatch,
  normalizeBirdixHcp,
} from "./rango";

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

describe("calculateBirdixHcpCalibration", () => {
  it("D20: las 4 primeras partidas no mueven el hcp, solo acumulan margen", () => {
    let profile = { birdixHcp: 18, realMatchesPlayed: 0, pendingHcpMargin: 0 };
    for (let i = 0; i < REAL_HCP_CALIBRATION_MATCHES - 1; i++) {
      const result = calculateBirdixHcpCalibration(profile, { holes: 18, playerPoints: 44 }); // margen +8 cada vez
      expect(result.calibrating).toBe(true);
      expect(result.hcp).toBe(18); // sin cambio todavía
      profile = { birdixHcp: result.hcp, realMatchesPlayed: result.realMatchesPlayed, pendingHcpMargin: result.pendingHcpMargin };
    }
    expect(profile.realMatchesPlayed).toBe(REAL_HCP_CALIBRATION_MATCHES - 1);
    expect(profile.pendingHcpMargin).toBe(8 * (REAL_HCP_CALIBRATION_MATCHES - 1));
  });

  it("la partida que cruza el umbral aplica de golpe el margen acumulado de las 5, con el hcp resultante fuera del rango del tope de una sola partida", () => {
    // 4 partidas con margen +8 cada una ya acumuladas (32 en total) + esta 5ª
    // partida también +8 → margen conjunto de 40, muy por encima de lo que
    // permitiría el tope de ±1.5 de una sola partida.
    const profile = { birdixHcp: 18, realMatchesPlayed: REAL_HCP_CALIBRATION_MATCHES - 1, pendingHcpMargin: 32 };
    const result = calculateBirdixHcpCalibration(profile, { holes: 18, playerPoints: 44 });

    expect(result.calibrating).toBe(false);
    expect(result.realMatchesPlayed).toBe(REAL_HCP_CALIBRATION_MATCHES);
    expect(result.pendingHcpMargin).toBe(0);
    // margen total 40 → ajuste -40/8 = -5, dentro del tope de ±7.5 (1.5*5)
    expect(result.hcp).toBe(normalizeBirdixHcp(18 - 5));
  });

  it("el salto de calibración respeta su propio tope, más amplio que el de una partida suelta", () => {
    const profile = { birdixHcp: 18, realMatchesPlayed: REAL_HCP_CALIBRATION_MATCHES - 1, pendingHcpMargin: 200 };
    const result = calculateBirdixHcpCalibration(profile, { holes: 18, playerPoints: 90 });
    expect(result.hcp).toBe(normalizeBirdixHcp(18 - 1.5 * REAL_HCP_CALIBRATION_MATCHES));
  });

  it("a partir de la partida 6 vuelve al ajuste incremental normal, partida a partida", () => {
    const profile = { birdixHcp: 16.5, realMatchesPlayed: REAL_HCP_CALIBRATION_MATCHES, pendingHcpMargin: 0 };
    const result = calculateBirdixHcpCalibration(profile, { holes: 18, playerPoints: 60 });
    expect(result.calibrating).toBe(false);
    expect(result.realMatchesPlayed).toBe(REAL_HCP_CALIBRATION_MATCHES + 1);
    expect(result.hcp).toBe(calculateBirdixHcpAfterMatch({ birdixHcp: 16.5 }, { holes: 18, playerPoints: 60 }));
  });

  it("perfiles sin las columnas nuevas (cuentas existentes) empiezan a calibrar desde cero, sin reventar", () => {
    const result = calculateBirdixHcpCalibration({ birdixHcp: 20 }, { holes: 9, playerPoints: 30 });
    expect(result.calibrating).toBe(true);
    expect(result.hcp).toBe(20);
    expect(result.realMatchesPlayed).toBe(1);
  });

  it("sin partida (consulta de solo lectura) devuelve el estado actual sin mutarlo", () => {
    const result = calculateBirdixHcpCalibration({ birdixHcp: 12, realMatchesPlayed: 2, pendingHcpMargin: 4 }, null);
    expect(result).toEqual({ hcp: 12, realMatchesPlayed: 2, pendingHcpMargin: 4, calibrating: true });
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
