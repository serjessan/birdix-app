import { describe, it, expect } from "vitest";
import { CARDS, applyStablefordCardEffect, isCardPlayable, cardNeedsTarget } from "./cards";

describe("CARDS", () => {
  it("has exactly 10 cards", () => {
    expect(CARDS).toHaveLength(10);
  });

  it("no longer includes the cards cut from the reglamento on 10 ago 2026", () => {
    const ids = CARDS.map((c) => c.id);
    expect(ids).not.toContain("clean-point");
    expect(ids).not.toContain("pressure");
  });
});

describe("applyStablefordCardEffect", () => {
  const card = (id) => CARDS.find((c) => c.id === id);
  const baseCtx = { playerHasScore: true, rivalHasScore: true, playerBase: 2, rivalBase: 1, playerNetDiff: 0, rivalNetDiff: 1, isBehind: false };

  it("double: multiplies player base points", () => {
    const fx = applyStablefordCardEffect(card("double"), baseCtx);
    expect(fx.delta).toBe(2);
  });

  it("steal: takes a point from the rival when player scores higher", () => {
    const fx = applyStablefordCardEffect(card("steal"), baseCtx);
    expect(fx.delta).toBe(1);
    expect(fx.rivalDelta).toBe(-1);
  });

  it("safe-hole: only pays out when the player scored zero", () => {
    const zeroCtx = { ...baseCtx, playerBase: 0 };
    expect(applyStablefordCardEffect(card("safe-hole"), zeroCtx).delta).toBe(1);
    expect(applyStablefordCardEffect(card("safe-hole"), baseCtx).delta).toBe(0);
  });

  it("birdix-prize: scales with how far under par the player finished", () => {
    expect(applyStablefordCardEffect(card("birdix-prize"), { ...baseCtx, playerNetDiff: -2 }).delta).toBe(3);
    expect(applyStablefordCardEffect(card("birdix-prize"), { ...baseCtx, playerNetDiff: -1 }).delta).toBe(2);
    expect(applyStablefordCardEffect(card("birdix-prize"), { ...baseCtx, playerNetDiff: 0 }).delta).toBe(0);
  });

  it("comeback: only pays out when behind AND winning the hole", () => {
    const behindAndWinning = { ...baseCtx, isBehind: true, playerBase: 3, rivalBase: 1 };
    expect(applyStablefordCardEffect(card("comeback"), behindAndWinning).delta).toBe(2);
    expect(applyStablefordCardEffect(card("comeback"), { ...behindAndWinning, isBehind: false }).delta).toBe(0);
  });

  it("no-scoring cards (block, shield, no-driver, no-club) never affect points", () => {
    ["block", "shield", "no-driver", "no-club"].forEach((id) => {
      const fx = applyStablefordCardEffect(card(id), baseCtx);
      expect(fx.delta).toBe(0);
      expect(fx.rivalDelta).toBe(0);
    });
  });

  it("no card played is a no-op", () => {
    expect(applyStablefordCardEffect(null, baseCtx)).toEqual({ delta: 0, rivalDelta: 0, note: null });
  });

  describe("second-shot (Segundo Golpe)", () => {
    it("does nothing until the second shot's points are known", () => {
      const fx = applyStablefordCardEffect(card("second-shot"), baseCtx);
      expect(fx.delta).toBe(0);
      expect(fx.rivalDelta).toBe(0);
    });

    it("counts the repeated stroke as final, even when it scores worse", () => {
      // playerBase: 2 (original stroke) → secondShotBase: 0 (repeated stroke came out worse)
      const worse = applyStablefordCardEffect(card("second-shot"), { ...baseCtx, secondShotBase: 0 });
      expect(worse.delta).toBe(-2);

      // repeated stroke scores better
      const better = applyStablefordCardEffect(card("second-shot"), { ...baseCtx, secondShotBase: 5 });
      expect(better.delta).toBe(3);
    });

    it("is a no-op when the repeated stroke scores the same", () => {
      const fx = applyStablefordCardEffect(card("second-shot"), { ...baseCtx, secondShotBase: baseCtx.playerBase });
      expect(fx.delta).toBe(0);
    });
  });

  describe("cancelledByBlock (Bloqueo rival)", () => {
    it("zeroes out any card's effect, including one that would otherwise score", () => {
      const fx = applyStablefordCardEffect(card("double"), { ...baseCtx, cancelledByBlock: true });
      expect(fx.delta).toBe(0);
      expect(fx.rivalDelta).toBe(0);
      expect(fx.note).toMatch(/Bloqueo/);
    });

    it("wins over every other gate — cancels even before checking for a submitted score", () => {
      const fx = applyStablefordCardEffect(card("steal"), { ...baseCtx, playerHasScore: false, cancelledByBlock: true });
      expect(fx.delta).toBe(0);
      expect(fx.note).toMatch(/Bloqueo/);
    });

    it("a card with no rival card to cancel resolves normally (not cancelled)", () => {
      const fx = applyStablefordCardEffect(card("double"), baseCtx);
      expect(fx.delta).toBe(baseCtx.playerBase);
    });
  });
});

describe("isCardPlayable", () => {
  const card = (id) => CARDS.find((c) => c.id === id);

  it("comeback is only selectable when behind", () => {
    expect(isCardPlayable(card("comeback"), { isBehind: true })).toBe(true);
    expect(isCardPlayable(card("comeback"), { isBehind: false })).toBe(false);
  });

  it("every other card is always selectable in a neutral match state", () => {
    CARDS.filter((c) => c.id !== "comeback").forEach((c) => {
      expect(isCardPlayable(c, { isBehind: false })).toBe(true);
      expect(isCardPlayable(c, { isBehind: true })).toBe(true);
    });
  });

  it("blocks every card, no exception, once a card was already played this hole", () => {
    CARDS.forEach((c) => {
      expect(isCardPlayable(c, { alreadyPlayedThisHole: true, isBehind: true })).toBe(false);
    });
  });

  it("blocks every card against a rival with Escudo active, no exception", () => {
    CARDS.forEach((c) => {
      expect(isCardPlayable(c, { rivalShieldActive: true, isBehind: true })).toBe(false);
    });
  });

  it("a normal hole with neither gate active allows a normal selection", () => {
    expect(isCardPlayable(card("double"), { alreadyPlayedThisHole: false, rivalShieldActive: false })).toBe(true);
  });
});

describe("cardNeedsTarget", () => {
  it("matches the real hyphenated card ids, not the old underscore typo", () => {
    expect(cardNeedsTarget("no-driver")).toBe(true);
    expect(cardNeedsTarget("no-club")).toBe(true);
    expect(cardNeedsTarget("no_driver")).toBe(false);
    expect(cardNeedsTarget("no_club")).toBe(false);
  });

  it("steal and block need a target; scoring-only cards don't", () => {
    expect(cardNeedsTarget("steal")).toBe(true);
    expect(cardNeedsTarget("block")).toBe(true);
    expect(cardNeedsTarget("double")).toBe(false);
  });
});
