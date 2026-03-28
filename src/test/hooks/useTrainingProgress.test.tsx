import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useTrainingProgress } from "@/hooks/useTrainingProgress";

const mockFrom = vi.fn();

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
    user: { id: "user-1" },
    session: null,
    teamMember: {
      id: "tm-1",
      organization_id: "org-1",
      name: "Training User",
      email: "training@test.com",
      role: "Owner",
      location_ids: [],
      permissions: {},
    },
    loading: false,
  }),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
  });
});

describe("useTrainingProgress", () => {
  it("loads training progress rows for the active user", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: "tp-1",
            organization_id: "org-1",
            user_id: "user-1",
            module_id: "tr1",
            completed_step_indices: [0, 1],
            is_completed: false,
            completed_at: null,
            created_at: "2026-03-27T10:00:00Z",
            updated_at: "2026-03-27T10:05:00Z",
          },
        ],
        error: null,
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });

    const { result } = renderHook(() => useTrainingProgress(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].module_id).toBe("tr1");
  });

  it("upserts normalized progress and marks a module complete when all steps are done", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      upsert,
    });

    const { result } = renderHook(() => useTrainingProgress(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.saveProgress.mutateAsync({
        moduleId: "tr1",
        completedStepIndices: [3, 1, 1, 2, 0],
        totalSteps: 4,
      });
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        user_id: "user-1",
        module_id: "tr1",
        completed_step_indices: [0, 1, 2, 3],
        is_completed: true,
        completed_at: expect.any(String),
        updated_at: expect.any(String),
      }),
      expect.objectContaining({ onConflict: "organization_id,user_id,module_id" }),
    );
  });
});
