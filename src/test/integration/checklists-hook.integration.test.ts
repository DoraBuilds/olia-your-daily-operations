// @vitest-environment jsdom
/**
 * Integration tests: useChecklists, useSaveChecklist, useDeleteChecklist,
 *                    useFolders, useSaveFolder, useDeleteFolder
 *
 * Mocks the Supabase client but exercises the full React Query pipeline —
 * query key derivation, org-scoped filtering, mutation paths, and cache
 * invalidation.  No real Supabase instance is required.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useChecklists,
  useSaveChecklist,
  useDeleteChecklist,
  useFolders,
  useSaveFolder,
  useDeleteFolder,
} from "@/hooks/useChecklists";

// ── Stable mock references ─────────────────────────────────────────────────

const mockFrom = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut:            vi.fn().mockResolvedValue({}),
      getSession:         vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange:  vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user:       { id: "u-int-1" },
    session:    null,
    teamMember: {
      id:              "u-int-1",
      organization_id: "org-int-1",
      name:            "Integration Tester",
      email:           "integration@test.com",
      role:            "Owner",
      location_ids:    [],
      permissions:     {},
    },
    loading:  false,
    signOut:  vi.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

// ── Helpers ────────────────────────────────────────────────────────────────

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

const SAMPLE_CHECKLISTS = [
  {
    id: "cl-1",
    organization_id: "org-int-1",
    title: "Morning Opening",
    folder_id: null,
    location_id: null,
    location_ids: null,
    start_date: "2026-04-01",
    schedule: "daily",
    sections: [],
    time_of_day: "morning" as const,
    due_time: "09:00",
    visibility_from: null,
    visibility_until: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "cl-2",
    organization_id: "org-int-1",
    title: "Evening Close",
    folder_id: "f-1",
    location_id: "loc-1",
    location_ids: ["loc-1"],
    start_date: null,
    schedule: null,
    sections: [{ id: "s1", title: "Closing tasks", questions: [] }],
    time_of_day: "evening" as const,
    due_time: "22:00",
    visibility_from: null,
    visibility_until: null,
    created_at: "2026-01-02T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
  },
];

const SAMPLE_FOLDERS = [
  { id: "f-1", name: "Operations", parent_id: null, location_id: null },
  { id: "f-2", name: "HR",         parent_id: null, location_id: null },
];

// ── useChecklists ──────────────────────────────────────────────────────────

describe("useChecklists integration — React Query pipeline", () => {
  beforeEach(() => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: SAMPLE_CHECKLISTS, error: null }),
    });
  });

  it("resolves checklist data through the full React Query pipeline", async () => {
    const { result } = renderHook(() => useChecklists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.data).toHaveLength(2);
  });

  it("filters out checklists belonging to a different org", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({
        data: [
          ...SAMPLE_CHECKLISTS,
          { ...SAMPLE_CHECKLISTS[0], id: "cl-other", organization_id: "org-other" },
        ],
        error: null,
      }),
    });

    const { result } = renderHook(() => useChecklists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const ids = (result.current.data ?? []).map((c) => c.id);
    expect(ids).toContain("cl-1");
    expect(ids).toContain("cl-2");
    expect(ids).not.toContain("cl-other");
  });

  it("returns an empty array when Supabase returns no rows", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    const { result } = renderHook(() => useChecklists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([]);
  });

  it("surfaces isError when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } }),
    });

    const { result } = renderHook(() => useChecklists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(true);
  });

  it("preserves all ChecklistItem fields on returned objects", async () => {
    const { result } = renderHook(() => useChecklists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const first = result.current.data?.[0];
    expect(first).toMatchObject({
      id:           "cl-1",
      title:        "Morning Opening",
      due_time:     "09:00",
      time_of_day:  "morning",
      sections:     [],
    });
  });
});

// ── useSaveChecklist ───────────────────────────────────────────────────────

describe("useSaveChecklist integration — mutation pipeline", () => {
  let upsertFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    upsertFn = vi.fn().mockResolvedValue({ data: [{ id: "cl-1" }], error: null });

    // First call to from("locations") for access-check; second call is for the upsert
    mockFrom.mockImplementation((table: string) => {
      if (table === "locations") {
        return {
          select: vi.fn().mockResolvedValue({ data: [{ id: "loc-1" }], error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        order:  vi.fn().mockResolvedValue({ data: [], error: null }),
        upsert: upsertFn,
      };
    });
  });

  it("calls supabase upsert with the supplied title", async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveChecklist(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        title:      "New Checklist",
        sections:   [],
        folder_id:  null,
        location_id: null,
      } as any);
    });

    expect(upsertFn).toHaveBeenCalledTimes(1);
    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New Checklist", organization_id: "org-int-1" }),
    );
  });

  it("persists start_date when provided", async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveChecklist(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id:         "cl-1",
        title:      "Dated Checklist",
        start_date: "2026-04-08",
        sections:   [],
      } as any);
    });

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: "2026-04-08" }),
    );
  });

  it("always sends time_of_day = 'anytime' regardless of input", async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveChecklist(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        title:      "Morning Only",
        time_of_day: "morning",
        sections:   [],
      } as any);
    });

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ time_of_day: "anytime" }),
    );
  });

  it("throws when an inaccessible location_id is supplied", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "locations") {
        // Accessible locations do NOT include "loc-foreign"
        return {
          select: vi.fn().mockResolvedValue({ data: [{ id: "loc-1" }], error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        order:  vi.fn().mockResolvedValue({ data: [], error: null }),
        upsert: upsertFn,
      };
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveChecklist(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          title:       "Forbidden",
          location_id: "loc-foreign",
          sections:    [],
        } as any);
      }),
    ).rejects.toThrow(/does not belong/i);
  });

  it("does not call the location access-check when no location is supplied", async () => {
    const locationSelectSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "locations") {
        return { select: locationSelectSpy };
      }
      return {
        select: vi.fn().mockReturnThis(),
        order:  vi.fn().mockResolvedValue({ data: [], error: null }),
        upsert: upsertFn,
      };
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveChecklist(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: "No Location", sections: [] } as any);
    });

    expect(locationSelectSpy).not.toHaveBeenCalled();
  });
});

// ── useDeleteChecklist ─────────────────────────────────────────────────────

describe("useDeleteChecklist integration — mutation pipeline", () => {
  let deleteFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: deleteFn,
    });
  });

  it("calls supabase DELETE for the supplied checklist id", async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useDeleteChecklist(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("cl-1");
    });

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(false);
  });

  it("surfaces isError when Supabase returns an error on delete", async () => {
    deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: { message: "FK constraint" } }),
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: deleteFn,
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useDeleteChecklist(), { wrapper });

    await act(async () => {
      result.current.mutate("cl-bad");
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ── useFolders ─────────────────────────────────────────────────────────────

describe("useFolders integration — React Query pipeline", () => {
  beforeEach(() => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: SAMPLE_FOLDERS, error: null }),
    });
  });

  it("returns all folders from Supabase", async () => {
    const { result } = renderHook(() => useFolders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.map((f) => f.name)).toContain("Operations");
  });

  it("surfaces isError when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
    });

    const { result } = renderHook(() => useFolders(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(true);
  });
});

// ── useSaveFolder ──────────────────────────────────────────────────────────

describe("useSaveFolder integration — mutation pipeline", () => {
  let upsertFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    upsertFn = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert: upsertFn,
    });
  });

  it("calls supabase upsert with the supplied folder name and org id", async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveFolder(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "New Category", parent_id: null });
    });

    expect(upsertFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New Category", organization_id: "org-int-1" }),
    );
  });
});

// ── useDeleteFolder ────────────────────────────────────────────────────────

describe("useDeleteFolder integration — mutation pipeline", () => {
  let deleteFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deleteFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: deleteFn,
    });
  });

  it("calls supabase DELETE for the supplied folder id", async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useDeleteFolder(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("f-1");
    });

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(false);
  });
});
