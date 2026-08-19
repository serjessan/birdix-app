import { describe, it, expect } from "vitest";
import { resolveHoleCards, resolveMatchHoleRow } from "./holeResolution";
import { CARDS, applyStablefordCardEffect } from "./cards";

describe("resolveHoleCards", () => {
  it("no resuelve hasta que los dos jugadores han elegido", () => {
    expect(resolveHoleCards({ playerCard: "double", playerChoiceMade: true, rivalCard: null, rivalChoiceMade: false }).ready).toBe(false);
    expect(resolveHoleCards({ playerCard: null, playerChoiceMade: false, rivalCard: "block", rivalChoiceMade: true }).ready).toBe(false);
    expect(resolveHoleCards({ playerCard: null, playerChoiceMade: false, rivalCard: null, rivalChoiceMade: false }).ready).toBe(false);
  });

  it("A juega Todo o Nada, B juega Bloqueo: la carta de A queda anulada, la de B no cancela nada más", () => {
    const result = resolveHoleCards({
      playerCard: "double",
      playerChoiceMade: true,
      rivalCard: "block",
      rivalChoiceMade: true,
    });
    expect(result).toEqual({ ready: true, playerCancelled: true, rivalCancelled: false });
  });

  it("es simétrico: si es B quien tiene Todo o Nada y A quien juega Bloqueo, se anula el otro lado", () => {
    const result = resolveHoleCards({
      playerCard: "block",
      playerChoiceMade: true,
      rivalCard: "double",
      rivalChoiceMade: true,
    });
    expect(result).toEqual({ ready: true, playerCancelled: false, rivalCancelled: true });
  });

  it("Bloqueo contra Bloqueo no anula nada (ninguno tiene una carta real que cancelar)", () => {
    const result = resolveHoleCards({
      playerCard: "block",
      playerChoiceMade: true,
      rivalCard: "block",
      rivalChoiceMade: true,
    });
    expect(result).toEqual({ ready: true, playerCancelled: false, rivalCancelled: false });
  });

  it("Bloqueo sin carta rival que anular se gasta igual, sin efecto (no hay nada que cancelar)", () => {
    const result = resolveHoleCards({
      playerCard: "block",
      playerChoiceMade: true,
      rivalCard: null,
      rivalChoiceMade: true,
    });
    expect(result).toEqual({ ready: true, playerCancelled: false, rivalCancelled: false });
  });

  it("carta normal sin Bloqueo rival: no se anula nada", () => {
    const result = resolveHoleCards({
      playerCard: "double",
      playerChoiceMade: true,
      rivalCard: "steal",
      rivalChoiceMade: true,
    });
    expect(result).toEqual({ ready: true, playerCancelled: false, rivalCancelled: false });
  });

  it("ningún jugador juega carta este hoyo: resuelve, sin nada que anular", () => {
    const result = resolveHoleCards({
      playerCard: null,
      playerChoiceMade: true,
      rivalCard: null,
      rivalChoiceMade: true,
    });
    expect(result).toEqual({ ready: true, playerCancelled: false, rivalCancelled: false });
  });
});

describe("resolveHoleCards → applyStablefordCardEffect (integración de extremo a extremo)", () => {
  const card = (id) => CARDS.find((c) => c.id === id);
  const baseCtx = { playerHasScore: true, rivalHasScore: true, playerBase: 2, rivalBase: 1, playerNetDiff: 0, rivalNetDiff: 1, isBehind: false };

  it('caso del eng review: "A juega Todo o Nada, B juega Bloqueo" → ninguna aplica', () => {
    const resolution = resolveHoleCards({
      playerCard: "double",
      playerChoiceMade: true,
      rivalCard: "block",
      rivalChoiceMade: true,
    });

    const aFx = applyStablefordCardEffect(card("double"), { ...baseCtx, cancelledByBlock: resolution.playerCancelled });
    const bFx = applyStablefordCardEffect(card("block"), { ...baseCtx, cancelledByBlock: resolution.rivalCancelled });

    expect(aFx.delta).toBe(0);
    expect(aFx.rivalDelta).toBe(0);
    expect(bFx.delta).toBe(0);
    expect(bFx.rivalDelta).toBe(0);
  });

  it("sin Bloqueo de por medio, Todo o Nada sí aplica normalmente", () => {
    const resolution = resolveHoleCards({
      playerCard: "double",
      playerChoiceMade: true,
      rivalCard: "safe-hole",
      rivalChoiceMade: true,
    });

    const aFx = applyStablefordCardEffect(card("double"), { ...baseCtx, cancelledByBlock: resolution.playerCancelled });
    expect(aFx.delta).toBe(baseCtx.playerBase);
  });
});

describe("resolveMatchHoleRow", () => {
  it("no resuelve hasta que ambas columnas de elección están cerradas", () => {
    const row = {
      player_a_card: "double",
      player_a_card_confirmed: true,
      player_a_hole_submitted: false,
      player_b_card: null,
      player_b_card_confirmed: false,
      player_b_hole_submitted: false,
    };
    expect(resolveMatchHoleRow(row).ready).toBe(false);
  });

  it("una elección se da por cerrada con hole_submitted aunque no haya carta confirmada (entró el primer golpe)", () => {
    const row = {
      player_a_card: "double",
      player_a_card_confirmed: true,
      player_a_hole_submitted: false,
      player_b_card: null,
      player_b_card_confirmed: false,
      player_b_hole_submitted: true,
    };
    const result = resolveMatchHoleRow(row);
    expect(result.ready).toBe(true);
    expect(result.playerCancelled).toBe(false);
  });

  it('caso del eng review leído directamente desde una fila de match_holes', () => {
    const row = {
      player_a_card: "double",
      player_a_card_confirmed: true,
      player_a_hole_submitted: false,
      player_b_card: "block",
      player_b_card_confirmed: true,
      player_b_hole_submitted: false,
    };
    expect(resolveMatchHoleRow(row)).toEqual({ ready: true, playerCancelled: true, rivalCancelled: false });
  });
});
