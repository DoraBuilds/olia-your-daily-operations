import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { usePlan } from "@/hooks/usePlan";

const mockUseAuth = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

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

function makeTeamMembersQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

function makeOrganizationsQuery(result: { data: unknown; error: unknown }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  };
}

beforeEach(() => {
  mockUseAuth.mockReset();
  mockFrom.mockReset();
  mockUseAuth.mockReturnValue({
    user: null,
    teamMember: null,
    loading: false,
  });
  mockFrom.mockImplementation((table: string) => {
    if (table === "team_members") {
      return makeTeamMembersQuery({ data: null, error: null });
    }
    if (table === "organizations") {
      return makeOrganizationsQuery({ data: null, error: null });
    }
    throw new Error(`Unexpected table: ${table}`);
  });
});

describe("usePlan", () => {
  it("returns starter when no authenticated user exists", async () => {
    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.plan).toBe("starter");
    expect(result.current.billingUnavailable).toBe(false);
  });

  it("resolves the organization from teamMember when available", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      teamMember: { id: "user-1", organization_id: "org-1" },
      loading: false,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "organizations") {
        return makeOrganizationsQuery({
          data: {
            id: "org-1",
            name: "Little Fern",
            plan: "growth",
            plan_status: "active",
            stripe_customer_id: "cus_123",
            stripe_subscription_id: "sub_123",
            trial_ends_at: null,
            location_grace_period_ends_at: null,
            active_location_ids: [],
          },
          error: null,
        });
      }
      return makeTeamMembersQuery({ data: null, error: null });
    });

    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.plan).toBe("growth");
    expect(result.current.resolvedPlan).toBe("growth");
    expect(result.current.organizationId).toBe("org-1");
    expect(result.current.billingUnavailable).toBe(false);
  });

  it("falls back to the persisted team_members row when AuthContext is missing organization_id", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      teamMember: null,
      loading: false,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "team_members") {
        return makeTeamMembersQuery({
          data: { organization_id: "org-1" },
          error: null,
        });
      }
      return makeOrganizationsQuery({
        data: {
          id: "org-1",
          name: "Little Fern",
          plan: "growth",
          plan_status: "incomplete",
          stripe_customer_id: "cus_123",
          stripe_subscription_id: "sub_123",
          trial_ends_at: null,
          location_grace_period_ends_at: null,
          active_location_ids: [],
        },
        error: null,
      });
    });

    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.plan).toBe("growth");
    expect(result.current.planStatus).toBe("incomplete");
    expect(result.current.organizationId).toBe("org-1");
  });

  it("marks billing as unavailable instead of silently trusting starter on org query failure", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      teamMember: { id: "user-1", organization_id: "org-1" },
      loading: false,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "organizations") {
        return makeOrganizationsQuery({
          data: null,
          error: { message: "permission denied" },
        });
      }
      return makeTeamMembersQuery({ data: null, error: null });
    });

    const { result } = renderHook(() => usePlan(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.plan).toBe("starter");
    expect(result.current.resolvedPlan).toBeNull();
    expect(result.current.billingUnavailable).toBe(true);
  });
});
