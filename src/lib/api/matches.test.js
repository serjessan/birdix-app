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
