import { describe, it, expect } from "vitest";
import { deriveHoleView, bothPlayersDecided, computeBaseHoleScores, applyCardToBaseScore } from "./matchHoleView";
import { CARDS } from "./cards";

const card = (id) => CARDS.find((c) => c.id === id);

describe("deriveHoleView", () => {
  const baseRow = {
    hole_number: 3,
    player_a_strokes: 5,
    player_a_card: "double",
    player_a_card_confirmed: true,
    player_a_hole_submitted: true,
    player_b_strokes: null,
    player_b_card: "block",
    player_b_card_confirmed: true,
    player_b_hole_submitted: true,
    cards_revealed: false,
  };

  it("maps a/b onto my/rival correctly depending on which side I am", () => {
    const asA = deriveHoleView(baseRow, "player_a");
    expect(asA.my.strokes).toBe(5);
    expect(asA.my.card).toBe("double");
    expect(asA.rival.strokes).toBeNull();

    const asB = deriveHoleView(baseRow, "player_b");
    expect(asB.my.card).toBe("block");
    expect(asB.rival.strokes).toBe(5);
  });

  it("hides the rival's card until cards_revealed is true", () => {
    const view = deriveHoleView(baseRow, "player_a");
    expect(view.rival.card).toBeNull(); // block, but not revealed yet
    expect(view.cardsRevealed).toBe(false);
  });

  it("reveals the rival's card once cards_revealed is true", () => {
    const view = deriveHoleView({ ...baseRow, cards_revealed: true }, "player_a");
    expect(view.rival.card).toBe("block");
    expect(view.cardsRevealed).toBe(true);
  });

  it("Escudo is visible immediately, never waits for cards_revealed", () => {
    const row = { ...baseRow, player_b_card: "shield", cards_revealed: false };
    const view = deriveHoleView(row, "player_a");
    expect(view.rival.card).toBe("shield");
    expect(view.cardsRevealed).toBe(true); // se deriva true por la presencia de shield
  });

  it("handles a completely empty row (hole not touched by anyone yet)", () => {
    const view = deriveHoleView({ hole_number: 1 }, "player_a");
    expect(view.my.card).toBeNull();
    expect(view.rival.card).toBeNull();
    expect(view.my.stableford).toBe(0);
    expect(view.cardsRevealed).toBe(false);
  });
});

describe("bothPlayersDecided", () => {
  it("false until both sides have confirmed a card or submitted the hole", () => {
    const view = { my: { cardConfirmed: true, holeSubmitted: false }, rival: { cardConfirmed: false, holeSubmitted: false } };
    expect(bothPlayersDecided(view)).toBe(false);
  });

  it("true once both are confirmed or submitted, in any combination", () => {
    expect(bothPlayersDecided({ my: { cardConfirmed: true, holeSubmitted: false }, rival: { cardConfirmed: false, holeSubmitted: true } })).toBe(true);
    expect(bothPlayersDecided({ my: { cardConfirmed: false, holeSubmitted: true }, rival: { cardConfirmed: false, holeSubmitted: true } })).toBe(true);
  });
});

describe("computeBaseHoleScores", () => {
  it("computes hcp strokes, net, and base Stableford points identically to the old single-device math", () => {
    const result = computeBaseHoleScores({
      par: 4,
      strokeIndex: 5,
      playerAHcp: 23,
      playerBHcp: 18,
      playerAStrokes: 4,
      playerBStrokes: 5,
    });
    // A: hcp diff 5, receives a stroke on index<=5 -> net 3 -> birdie neto -> 3pts
    expect(result.playerA).toMatchObject({ hasScore: true, hcpStrokes: 1, net: 3, base: 3 });
    // B: no stroke, net 5 -> bogey neto -> 1pt
    expect(result.playerB).toMatchObject({ hasScore: true, hcpStrokes: 0, net: 5, base: 1 });
  });

  it("a side with no stroke entered yet has hasScore:false and base 0", () => {
    const result = computeBaseHoleScores({ par: 4, strokeIndex: 1, playerAHcp: 18, playerBHcp: 18, playerAStrokes: "", playerBStrokes: 4 });
    expect(result.playerA).toMatchObject({ hasScore: false, net: null, base: 0 });
    expect(result.playerB.hasScore).toBe(true);
  });
});

describe("applyCardToBaseScore", () => {
  it("reuses applyStablefordCardEffect as-is — double doubles the base", () => {
    const fx = applyCardToBaseScore(card("double"), { base: 2, rivalBase: 1, netDiff: 0, rivalNetDiff: 1, hasScore: true, rivalHasScore: true, isBehind: false });
    expect(fx.delta).toBe(2);
  });

  it("cancelledByBlock zeroes the effect even for a normally-scoring card", () => {
    const fx = applyCardToBaseScore(card("double"), { base: 2, rivalBase: 1, netDiff: 0, rivalNetDiff: 1, hasScore: true, rivalHasScore: true, isBehind: false, cancelledByBlock: true });
    expect(fx.delta).toBe(0);
    expect(fx.note).toMatch(/Bloqueo/);
  });

  it("no card is a no-op", () => {
    expect(applyCardToBaseScore(null, { base: 2, hasScore: true })).toEqual({ delta: 0, rivalDelta: 0, note: null });
  });
});
