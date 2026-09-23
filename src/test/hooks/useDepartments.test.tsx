import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import {
  useDepartments, useDepartmentsForLocations, useCompanyDepartments, useSaveDepartment, useDeleteDepartment,
} from "@/hooks/useDepartments";

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function makeSelectQuery(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("useDepartments", () => {
  it("reads the departments that apply to the given location from location_departments", async () => {
    const stored = [
      { id: "dep-1", location_id: "loc-1", name: "Bar" },
      { id: "dep-2", location_id: "loc-1", name: "Kitchen" },
    ];
    const query = makeSelectQuery(stored);
    mockFrom.mockImplementation(() => query);

    const { result } = renderHook(() => useDepartments("loc-1"), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toEqual(stored));
    expect(mockFrom).toHaveBeenCalledWith("location_departments");
    expect(query.eq).toHaveBeenCalledWith("location_id", "loc-1");
  });

  it("is disabled (no query) when locationId is null", () => {
    mockFrom.mockImplementation(() => makeSelectQuery([]));
    const { result } = renderHook(() => useDepartments(null), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("useDepartmentsForLocations", () => {
  it("returns one entry per department even when it applies to several of the locations", async () => {
    const query = makeSelectQuery([
      { id: "dep-1", location_id: "loc-1", name: "Bar" },
      { id: "dep-1", location_id: "loc-2", name: "Bar" },
      { id: "dep-2", location_id: "loc-2", name: "Kitchen" },
    ]);
    mockFrom.mockImplementation(() => query);

    const { result } = renderHook(() => useDepartmentsForLocations(["loc-2", "loc-1"]), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toEqual([
      { id: "dep-1", name: "Bar" },
      { id: "dep-2", name: "Kitchen" },
    ]));
    expect(mockFrom).toHaveBeenCalledWith("location_departments");
    expect(query.in).toHaveBeenCalledWith("location_id", ["loc-1", "loc-2"]);
  });

  it("is disabled (no query) when the location list is empty", () => {
    mockFrom.mockImplementation(() => makeSelectQuery([]));
    const { result } = renderHook(() => useDepartmentsForLocations([]), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("useCompanyDepartments", () => {
  it("returns every department with its assignments", async () => {
    mockFrom.mockImplementation(() => makeSelectQuery([
      { id: "dep-1", name: "Bar", department_assignments: [{ concept_id: "c1", location_id: null }] },
      { id: "dep-2", name: "Kitchen", department_assignments: null },
    ]));

    const { result } = renderHook(() => useCompanyDepartments(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toEqual([
      { id: "dep-1", name: "Bar", assignments: [{ concept_id: "c1", location_id: null }] },
      { id: "dep-2", name: "Kitchen", assignments: [] },
    ]));
    expect(mockFrom).toHaveBeenCalledWith("departments");
  });
});

describe("useSaveDepartment", () => {
  it("inserts a new department, then sets its assignments", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "dep-new" }, error: null });
    const insertMock = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    mockFrom.mockImplementation(() => ({ insert: insertMock }));
    mockRpc.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useSaveDepartment(), { wrapper: makeWrapper() });
    const assignments = [{ concept_id: "c1", location_id: null }];

    await act(async () => {
      await result.current.mutateAsync({ name: "Barista", assignments });
    });

    expect(insertMock).toHaveBeenCalledWith({ name: "Barista" });
    expect(mockRpc).toHaveBeenCalledWith("set_department_assignments", {
      p_department_id: "dep-new", p_assignments: assignments,
    });
  });

  it("renames an existing department, then sets its assignments", async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockFrom.mockImplementation(() => ({ update: updateMock }));
    mockRpc.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useSaveDepartment(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: "dep-1", name: "Front of House", assignments: [] });
    });

    expect(updateMock).toHaveBeenCalledWith({ name: "Front of House" });
    expect(eqMock).toHaveBeenCalledWith("id", "dep-1");
    expect(mockRpc).toHaveBeenCalledWith("set_department_assignments", { p_department_id: "dep-1", p_assignments: [] });
  });

  it("surfaces an RPC error", async () => {
    mockFrom.mockImplementation(() => ({ update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }) }));
    mockRpc.mockResolvedValue({ error: new Error("Only the Owner can change department assignments.") });

    const { result } = renderHook(() => useSaveDepartment(), { wrapper: makeWrapper() });

    await expect(result.current.mutateAsync({ id: "dep-1", name: "Bar", assignments: [] }))
      .rejects.toThrow("Only the Owner");
  });
});

describe("useDeleteDepartment", () => {
  it("deletes through the delete_department RPC (which also prunes links)", async () => {
    mockRpc.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useDeleteDepartment(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: "dep-1" });
    });

    expect(mockRpc).toHaveBeenCalledWith("delete_department", { p_department_id: "dep-1" });
  });
});
