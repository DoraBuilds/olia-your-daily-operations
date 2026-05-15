import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useDepartments } from "@/hooks/useDepartments";
import { DEFAULT_STAFF_DEPARTMENTS } from "@/lib/admin-repository";

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

function makeOrgQuery(orgData: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: orgData, error: null }),
    update: vi.fn().mockReturnThis(),
  };
}

const BASE_ORG = {
  id: "org-1",
  name: "Test Org",
  plan: "starter",
  plan_status: "active",
  stripe_customer_id: null,
  stripe_subscription_id: null,
  trial_ends_at: null,
  location_grace_period_ends_at: null,
  active_location_ids: null,
  departments: null,
};

beforeEach(() => {
  mockUseAuth.mockReset();
  mockFrom.mockReset();
  mockUseAuth.mockReturnValue({
    user: { id: "user-1" },
    teamMember: { id: "user-1", organization_id: "org-1" },
    loading: false,
  });
});

describe("useDepartments", () => {
  it("falls back to DEFAULT_STAFF_DEPARTMENTS when org has no departments saved", async () => {
    mockFrom.mockImplementation(() => makeOrgQuery(BASE_ORG));

    const { result } = renderHook(() => useDepartments(), { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(result.current.departments).toEqual(
        DEFAULT_STAFF_DEPARTMENTS.map(d => ({ name: d.name }))
      )
    );
  });

  it("returns stored departments from Supabase when they exist", async () => {
    const stored = [{ name: "Kitchen" }, { name: "Bar" }];
    mockFrom.mockImplementation(() => makeOrgQuery({ ...BASE_ORG, departments: stored }));

    const { result } = renderHook(() => useDepartments(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.departments).toEqual(stored));
  });

  it("calls supabase update when setDepartments is invoked with a new array", async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "organizations") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: BASE_ORG, error: null }),
          update: updateMock,
        };
      }
      return makeOrgQuery(null);
    });

    const { result } = renderHook(() => useDepartments(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.departments.length).toBeGreaterThan(0));

    const newDepts = [{ name: "Barista" }];
    act(() => {
      result.current.setDepartments(newDepts);
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith({ departments: newDepts }));
  });

  it("supports functional updater form for setDepartments", async () => {
    const stored = [{ name: "Front of House" }, { name: "Bar" }];
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "organizations") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { ...BASE_ORG, departments: stored }, error: null }),
          update: updateMock,
        };
      }
      return makeOrgQuery(null);
    });

    const { result } = renderHook(() => useDepartments(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.departments).toEqual(stored));

    act(() => {
      result.current.setDepartments(prev => prev.filter(d => d.name !== "Bar"));
    });

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({ departments: [{ name: "Front of House" }] })
    );
  });
});
