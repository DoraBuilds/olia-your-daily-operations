import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import {
  useFolders,
  useSaveFolder,
  useDeleteFolder,
  useReorderFolders,
  useChecklists,
  useSaveChecklist,
  useDeleteChecklist,
} from "@/hooks/useChecklists";

const mockFrom = vi.fn();
const mockRpc = vi.fn().mockResolvedValue({ data: { id: "new-id" }, error: null });

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    session: null,
    teamMember: {
      id: "u1",
      organization_id: "org1",
      name: "Sarah",
      email: "s@test.com",
      role: "Owner",
      location_ids: [],
      permissions: {},
    },
    loading: false,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
    delete: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((cb) =>
      Promise.resolve(cb({ data: [], error: null }))
    ),
  });
});

describe("useFolders", () => {
  it("returns isLoading property", () => {
    const { result } = renderHook(() => useFolders(), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty("isLoading");
  });

  it("returns empty array when supabase returns no data", async () => {
    const { result } = renderHook(() => useFolders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data ?? []).toEqual([]);
  });

  it("calls supabase.from with 'folders'", async () => {
    const { result } = renderHook(() => useFolders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith("folders");
  });

  it("returns folder data when supabase returns items", async () => {
    const mockFolders = [
      { id: "f1", name: "Daily Operations", parent_id: null, location_id: null, sort_order: 0 },
    ];
    // order() must be chainable (return this) because useFolders calls .order() twice.
    // Resolve via the thenable `then` on the mock object.
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb: any) =>
        Promise.resolve(cb({ data: mockFolders, error: null }))
      ),
    };
    mockFrom.mockReturnValue(builder);
    const { result } = renderHook(() => useFolders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].name).toBe("Daily Operations");
  });

  it("data is an array", async () => {
    const { result } = renderHook(() => useFolders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(Array.isArray(result.current.data ?? [])).toBe(true);
  });
});

describe("useSaveFolder", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useSaveFolder(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useSaveFolder(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });

  it("returns a mutateAsync function", () => {
    const { result } = renderHook(() => useSaveFolder(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutateAsync).toBe("function");
  });
});

describe("useDeleteFolder", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useDeleteFolder(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useDeleteFolder(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});

describe("useReorderFolders", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useReorderFolders(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("calls update with correct sort_order for each folder", async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFrom.mockReturnValue({ update });

    const { result } = renderHook(() => useReorderFolders(), { wrapper: makeWrapper() });
    await result.current.mutateAsync([
      { id: "f1", sort_order: 0 },
      { id: "f2", sort_order: 1 },
    ]);

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({ sort_order: 0 });
    expect(update).toHaveBeenCalledWith({ sort_order: 1 });
  });
});

describe("useChecklists", () => {
  it("returns isLoading property", () => {
    const { result } = renderHook(() => useChecklists(), { wrapper: makeWrapper() });
    expect(result.current).toHaveProperty("isLoading");
  });

  it("returns empty array when supabase returns no data", async () => {
    const { result } = renderHook(() => useChecklists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data ?? []).toEqual([]);
  });

  it("calls supabase.from with 'checklists'", async () => {
    const { result } = renderHook(() => useChecklists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith("checklists");
  });

  it("returns checklist data when supabase returns items", async () => {
    const mockChecklists = [
      {
        id: "cl-1",
        organization_id: "org1",
        title: "Opening Checklist",
        folder_id: null,
        location_id: null,
        start_date: "2026-04-08",
        schedule: "daily",
        sections: [],
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ];
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockChecklists, error: null }),
    });
    const { result } = renderHook(() => useChecklists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].title).toBe("Opening Checklist");
  });

  it("data is an array", async () => {
    const { result } = renderHook(() => useChecklists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(Array.isArray(result.current.data ?? [])).toBe(true);
  });
});

describe("useSaveChecklist", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useSaveChecklist(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useSaveChecklist(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });

  it("returns a mutateAsync function", () => {
    const { result } = renderHook(() => useSaveChecklist(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutateAsync).toBe("function");
  });

  it("persists a checklist start date when saving", async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: "cl-1" }, error: null });

    const { result } = renderHook(() => useSaveChecklist(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({
      id: "cl-1",
      title: "Opening Checklist",
      start_date: "2026-04-08",
      sections: [],
    } as any);

    expect(mockRpc).toHaveBeenCalledWith("save_checklist", expect.objectContaining({
      p_id: "cl-1",
      p_start_date: "2026-04-08",
    }));
  });

  it("persists location_ids when saving a checklist", async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: "cl-2" }, error: null });

    const { result } = renderHook(() => useSaveChecklist(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({
      id: "cl-2",
      title: "Closing Checklist",
      location_ids: ["loc-1", "loc-2"],
      sections: [],
    } as any);

    expect(mockRpc).toHaveBeenCalledWith("save_checklist", expect.objectContaining({
      p_id: "cl-2",
      p_location_ids: ["loc-1", "loc-2"],
    }));
  });

  it("saves location_ids as null when not provided", async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: "cl-3" }, error: null });

    const { result } = renderHook(() => useSaveChecklist(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({
      id: "cl-3",
      title: "Opening Checklist",
      sections: [],
    } as any);

    expect(mockRpc).toHaveBeenCalledWith("save_checklist", expect.objectContaining({
      p_location_ids: null,
    }));
  });

  it("defaults p_is_published to false when not provided", async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: "cl-4" }, error: null });

    const { result } = renderHook(() => useSaveChecklist(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({
      id: "cl-4",
      title: "New Checklist",
      sections: [],
    } as any);

    expect(mockRpc).toHaveBeenCalledWith("save_checklist", expect.objectContaining({
      p_is_published: false,
    }));
  });

  it("passes p_is_published through when explicitly set", async () => {
    mockRpc.mockResolvedValueOnce({ data: { id: "cl-5" }, error: null });

    const { result } = renderHook(() => useSaveChecklist(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({
      id: "cl-5",
      title: "Live Checklist",
      sections: [],
      is_published: true,
    } as any);

    expect(mockRpc).toHaveBeenCalledWith("save_checklist", expect.objectContaining({
      p_is_published: true,
    }));
  });
});

describe("useDeleteChecklist", () => {
  it("returns a mutate function", () => {
    const { result } = renderHook(() => useDeleteChecklist(), { wrapper: makeWrapper() });
    expect(typeof result.current.mutate).toBe("function");
  });

  it("is not pending by default", () => {
    const { result } = renderHook(() => useDeleteChecklist(), { wrapper: makeWrapper() });
    expect(result.current.isPending).toBe(false);
  });
});
