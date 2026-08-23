import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();

vi.mock("../supabase", () => ({
  supabase: { from: (...args) => fromMock(...args) },
}));

beforeEach(() => {
  fromMock.mockReset();
});

describe("listCourses", () => {
  it("selects id/name/location/holes_count ordered by name", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "c1", name: "La Valmuza" }], error: null });
    const select = vi.fn(() => ({ order }));
    fromMock.mockReturnValue({ select });

    const { listCourses } = await import("./courses");
    const result = await listCourses();

    expect(fromMock).toHaveBeenCalledWith("courses");
    expect(select).toHaveBeenCalledWith("id, name, location, holes_count");
    expect(order).toHaveBeenCalledWith("name");
    expect(result).toEqual([{ id: "c1", name: "La Valmuza" }]);
  });

  it("throws on a Supabase error", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("network") });
    fromMock.mockReturnValue({ select: () => ({ order }) });

    const { listCourses } = await import("./courses");
    await expect(listCourses()).rejects.toThrow("network");
  });
});

describe("listCourseHoles", () => {
  it("filters by course_id, orders by hole_number", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ hole_number: 1, par: 5 }], error: null });
    const eq = vi.fn(() => ({ order }));
    const select = vi.fn(() => ({ eq }));
    fromMock.mockReturnValue({ select });

    const { listCourseHoles } = await import("./courses");
    const result = await listCourseHoles("c1");

    expect(select).toHaveBeenCalledWith("hole_number, par, stroke_index, meters");
    expect(eq).toHaveBeenCalledWith("course_id", "c1");
    expect(result).toEqual([{ hole_number: 1, par: 5 }]);
  });
});
