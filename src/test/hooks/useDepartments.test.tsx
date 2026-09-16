import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useDepartments, useSaveDepartment, useDeleteDepartment } from "@/hooks/useDepartments";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
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
    order: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

beforeEach(() => {
  mockFrom.mockReset();
});

describe("useDepartments", () => {
  it("returns departments scoped to the given location", async () => {
    const stored = [
      { id: "dep-1", location_id: "loc-1", name: "Bar" },
      { id: "dep-2", location_id: "loc-1", name: "Kitchen" },
    ];
    mockFrom.mockImplementation(() => makeSelectQuery(stored));

    const { result } = renderHook(() => useDepartments("loc-1"), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toEqual(stored));
    expect(mockFrom).toHaveBeenCalledWith("departments");
  });

  it("is disabled (no query) when locationId is null", () => {
    mockFrom.mockImplementation(() => makeSelectQuery([]));
    const { result } = renderHook(() => useDepartments(null), { wrapper: makeWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("useSaveDepartment", () => {
  it("inserts a new department when no id is given", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockImplementation(() => ({ insert: insertMock }));

    const { result } = renderHook(() => useSaveDepartment(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ location_id: "loc-1", name: "Barista" });
    });

    expect(insertMock).toHaveBeenCalledWith({ location_id: "loc-1", name: "Barista" });
  });

  it("updates an existing department's name when id is given", async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockFrom.mockImplementation(() => ({ update: updateMock }));

    const { result } = renderHook(() => useSaveDepartment(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: "dep-1", location_id: "loc-1", name: "Front of House" });
    });

    expect(updateMock).toHaveBeenCalledWith({ name: "Front of House" });
    expect(eqMock).toHaveBeenCalledWith("id", "dep-1");
  });
});

describe("useDeleteDepartment", () => {
  it("deletes a department by id", async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockFrom.mockImplementation(() => ({ delete: deleteMock }));

    const { result } = renderHook(() => useDeleteDepartment(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: "dep-1", location_id: "loc-1" });
    });

    expect(deleteMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith("id", "dep-1");
  });
});
