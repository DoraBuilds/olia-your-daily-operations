// @vitest-environment jsdom
/**
 * Integration tests: useLocations, useSaveLocation, useDeleteLocation
 *
 * These tests mock the Supabase client the same way the unit tests do but
 * exercise the full React Query pipeline end-to-end — query key derivation,
 * data transformation, mutation success / error paths, and cache invalidation.
 *
 * No real Supabase instance is required.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useLocations, useSaveLocation, useDeleteLocation } from "@/hooks/useLocations";

// ── Stable mock references ─────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockUsePlan = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: (...args: any[]) => mockFrom(...args),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    teamMember: {
      id: "tm-int-1",
      organization_id: "org-int-1",
      name: "Integration Tester",
      email: "integration@test.com",
      role: "Owner",
      location_ids: [],
      permissions: {},
    },
    user: { id: "tm-int-1" },
    loading: false,
  }),
}));

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => mockUsePlan(),
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

const DEFAULT_PLAN = {
  features: {
    maxLocations: 10,
    maxStaff: 200,
    maxChecklists: -1,
    aiBuilder: true,
    fileConvert: true,
    advancedReporting: true,
    exportPdf: true,
    exportCsv: true,
    multiLocation: true,
    prioritySupport: false,
  },
  org: { location_grace_period_ends_at: null, active_location_ids: [] },
};

const SAMPLE_LOCATIONS = [
  { id: "loc-1", organization_id: "org-int-1", name: "Alpha", address: "1 High St", contact_email: "a@test.com", contact_phone: null, trading_hours: null, archive_threshold_days: 90, created_at: "2026-01-01T00:00:00Z", lat: null, lng: null, place_id: null },
  { id: "loc-2", organization_id: "org-int-1", name: "Beta",  address: "2 Low St",  contact_email: "b@test.com", contact_phone: null, trading_hours: null, archive_threshold_days: 90, created_at: "2026-01-02T00:00:00Z", lat: null, lng: null, place_id: null },
];

// ── useLocations ───────────────────────────────────────────────────────────

describe("useLocations integration — React Query pipeline", () => {
  beforeEach(() => {
    mockUsePlan.mockReturnValue(DEFAULT_PLAN);
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: SAMPLE_LOCATIONS, error: null }),
    });
  });

  it("resolves data through the full React Query pipeline", async () => {
    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data.map((l) => l.id)).toEqual(["loc-1", "loc-2"]);
  });

  it("strips organization_id from each returned location", async () => {
    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (const loc of result.current.data) {
      expect(loc).not.toHaveProperty("organization_id");
    }
  });

  it("scopes results to the authenticated org — cross-org rows are filtered out", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({
        data: [
          ...SAMPLE_LOCATIONS,
          { id: "loc-other", organization_id: "org-other", name: "Outsider", address: null, contact_email: null, contact_phone: null, trading_hours: null, archive_threshold_days: 90, created_at: "2026-01-03T00:00:00Z", lat: null, lng: null, place_id: null },
        ],
        error: null,
      }),
    });

    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const ids = result.current.data.map((l) => l.id);
    expect(ids).toContain("loc-1");
    expect(ids).toContain("loc-2");
    expect(ids).not.toContain("loc-other");
  });

  it("surfaces isError = true and data empty when Supabase returns an error", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } }),
    });

    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(true);
    expect(result.current.data ?? []).toEqual([]);
  });

  it("marks all locations active while the plan limit is not exceeded", async () => {
    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isOverLimit).toBe(false);
    expect(result.current.inactiveLocations).toHaveLength(0);
    expect(result.current.activeLocations).toHaveLength(2);
  });

  it("restricts to maxLocations and populates inactiveLocations when the plan limit is breached and grace has expired", async () => {
    mockUsePlan.mockReturnValue({
      features: {
        maxLocations: 1,
        maxStaff: 5,
        maxChecklists: 5,
        aiBuilder: false,
        fileConvert: false,
        advancedReporting: false,
        exportPdf: false,
        exportCsv: false,
        multiLocation: false,
        prioritySupport: false,
      },
      org: {
        location_grace_period_ends_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        active_location_ids: ["loc-2"],
      },
    });

    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isOverLimit).toBe(true);
    expect(result.current.isGraceExpired).toBe(true);
    expect(result.current.activeLocations.map((l) => l.id)).toEqual(["loc-2"]);
    expect(result.current.inactiveLocations.map((l) => l.id)).toEqual(["loc-1"]);
  });

  it("keeps all locations visible while the grace period is still active", async () => {
    mockUsePlan.mockReturnValue({
      features: {
        maxLocations: 1,
        maxStaff: 5,
        maxChecklists: 5,
        aiBuilder: false,
        fileConvert: false,
        advancedReporting: false,
        exportPdf: false,
        exportCsv: false,
        multiLocation: false,
        prioritySupport: false,
      },
      org: {
        location_grace_period_ends_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        active_location_ids: [],
      },
    });

    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isGraceActive).toBe(true);
    expect(result.current.inactiveLocations).toHaveLength(0);
    expect(result.current.data).toHaveLength(2);
  });

  it("falls back to the oldest-created locations when active_location_ids is empty and grace has expired", async () => {
    mockUsePlan.mockReturnValue({
      features: { maxLocations: 1, maxStaff: 5, maxChecklists: 5, aiBuilder: false, fileConvert: false, advancedReporting: false, exportPdf: false, exportCsv: false, multiLocation: false, prioritySupport: false },
      org: {
        location_grace_period_ends_at: new Date(Date.now() - 1000).toISOString(),
        active_location_ids: [],
      },
    });

    const { result } = renderHook(() => useLocations(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // loc-1 was created earlier → should be the sole active location
    expect(result.current.activeLocations.map((l) => l.id)).toEqual(["loc-1"]);
    expect(result.current.inactiveLocations.map((l) => l.id)).toEqual(["loc-2"]);
  });
});

// ── useSaveLocation ────────────────────────────────────────────────────────

describe("useSaveLocation integration — mutation pipeline", () => {
  let updateFn: ReturnType<typeof vi.fn>;
  let insertFn: ReturnType<typeof vi.fn>;
  let invalidateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUsePlan.mockReturnValue(DEFAULT_PLAN);

    updateFn = vi.fn().mockReturnValue({
      eq:     vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: "loc-1" }], error: null }),
    });
    insertFn = vi.fn().mockResolvedValue({ error: null });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      update: updateFn,
      insert: insertFn,
    });
  });

  it("calls supabase INSERT for a new location (no id)", async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveLocation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id:                    "",
        name:                  "New Branch",
        address:               "3 Main St",
        contact_email:         "new@test.com",
        contact_phone:         null,
        trading_hours:         null,
        archive_threshold_days: 90,
        lat:                   null,
        lng:                   null,
        place_id:              null,
      });
    });

    expect(insertFn).toHaveBeenCalledTimes(1);
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("calls supabase UPDATE for an existing location (has id)", async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveLocation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id:                    "loc-1",
        name:                  "Updated Name",
        address:               "3 Main St",
        contact_email:         "upd@test.com",
        contact_phone:         null,
        trading_hours:         null,
        archive_threshold_days: 60,
        lat:                   null,
        lng:                   null,
        place_id:              null,
      });
    });

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("UPDATE payload does not include organization_id (RLS promotion guard)", async () => {
    const capturedPayload: any[] = [];
    updateFn = vi.fn().mockImplementation((payload) => {
      capturedPayload.push(payload);
      return {
        eq:     vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: [{ id: "loc-1" }], error: null }),
      };
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      update: updateFn,
      insert: insertFn,
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveLocation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id:                    "loc-1",
        name:                  "Updated Name",
        address:               null,
        contact_email:         null,
        contact_phone:         null,
        trading_hours:         null,
        archive_threshold_days: 90,
        lat:                   null,
        lng:                   null,
        place_id:              null,
      });
    });

    expect(capturedPayload[0]).not.toHaveProperty("organization_id");
    expect(capturedPayload[0]).toHaveProperty("name", "Updated Name");
  });

  it("throws when UPDATE returns 0 rows (RLS silently blocked)", async () => {
    updateFn = vi.fn().mockReturnValue({
      eq:     vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      update: updateFn,
      insert: insertFn,
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useSaveLocation(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          id:                    "loc-blocked",
          name:                  "Blocked",
          address:               null,
          contact_email:         null,
          contact_phone:         null,
          trading_hours:         null,
          archive_threshold_days: 90,
          lat:                   null,
          lng:                   null,
          place_id:              null,
        });
      }),
    ).rejects.toThrow(/update failed/i);
  });
});

// ── useDeleteLocation ──────────────────────────────────────────────────────

describe("useDeleteLocation integration — mutation pipeline", () => {
  let deleteFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockUsePlan.mockReturnValue(DEFAULT_PLAN);

    deleteFn = vi.fn().mockReturnValue({
      eq:     vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: "loc-1" }], error: null }),
    });

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: deleteFn,
    });
  });

  it("calls supabase DELETE and resolves without error", async () => {
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useDeleteLocation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("loc-1");
    });

    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(false);
  });

  it("throws a user-friendly error when DELETE returns 0 rows (RLS blocked)", async () => {
    deleteFn = vi.fn().mockReturnValue({
      eq:     vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: deleteFn,
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useDeleteLocation(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync("loc-blocked");
      }),
    ).rejects.toThrow(/could not delete/i);
  });
});
