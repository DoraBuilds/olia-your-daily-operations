import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { ChecklistsTab } from "@/pages/checklists/ChecklistsTab";
import { routerFutureFlags } from "@/lib/router-future-flags";

// Unlike ChecklistsTab.test.tsx, this file leaves ItemContextMenu unmocked so the
// full "open menu -> Delete -> type DELETE -> confirm" flow can be exercised.

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useBlocker: () => ({ state: "unblocked", proceed: vi.fn(), reset: vi.fn() }),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: [{ id: "new1" }], error: null }),
      delete: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
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

// Mock heavy sub-components to prevent transitive imports (xlsx, jsPDF, etc.) from hanging jsdom.
// ItemContextMenu is intentionally left real for this file.
vi.mock("@/pages/checklists/ConvertFileModal", () => ({ ConvertFileModal: () => null }));
vi.mock("@/pages/checklists/BuildWithAIModal", () => ({ BuildWithAIModal: () => null }));
vi.mock("@/pages/checklists/ChecklistBuilderModal", () => ({ ChecklistBuilderModal: () => null }));
vi.mock("@/pages/checklists/ChecklistPreviewModal", () => ({ ChecklistPreviewModal: () => null }));
vi.mock("@/pages/checklists/MoveToFolderSheet", () => ({ MoveToFolderSheet: () => null }));
vi.mock("@/pages/checklists/CreateMenuSheet", () => ({ CreateMenuSheet: () => null }));

vi.mock("@/hooks/useLocations", () => ({
  useLocations: () => ({
    data: [
      { id: "loc-1", name: "Main Branch" },
      { id: "loc-2", name: "Terrace" },
    ],
    isLoading: false,
  }),
  useSaveLocation: () => ({ mutate: vi.fn() }),
  useDeleteLocation: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => ({
    plan: "growth",
    can: () => true,
    withinLimit: () => true,
    isActive: true,
    features: {},
  }),
}));

const deleteChecklistMock = vi.fn();
const deleteFolderMock = vi.fn();

vi.mock("@/hooks/useChecklists", () => {
  const FOLDERS = [{ id: "f1", name: "Daily Operations", parent_id: null, location_id: null }];
  const CHECKLISTS = [{
    id: "cl-2", title: "Unfinished Checklist", folder_id: null,
    location_id: null, schedule: null, sections: [],
    is_published: false,
    created_at: "2026-01-02", updated_at: "2026-01-02",
  }];
  return {
    useFolders: () => ({ data: FOLDERS, isLoading: false }),
    useChecklists: () => ({ data: CHECKLISTS, isLoading: false }),
    useSaveFolder: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}) }),
    useDeleteFolder: () => ({ mutate: deleteFolderMock }),
    useReorderFolders: () => ({ mutate: vi.fn() }),
    useSaveChecklist: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}) }),
    useDeleteChecklist: () => ({ mutate: deleteChecklistMock }),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter future={routerFutureFlags}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ChecklistsTab delete confirmation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openDeleteConfirm() {
    render(<ChecklistsTab />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText("Unfinished Checklist")).toBeInTheDocument();
    });
    const previewBtn = screen.getByTitle("Preview checklist");
    const moreBtn = previewBtn.nextElementSibling as HTMLElement;
    fireEvent.click(moreBtn);
    fireEvent.click(await screen.findByText("Delete"));
    await screen.findByText("Delete checklist?");
  }

  it("requires typing DELETE before the confirm button is enabled", async () => {
    await openDeleteConfirm();
    const confirmBtn = screen.getByText("Delete permanently").closest("button") as HTMLButtonElement;
    expect(confirmBtn).toBeDisabled();

    const input = screen.getByPlaceholderText("Type DELETE");
    fireEvent.change(input, { target: { value: "delete" } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("does not delete when confirm is clicked while disabled", async () => {
    await openDeleteConfirm();
    const confirmBtn = screen.getByText("Delete permanently").closest("button") as HTMLButtonElement;
    fireEvent.click(confirmBtn);
    expect(deleteChecklistMock).not.toHaveBeenCalled();
  });

  it("deletes the checklist once DELETE is typed and confirmed", async () => {
    await openDeleteConfirm();
    const input = screen.getByPlaceholderText("Type DELETE");
    fireEvent.change(input, { target: { value: "DELETE" } });

    const confirmBtn = screen.getByText("Delete permanently").closest("button") as HTMLButtonElement;
    fireEvent.click(confirmBtn);

    expect(deleteChecklistMock).toHaveBeenCalledWith("cl-2");
    await waitFor(() => {
      expect(screen.queryByText("Delete checklist?")).not.toBeInTheDocument();
    });
  });

  it("resets the typed text after canceling and reopening", async () => {
    await openDeleteConfirm();
    const input = screen.getByPlaceholderText("Type DELETE");
    fireEvent.change(input, { target: { value: "DELETE" } });
    fireEvent.click(screen.getByText("Cancel"));

    const previewBtn = screen.getByTitle("Preview checklist");
    const moreBtn = previewBtn.nextElementSibling as HTMLElement;
    fireEvent.click(moreBtn);
    fireEvent.click(await screen.findByText("Delete"));

    const reopenedInput = await screen.findByPlaceholderText("Type DELETE") as HTMLInputElement;
    expect(reopenedInput.value).toBe("");
    const confirmBtn = screen.getByText("Delete permanently").closest("button") as HTMLButtonElement;
    expect(confirmBtn).toBeDisabled();
  });
});
