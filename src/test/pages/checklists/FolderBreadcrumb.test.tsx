import { render, screen, fireEvent } from "@testing-library/react";
import { FolderBreadcrumb } from "@/pages/checklists/FolderBreadcrumb";
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
  { id: "f2", name: "Kitchen", type: "folder", parentId: "f1", itemCount: 1 },
  { id: "f3", name: "Prep Area", type: "folder", parentId: "f2", itemCount: 0 },
];

describe("FolderBreadcrumb", () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when currentId is null", () => {
    const { container } = render(
      <FolderBreadcrumb folders={mockFolders} currentId={null} onNavigate={onNavigate} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders 'All' root link when currentId is set", () => {
    render(<FolderBreadcrumb folders={mockFolders} currentId="f1" onNavigate={onNavigate} />);
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("shows current folder name in trail", () => {
    render(<FolderBreadcrumb folders={mockFolders} currentId="f1" onNavigate={onNavigate} />);
    expect(screen.getByText("Daily Operations")).toBeInTheDocument();
  });

  it("shows nested folder trail", () => {
    render(<FolderBreadcrumb folders={mockFolders} currentId="f2" onNavigate={onNavigate} />);
    expect(screen.getByText("Daily Operations")).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
  });

  it("shows deep nested folder trail", () => {
    render(<FolderBreadcrumb folders={mockFolders} currentId="f3" onNavigate={onNavigate} />);
    expect(screen.getByText("Daily Operations")).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Prep Area")).toBeInTheDocument();
  });

  it("clicking 'All' calls onNavigate with null", () => {
    render(<FolderBreadcrumb folders={mockFolders} currentId="f1" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("All"));
    expect(onNavigate).toHaveBeenCalledWith(null);
  });

  it("clicking a folder in trail calls onNavigate with that folder's id", () => {
    render(<FolderBreadcrumb folders={mockFolders} currentId="f2" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Daily Operations"));
    expect(onNavigate).toHaveBeenCalledWith("f1");
  });

  it("clicking current folder calls onNavigate with its id", () => {
    render(<FolderBreadcrumb folders={mockFolders} currentId="f2" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByText("Kitchen"));
    expect(onNavigate).toHaveBeenCalledWith("f2");
  });

  it("renders without crashing with empty folders array", () => {
    render(<FolderBreadcrumb folders={[]} currentId="f1" onNavigate={onNavigate} />);
    expect(screen.getByText("All")).toBeInTheDocument();
  });
});
