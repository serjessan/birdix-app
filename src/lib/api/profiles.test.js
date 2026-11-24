import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
vi.mock("../supabase", () => ({ supabase: { from: (...a) => fromMock(...a) } }));

beforeEach(() => {
  vi.resetModules();
  fromMock.mockReset();
});

describe("listRankedPlayers", () => {
  const mockTopQuery = (rows, error = null) => {
    const limit = vi.fn().mockResolvedValue({ data: rows, error });
    const order2 = vi.fn(() => ({ limit }));
    const order1 = vi.fn(() => ({ order: order2 }));
    const gt = vi.fn(() => ({ order: order1 }));
    const select = vi.fn(() => ({ gt }));
    fromMock.mockReturnValue({ select });
    return { select, gt, order1, order2, limit };
  };

  it("solo lista jugadores que ya han jugado una partida real", async () => {
    const { gt } = mockTopQuery([]);
    const { listRankedPlayers } = await import("./profiles");
    await listRankedPlayers();
    expect(gt).toHaveBeenCalledWith("real_matches_played", 0);
  });

  it("ordena por puntos desc y desempata por antigüedad de cuenta", async () => {
    const { order1, order2 } = mockTopQuery([]);
    const { listRankedPlayers } = await import("./profiles");
    await listRankedPlayers();
    expect(order1).toHaveBeenCalledWith("points", { ascending: false });
    expect(order2).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("devuelve [] cuando nadie ha jugado todavía — es el estado vacío, no un error", async () => {
    mockTopQuery([]);
    const { listRankedPlayers } = await import("./profiles");
    await expect(listRankedPlayers()).resolves.toEqual([]);
  });

  it("respeta el límite por defecto de 10 y uno explícito", async () => {
    const { limit } = mockTopQuery([]);
    const { listRankedPlayers, RANKING_TOP_SIZE } = await import("./profiles");
    await listRankedPlayers();
    expect(limit).toHaveBeenCalledWith(RANKING_TOP_SIZE);
    await listRankedPlayers(3);
    expect(limit).toHaveBeenLastCalledWith(3);
  });

  it("propaga el error de Supabase", async () => {
    mockTopQuery(null, new Error("network"));
    const { listRankedPlayers } = await import("./profiles");
    await expect(listRankedPlayers()).rejects.toThrow("network");
  });
});

describe("getMyRankingPosition", () => {
  const mockCountQuery = (count, error = null) => {
    const or = vi.fn().mockResolvedValue({ count, error });
    const gt = vi.fn(() => ({ or }));
    const select = vi.fn(() => ({ gt }));
    fromMock.mockReturnValue({ select });
    return { select, gt, or };
  };

  it("devuelve null sin partidas jugadas, SIN consultar — los 5 jugadores a 1000 y 0 partidas no son todos el nº1", async () => {
    const { getMyRankingPosition } = await import("./profiles");
    await expect(
      getMyRankingPosition({ points: 1000, realMatchesPlayed: 0, createdAt: "2026-11-04T08:44:59Z" })
    ).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("devuelve null si falta createdAt (no se puede desempatar de forma estable)", async () => {
    const { getMyRankingPosition } = await import("./profiles");
    await expect(getMyRankingPosition({ points: 1000, realMatchesPlayed: 3 })).resolves.toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("cuenta a los que van por delante con el MISMO criterio que la lista (puntos, y empate por antigüedad)", async () => {
    const { or, gt } = mockCountQuery(2);
    const { getMyRankingPosition } = await import("./profiles");
    const pos = await getMyRankingPosition({
      points: 1180,
      realMatchesPlayed: 4,
      createdAt: "2026-11-04T10:06:04Z",
    });

    expect(gt).toHaveBeenCalledWith("real_matches_played", 0);
    expect(or).toHaveBeenCalledWith(
      "points.gt.1180,and(points.eq.1180,created_at.lt.2026-11-04T10:06:04Z)"
    );
    expect(pos).toBe(3); // 2 por delante → puesto 3
  });

  it("el primero de la clasificación es el puesto 1, no el 0", async () => {
    mockCountQuery(0);
    const { getMyRankingPosition } = await import("./profiles");
    await expect(
      getMyRankingPosition({ points: 1500, realMatchesPlayed: 9, createdAt: "2026-11-04T08:44:59Z" })
    ).resolves.toBe(1);
  });

  it("trata un count nulo como 0 por delante", async () => {
    mockCountQuery(null);
    const { getMyRankingPosition } = await import("./profiles");
    await expect(
      getMyRankingPosition({ points: 1000, realMatchesPlayed: 1, createdAt: "2026-11-04T08:44:59Z" })
    ).resolves.toBe(1);
  });

  it("propaga el error de Supabase", async () => {
    mockCountQuery(null, new Error("down"));
    const { getMyRankingPosition } = await import("./profiles");
    await expect(
      getMyRankingPosition({ points: 1000, realMatchesPlayed: 1, createdAt: "2026-11-04T08:44:59Z" })
    ).rejects.toThrow("down");
  });
});
