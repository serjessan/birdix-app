import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("../supabase", () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe("findRivalCandidates", () => {
  it("returns [] without querying for an empty/blank query", async () => {
    const { findRivalCandidates } = await import("./matches");
    expect(await findRivalCandidates("")).toEqual([]);
    expect(await findRivalCandidates("   ")).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("searches profiles by name, excludes the given user, limited to 20", async () => {
    const neq = vi.fn().mockResolvedValue({ data: [{ id: "r1", full_name: "Carlos" }], error: null });
    const limit = vi.fn(() => ({ neq }));
    const order = vi.fn(() => ({ limit }));
    const ilike = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ ilike }));
    fromMock.mockReturnValue({ select });

    const { findRivalCandidates } = await import("./matches");
    const result = await findRivalCandidates("carlos", { excludeUserId: "me" });

    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(ilike).toHaveBeenCalledWith("full_name", "%carlos%");
    expect(limit).toHaveBeenCalledWith(20);
    expect(neq).toHaveBeenCalledWith("id", "me");
    expect(result).toEqual([{ id: "r1", full_name: "Carlos" }]);
  });

  it("throws on a Supabase error", async () => {
    const neq = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") });
    fromMock.mockReturnValue({ select: () => ({ ilike: () => ({ order: () => ({ limit: () => ({ neq }) }) }) }) });

    const { findRivalCandidates } = await import("./matches");
    await expect(findRivalCandidates("x", { excludeUserId: "me" })).rejects.toThrow("boom");
  });
});

describe("listMatchHoles", () => {
  it("selects all columns for the match, ordered by hole_number", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ hole_number: 1 }, { hole_number: 2 }], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ select });

    const { listMatchHoles } = await import("./matches");
    const result = await listMatchHoles("match-1");

    expect(fromMock).toHaveBeenCalledWith("match_holes");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("match_id", "match-1");
    expect(order).toHaveBeenCalledWith("hole_number");
    expect(result).toEqual([{ hole_number: 1 }, { hole_number: 2 }]);
  });

  it("throws on a Supabase error", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("network") });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });

    const { listMatchHoles } = await import("./matches");
    await expect(listMatchHoles("match-1")).rejects.toThrow("network");
  });
});

describe("markMatchOpened", () => {
  it("marca opened_at solo si todavía no estaba (D23)", async () => {
    const is = vi.fn().mockResolvedValue({ error: null });
    const eq2 = vi.fn(() => ({ is }));
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    fromMock.mockReturnValue({ update });

    const { markMatchOpened } = await import("./matches");
    await markMatchOpened({ matchId: "match-1", userId: "me" });

    expect(fromMock).toHaveBeenCalledWith("match_players");
    expect(update.mock.calls[0][0]).toMatchObject({});
    expect(update.mock.calls[0][0].opened_at).toBeTruthy();
    expect(eq1).toHaveBeenCalledWith("match_id", "match-1");
    expect(eq2).toHaveBeenCalledWith("user_id", "me");
    expect(is).toHaveBeenCalledWith("opened_at", null);
  });

  it("throws on a Supabase error", async () => {
    const is = vi.fn().mockResolvedValue({ error: new Error("network") });
    fromMock.mockReturnValue({ update: () => ({ eq: () => ({ eq: () => ({ is }) }) }) });

    const { markMatchOpened } = await import("./matches");
    await expect(markMatchOpened({ matchId: "match-1", userId: "me" })).rejects.toThrow("network");
  });
});

describe("getMatchPlayersStatus", () => {
  it("returns both sides' join status", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { side: "player_a", user_id: "me", opened_at: "2026-08-25T10:00:00Z", deck_confirmed_at: "2026-08-25T10:00:00Z" },
        { side: "player_b", user_id: "rival-1", opened_at: null, deck_confirmed_at: null },
      ],
      error: null,
    });
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ select });

    const { getMatchPlayersStatus } = await import("./matches");
    const result = await getMatchPlayersStatus("match-1");

    expect(fromMock).toHaveBeenCalledWith("match_players");
    expect(eq).toHaveBeenCalledWith("match_id", "match-1");
    expect(result[1]).toEqual({ side: "player_b", user_id: "rival-1", opened_at: null, deck_confirmed_at: null });
  });

  it("throws on a Supabase error", async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: new Error("network") });
    fromMock.mockReturnValue({ select: () => ({ eq }) });

    const { getMatchPlayersStatus } = await import("./matches");
    await expect(getMatchPlayersStatus("match-1")).rejects.toThrow("network");
  });
});

describe("listMyActiveMatches", () => {
  const mockActiveMatchesQuery = (rows) => {
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    return { select, eq, order };
  };

  it("normalizes an active match row into the shape the app expects, from the creator's side", async () => {
    const { select } = mockActiveMatchesQuery([
      {
        id: "match-1",
        course_id: "c1",
        status: "active",
        format: "stableford_1v1",
        started_at: "2026-08-23T00:00:00Z",
        courses: { name: "La Valmuza", location: "Salamanca" },
        match_players: [
          { side: "player_a", user_id: "me", points_before: 1000, birdix_hcp_at_match: 18, selected_cards: ["double", "block"], profiles: { full_name: "Me" } },
          { side: "player_b", user_id: "rival-1", points_before: 1120, birdix_hcp_at_match: 12.5, selected_cards: [], profiles: { full_name: "Carlos" } },
        ],
        match_holes: Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1 })),
      },
    ]);
    fromMock.mockReturnValue({ select });

    const { listMyActiveMatches } = await import("./matches");
    const result = await listMyActiveMatches("me");

    expect(fromMock).toHaveBeenCalledWith("matches");
    expect(result).toEqual([
      {
        id: "match-1",
        courseId: "c1",
        course: "La Valmuza",
        holes: 9,
        playerSide: "player_a",
        playerBirdixHcp: 18,
        rivalId: "rival-1",
        rivalName: "Carlos",
        rivalRank: 1120,
        rivalBirdixHcp: 12.5,
        rivalHcp: 12.5,
        selectedCards: ["double", "block"],
        matchType: "1v1",
        format: "1 vs 1",
        status: "pending",
        isRealMatch: true,
      },
    ]);
  });

  it("normalizes correctly from the non-creator's side too (playerSide: player_b)", async () => {
    const { select } = mockActiveMatchesQuery([
      {
        id: "match-1",
        course_id: "c1",
        status: "active",
        format: "stableford_1v1",
        started_at: "2026-08-23T00:00:00Z",
        courses: { name: "La Valmuza", location: "Salamanca" },
        match_players: [
          { side: "player_a", user_id: "rival-1", points_before: 1000, birdix_hcp_at_match: 18, selected_cards: ["double"], profiles: { full_name: "Carlos" } },
          { side: "player_b", user_id: "me", points_before: 1000, birdix_hcp_at_match: 18, selected_cards: [], profiles: { full_name: "Me" } },
        ],
        match_holes: Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1 })),
      },
    ]);
    fromMock.mockReturnValue({ select });

    const { listMyActiveMatches } = await import("./matches");
    const result = await listMyActiveMatches("me");

    expect(result[0].playerSide).toBe("player_b");
    expect(result[0].rivalId).toBe("rival-1");
    expect(result[0].rivalName).toBe("Carlos");
  });

  it("drops a row where I'm not actually a participant instead of throwing", async () => {
    const { select } = mockActiveMatchesQuery([
      {
        id: "match-1",
        match_players: [
          { side: "player_a", user_id: "someone-else", profiles: {} },
          { side: "player_b", user_id: "someone-else-2", profiles: {} },
        ],
        match_holes: [],
        courses: {},
      },
    ]);
    fromMock.mockReturnValue({ select });

    const { listMyActiveMatches } = await import("./matches");
    expect(await listMyActiveMatches("me")).toEqual([]);
  });

  it("throws on a Supabase error", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("network") });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });

    const { listMyActiveMatches } = await import("./matches");
    await expect(listMyActiveMatches("me")).rejects.toThrow("network");
  });
});

describe("listMyMatchHistory", () => {
  const mockHistoryQuery = (rows) => {
    const order = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    return { select, eq, order };
  };

  it("D22: recalcula los puntos sumando match_holes (total_stableford nunca se escribe) y determina el resultado por winner_id", async () => {
    const { select } = mockHistoryQuery([
      {
        id: "match-1",
        course_id: "c1",
        status: "confirmed",
        format: "stableford_1v1",
        started_at: "2026-08-20T10:00:00Z",
        finished_at: "2026-08-20T13:00:00Z",
        winner_id: "me",
        courses: { name: "La Valmuza", location: "Salamanca" },
        match_players: [
          { side: "player_a", user_id: "me", points_before: 1000, points_after: 1016, birdix_hcp_at_match: 18, profiles: { full_name: "Me" } },
          { side: "player_b", user_id: "rival-1", points_before: 1000, points_after: 984, birdix_hcp_at_match: 12.5, profiles: { full_name: "Carlos" } },
        ],
        match_holes: [
          { hole_number: 1, player_a_card: "double", player_b_card: null, player_a_stableford: 4, player_b_stableford: 2 },
          { hole_number: 2, player_a_card: null, player_b_card: "block", player_a_stableford: 2, player_b_stableford: 3 },
        ],
      },
    ]);
    fromMock.mockReturnValue({ select });

    const { listMyMatchHistory } = await import("./matches");
    const result = await listMyMatchHistory("me");

    expect(fromMock).toHaveBeenCalledWith("matches");
    expect(result).toEqual([
      {
        id: "match-1",
        matchType: "1v1",
        format: "1 vs 1",
        holes: 2,
        courseId: "c1",
        course: "La Valmuza",
        date: "2026-08-20T13:00:00Z",
        status: "finished",
        result: "win",
        playerSide: "player_a",
        playerHcp: 18,
        playerBirdixHcp: 18,
        playerPoints: 6, // 4 + 2
        rivalId: "rival-1",
        rivalName: "Carlos",
        rivalHcp: 12.5,
        rivalBirdixHcp: 12.5,
        rivalPoints: 5, // 2 + 3
        rankingDelta: 16, // 1016 - 1000
        cardsUsed: ["double"],
        finishedAt: "2026-08-20T13:00:00Z",
        isRealMatch: true,
      },
    ]);
  });

  it("resultado 'loss'/'draw' según winner_id, visto desde el lado player_b", async () => {
    const { select } = mockHistoryQuery([
      {
        id: "match-1",
        match_players: [
          { side: "player_a", user_id: "rival-1", points_before: 1000, points_after: 1010, birdix_hcp_at_match: 18, profiles: { full_name: "Carlos" } },
          { side: "player_b", user_id: "me", points_before: 1000, points_after: 990, birdix_hcp_at_match: 18, profiles: { full_name: "Me" } },
        ],
        match_holes: [],
        winner_id: "rival-1",
        courses: {},
      },
      {
        id: "match-2",
        match_players: [
          { side: "player_a", user_id: "rival-1", points_before: 1000, points_after: 1000, birdix_hcp_at_match: 18, profiles: { full_name: "Carlos" } },
          { side: "player_b", user_id: "me", points_before: 1000, points_after: 1000, birdix_hcp_at_match: 18, profiles: { full_name: "Me" } },
        ],
        match_holes: [],
        winner_id: null,
        courses: {},
      },
    ]);
    fromMock.mockReturnValue({ select });

    const { listMyMatchHistory } = await import("./matches");
    const result = await listMyMatchHistory("me");

    expect(result[0].result).toBe("loss");
    expect(result[0].playerSide).toBe("player_b");
    expect(result[1].result).toBe("draw");
  });

  it("drops a row where I'm not actually a participant instead of throwing", async () => {
    const { select } = mockHistoryQuery([
      { id: "match-1", match_players: [{ side: "player_a", user_id: "x", profiles: {} }, { side: "player_b", user_id: "y", profiles: {} }], match_holes: [], courses: {} },
    ]);
    fromMock.mockReturnValue({ select });

    const { listMyMatchHistory } = await import("./matches");
    expect(await listMyMatchHistory("me")).toEqual([]);
  });

  it("throws on a Supabase error", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("network") });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });

    const { listMyMatchHistory } = await import("./matches");
    await expect(listMyMatchHistory("me")).rejects.toThrow("network");
  });
});

describe("createMatch", () => {
  it("calls create_match RPC, then reads both sides via get_match_context, embeds rival info", async () => {
    rpcMock.mockImplementation((name) => {
      if (name === "create_match") return Promise.resolve({ data: "match-1", error: null });
      if (name === "get_match_context") {
        return Promise.resolve({
          data: [
            { side: "player_a", user_id: "me", points_before: 1000, birdix_hcp_at_match: 18 },
            { side: "player_b", user_id: "rival-1", points_before: 1120, birdix_hcp_at_match: 12.5 },
          ],
          error: null,
        });
      }
      throw new Error("unexpected rpc " + name);
    });

    const { createMatch } = await import("./matches");
    const result = await createMatch({
      courseId: "c1",
      courseName: "La Valmuza",
      rivalId: "rival-1",
      rivalName: "Carlos",
      holesCount: 9,
      selectedCards: ["double", "block"],
    });

    expect(rpcMock).toHaveBeenCalledWith("create_match", {
      p_course_id: "c1",
      p_player_b_id: "rival-1",
      p_holes_count: 9,
      p_selected_cards_a: ["double", "block"],
    });
    expect(result).toEqual({
      id: "match-1",
      courseId: "c1",
      course: "La Valmuza",
      rivalId: "rival-1",
      rivalName: "Carlos",
      rivalRank: 1120,
      rivalBirdixHcp: 12.5,
      holes: 9,
    });
  });

  it("throws on an RPC error (e.g. deck size rejected)", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error("selected_cards_a must have exactly 2 cards") });
    const { createMatch } = await import("./matches");
    await expect(
      createMatch({ courseId: "c1", rivalId: "r1", holesCount: 9, selectedCards: ["double"] })
    ).rejects.toThrow("selected_cards_a");
  });
});

describe("confirmMatchResult", () => {
  const baseArgs = {
    matchId: "match-1",
    userId: "me",
    playerSide: "player_a",
    holes: 9,
    result: "win",
    playerPoints: 20,
    rivalPoints: 14,
  };

  const mockConfirmationsInsert = (error = null) => {
    const insert = vi.fn().mockResolvedValue({ error });
    return insert;
  };

  const mockConfirmationsCount = (count) => {
    const eq = vi.fn().mockResolvedValue({ count, error: null });
    const select = vi.fn(() => ({ eq }));
    return { select, eq };
  };

  it("inserts my confirmation, returns applied:false while only 1 of 2 confirmations exist", async () => {
    const insert = mockConfirmationsInsert();
    const { select } = mockConfirmationsCount(1);
    fromMock.mockReturnValue({ insert, select });

    const { confirmMatchResult } = await import("./matches");
    const result = await confirmMatchResult(baseArgs);

    expect(fromMock).toHaveBeenCalledWith("match_confirmations");
    expect(insert).toHaveBeenCalledWith({ match_id: "match-1", user_id: "me" });
    expect(result).toEqual({ applied: false });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("treats a duplicate confirmation (unique violation) as a no-op, not an error", async () => {
    const insert = mockConfirmationsInsert({ code: "23505", message: "duplicate key" });
    const { select } = mockConfirmationsCount(1);
    fromMock.mockReturnValue({ insert, select });

    const { confirmMatchResult } = await import("./matches");
    await expect(confirmMatchResult(baseArgs)).resolves.toEqual({ applied: false });
  });

  it("propagates a real insert error (not a duplicate)", async () => {
    const insert = mockConfirmationsInsert({ code: "500", message: "network down" });
    fromMock.mockReturnValue({ insert });

    const { confirmMatchResult } = await import("./matches");
    await expect(confirmMatchResult(baseArgs)).rejects.toThrow("network down");
  });

  const mockProfilesLookup = (rows) => {
    const inFn = vi.fn().mockResolvedValue({ data: rows, error: null });
    const select = vi.fn(() => ({ in: inFn }));
    return { select, inFn };
  };

  const mockFromByTable = (tableHandlers) => {
    fromMock.mockImplementation((table) => {
      if (tableHandlers[table]) return tableHandlers[table];
      throw new Error("unexpected table " + table);
    });
  };

  it("with 2 confirmations: reads context + live profiles, computes with rango.js, applies via RPC with correct a/b sides", async () => {
    const insert = mockConfirmationsInsert();
    const { select: confirmSelect } = mockConfirmationsCount(2);
    const { select: profilesSelect } = mockProfilesLookup([
      { id: "me", points: 1000, birdix_hcp: 18, wins: 0, losses: 0, win_streak: 0, loss_streak: 0 },
      { id: "rival-1", points: 1000, birdix_hcp: 18, wins: 0, losses: 0, win_streak: 0, loss_streak: 0 },
    ]);
    mockFromByTable({
      match_confirmations: { insert, select: confirmSelect },
      profiles: { select: profilesSelect },
    });

    rpcMock.mockImplementation((name) => {
      if (name === "get_match_context") {
        return Promise.resolve({
          data: [
            { side: "player_a", user_id: "me", points_before: 1000, birdix_hcp_at_match: 18 },
            { side: "player_b", user_id: "rival-1", points_before: 1000, birdix_hcp_at_match: 18 },
          ],
          error: null,
        });
      }
      if (name === "apply_match_result") {
        return Promise.resolve({ error: null });
      }
      throw new Error("unexpected rpc " + name);
    });

    const { confirmMatchResult } = await import("./matches");
    const result = await confirmMatchResult(baseArgs);

    expect(result.applied).toBe(true);
    // equal ranks, win -> +16 for me (matches calculateEloDelta(1000,1000,"win") === 16)
    expect(result.delta).toBe(16);
    expect(result.newPoints).toBe(1016);

    const applyCall = rpcMock.mock.calls.find(([name]) => name === "apply_match_result");
    expect(applyCall[1]).toMatchObject({
      p_match_id: "match-1",
      p_new_points_a: 1016, // "me" is player_a here
      p_new_points_b: 984,
      p_new_wins_a: 1,
      p_new_losses_a: 0,
      p_new_win_streak_a: 1,
      p_new_wins_b: 0,
      p_new_losses_b: 1,
      p_new_loss_streak_b: 1,
    });
  });

  it("maps sides correctly when I am player_b", async () => {
    const insert = mockConfirmationsInsert();
    const { select: confirmSelect } = mockConfirmationsCount(2);
    const { select: profilesSelect } = mockProfilesLookup([
      { id: "me", points: 1000, birdix_hcp: 18, wins: 0, losses: 0, win_streak: 0, loss_streak: 0 },
      { id: "rival-1", points: 1000, birdix_hcp: 18, wins: 0, losses: 0, win_streak: 0, loss_streak: 0 },
    ]);
    mockFromByTable({
      match_confirmations: { insert, select: confirmSelect },
      profiles: { select: profilesSelect },
    });

    rpcMock.mockImplementation((name) => {
      if (name === "get_match_context") {
        return Promise.resolve({
          data: [
            { side: "player_a", user_id: "rival-1", points_before: 1000, birdix_hcp_at_match: 18 },
            { side: "player_b", user_id: "me", points_before: 1000, birdix_hcp_at_match: 18 },
          ],
          error: null,
        });
      }
      if (name === "apply_match_result") return Promise.resolve({ error: null });
      throw new Error("unexpected rpc " + name);
    });

    const { confirmMatchResult } = await import("./matches");
    const result = await confirmMatchResult({ ...baseArgs, playerSide: "player_b" });

    expect(result.applied).toBe(true);
    const applyCall = rpcMock.mock.calls.find(([name]) => name === "apply_match_result");
    expect(applyCall[1].p_new_points_b).toBe(1016); // "me" is player_b here
    expect(applyCall[1].p_new_points_a).toBe(984);
  });

  it("D20: en calibración (< 5 partidas reales), el hcp no se mueve pero real_matches_played/pending_hcp_margin sí se envían a la RPC", async () => {
    const insert = mockConfirmationsInsert();
    const { select: confirmSelect } = mockConfirmationsCount(2);
    const { select: profilesSelect } = mockProfilesLookup([
      { id: "me", points: 1000, birdix_hcp: 18, wins: 0, losses: 0, win_streak: 0, loss_streak: 0, real_matches_played: 1, pending_hcp_margin: 2 },
      { id: "rival-1", points: 1000, birdix_hcp: 18, wins: 0, losses: 0, win_streak: 0, loss_streak: 0, real_matches_played: 0, pending_hcp_margin: 0 },
    ]);
    mockFromByTable({
      match_confirmations: { insert, select: confirmSelect },
      profiles: { select: profilesSelect },
    });

    rpcMock.mockImplementation((name) => {
      if (name === "get_match_context") {
        return Promise.resolve({
          data: [
            { side: "player_a", user_id: "me", points_before: 1000, birdix_hcp_at_match: 18 },
            { side: "player_b", user_id: "rival-1", points_before: 1000, birdix_hcp_at_match: 18 },
          ],
          error: null,
        });
      }
      if (name === "apply_match_result") return Promise.resolve({ error: null });
      throw new Error("unexpected rpc " + name);
    });

    const { confirmMatchResult } = await import("./matches");
    // 9 hoyos, 20 puntos → esperado 18, margen +2. Con el margen previo (2)
    // acumulado, sigue por debajo de las 5 partidas de calibración (llega a 2).
    const result = await confirmMatchResult(baseArgs);

    expect(result.applied).toBe(true);
    expect(result.hcpCalibrating).toBe(true);
    expect(result.realMatchesPlayed).toBe(2);
    expect(result.newBirdixHcp).toBe(18); // sin cambio todavía, en calibración

    const applyCall = rpcMock.mock.calls.find(([name]) => name === "apply_match_result");
    expect(applyCall[1]).toMatchObject({
      p_new_hcp_a: 18,
      p_new_real_matches_played_a: 2,
      p_new_pending_hcp_margin_a: 4, // margen previo 2 + margen de esta partida 2
      p_new_real_matches_played_b: 1,
    });
  });

  it("throws if apply_match_result RPC errors (e.g. not zero-sum, or DB rejects)", async () => {
    const insert = mockConfirmationsInsert();
    const { select: confirmSelect } = mockConfirmationsCount(2);
    const { select: profilesSelect } = mockProfilesLookup([
      { id: "me", points: 1000, birdix_hcp: 18, wins: 0, losses: 0, win_streak: 0, loss_streak: 0 },
      { id: "rival-1", points: 1000, birdix_hcp: 18, wins: 0, losses: 0, win_streak: 0, loss_streak: 0 },
    ]);
    mockFromByTable({
      match_confirmations: { insert, select: confirmSelect },
      profiles: { select: profilesSelect },
    });

    rpcMock.mockImplementation((name) => {
      if (name === "get_match_context") {
        return Promise.resolve({
          data: [
            { side: "player_a", user_id: "me", points_before: 1000, birdix_hcp_at_match: 18 },
            { side: "player_b", user_id: "rival-1", points_before: 1000, birdix_hcp_at_match: 18 },
          ],
          error: null,
        });
      }
      if (name === "apply_match_result") return Promise.resolve({ error: new Error("rejected") });
      throw new Error("unexpected rpc " + name);
    });

    const { confirmMatchResult } = await import("./matches");
    await expect(confirmMatchResult(baseArgs)).rejects.toThrow("rejected");
  });
});

describe("confirmDeck", () => {
  it("updates my own match_players row (match_id + user_id), never someone else's", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn(() => ({ eq: eq2 }));
    const update = vi.fn(() => ({ eq: eq1 }));
    fromMock.mockReturnValue({ update });

    const { confirmDeck } = await import("./matches");
    await confirmDeck({ matchId: "match-1", userId: "me", selectedCards: ["double", "block"] });

    expect(fromMock).toHaveBeenCalledWith("match_players");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ selected_cards: ["double", "block"] }));
    expect(eq1).toHaveBeenCalledWith("match_id", "match-1");
    expect(eq2).toHaveBeenCalledWith("user_id", "me");
  });

  it("throws on a Supabase error", async () => {
    const eq2 = vi.fn().mockResolvedValue({ error: new Error("RLS denied") });
    fromMock.mockReturnValue({ update: () => ({ eq: () => ({ eq: eq2 }) }) });

    const { confirmDeck } = await import("./matches");
    await expect(confirmDeck({ matchId: "match-1", userId: "me", selectedCards: [] })).rejects.toThrow("RLS denied");
  });
});
