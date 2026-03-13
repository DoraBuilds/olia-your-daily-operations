import { render, screen, fireEvent } from "@testing-library/react";
import { MoveToFolderSheet } from "@/pages/checklists/MoveToFolderSheet";
import type { FolderItem } from "@/pages/checklists/types";

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
      then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: [], error: null }))),
    }),
  },
}));

const mockFolders: FolderItem[] = [
  { id: "f1", name: "Daily Operations", type: "folder", parentId: null, itemCount: 3 },
  { id: "f2", name: "Health & Safety", type: "folder", parentId: null, itemCount: 2 },
  { id: "f3", name: "Kitchen", type: "folder", parentId: "f1", itemCount: 1 },
];

describe("MoveToFolderSheet", () => {
  const onMove = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    render(
      <MoveToFolderSheet
        folders={mockFolders}
        currentFolderId={null}
        onMove={onMove}
        onClose={onClose}
      />
    );
    expect(screen.getByText("Move to folder")).toBeInTheDocument();
  });

  it("shows Root option", () => {
    render(
      <MoveToFolderSheet
        folders={mockFolders}
        currentFolderId={null}
        onMove={onMove}
        onClose={onClose}
      />
    );
    expect(screen.getByText("Root (no folder)")).toBeInTheDocument();
  });

  it("shows all folders", () => {
    render(
      <MoveToFolderSheet
        folders={mockFolders}
        currentFolderId={null}
        onMove={onMove}
        onClose={onClose}
      />
    );
    expect(screen.getByText("Daily Operations")).toBeInTheDocument();
    expect(screen.getByText("Health & Safety")).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
  });

  it("excludes current folder from list", () => {
    render(
      <MoveToFolderSheet
        folders={mockFolders}
        currentFolderId="f1"
        onMove={onMove}
        onClose={onClose}
      />
    );
    expect(screen.queryByText("Daily Operations")).not.toBeInTheDocument();
    expect(screen.getByText("Health & Safety")).toBeInTheDocument();
  });

  it("has a search input", () => {
    render(
      <MoveToFolderSheet
        folders={mockFolders}
        currentFolderId={null}
        onMove={onMove}
        onClose={onClose}
      />
    );
    expect(screen.getByPlaceholderText("Search folders")).toBeInTheDocument();
  });

  it("search filters folder list", async () => {
    render(
      <MoveToFolderSheet
        folders={mockFolders}
        currentFolderId={null}
        onMove={onMove}
        onClose={onClose}
      />
    );
    const searchInput = screen.getByPlaceholderText("Search folders");
    fireEvent.change(searchInput, { target: { value: "Kitchen" } });
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.queryByText("Health & Safety")).not.toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    render(
      <MoveToFolderSheet
        folders={mockFolders}
        currentFolderId={null}
        onMove={onMove}
        onClose={onClose}
      />
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]); // X button
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking a folder calls onMove with folder id and onClose", () => {
    render(
      <MoveToFolderSheet
        folders={mockFolders}
        currentFolderId={null}
        onMove={onMove}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText("Daily Operations"));
    expect(onMove).toHaveBeenCalledWith("f1");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking Root calls onMove with null", () => {
    render(
      <MoveToFolderSheet
        folders={mockFolders}
        currentFolderId="f1"
        onMove={onMove}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByText("Root (no folder)"));
    expect(onMove).toHaveBeenCalledWith(null);
  });

  it("renders with empty folders array", () => {
    render(
      <MoveToFolderSheet
        folders={[]}
        currentFolderId={null}
        onMove={onMove}
        onClose={onClose}
      />
    );
    expect(screen.getByText("Root (no folder)")).toBeInTheDocument();
  });
});
