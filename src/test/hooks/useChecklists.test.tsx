import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import {
  useFolders,
  useSaveFolder,
  useDeleteFolder,
  useChecklists,
  useSaveChecklist,
  useDeleteChecklist,
} from "@/hooks/useChecklists";

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: (...args: any[]) => mockFrom(...args),
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
      { id: "f1", name: "Daily Operations", parent_id: null, location_id: null },
    ];
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockFolders, error: null }),
    });
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
    const upsert = vi.fn().mockResolvedValue({ data: [{ id: "cl-1" }], error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
      update: vi.fn().mockReturnThis(),
      upsert,
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) =>
        Promise.resolve(cb({ data: [], error: null }))
      ),
    });

    const { result } = renderHook(() => useSaveChecklist(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({
      id: "cl-1",
      title: "Opening Checklist",
      start_date: "2026-04-08",
      sections: [],
    } as any);

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      start_date: "2026-04-08",
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
